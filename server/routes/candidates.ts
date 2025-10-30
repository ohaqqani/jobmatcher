import { Router } from "express";
import type { InsertCandidate } from "@shared/schemas";
import {
  anonymizeResumeAsHTML,
  extractCandidateInfo,
  extractFilesFromUploads,
  extractTextFromFile,
} from "../services/candidates";
import { upload } from "../services/lib/fileUpload";
import { storage } from "../storage";
import { generateContentHash } from "../services/lib/hash";
import { isRateLimitError } from "../services/lib/llmRetry";

const router = Router();

// Configuration constants
const CONFIG = {
  MAX_FILES: 100,
  PROCESSING_TIMEOUT_MS: 30000,
  MIN_TEXT_LENGTH: 10,
} as const;

/**
 * Wraps a promise with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

type ProcessResult = {
  fileName: string;
  fileIndex: number;
  status: "completed" | "failed" | "skipped";
  error?: string;
  resumeId?: string;
  candidateId?: string;
  candidateInfo?: Omit<InsertCandidate, "resumeId"> & {
    skills_comma_separated?: string; // Extra field for UI display
  };
  resumePlainText?: string;
  publicResumeHtml?: string;
};

/**
 * Process a single resume file
 */
async function processResumeFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  index: number,
  totalFiles: number
): Promise<ProcessResult> {
  console.log(
    `Processing file ${index + 1}/${totalFiles}: ${originalname}, size: ${buffer.length}, type: ${mimetype}`
  );

  // Generate content hash for deduplication
  const contentHash = generateContentHash(buffer);
  console.log(`Generated content hash: ${contentHash.substring(0, 16)}... for ${originalname}`);

  // Check if this exact resume has been processed before
  const existingResume = await storage.getResumeByHash(contentHash);
  if (existingResume) {
    console.log(`Duplicate resume detected for ${originalname}, skipping processing`);

    // Retrieve existing candidate data
    const existingCandidate = await storage.getCandidateByResumeId(existingResume.id);

    if (existingCandidate) {
      return {
        resumeId: existingResume.id,
        candidateId: existingCandidate.id,
        candidateInfo: {
          firstName: existingCandidate.firstName,
          lastName: existingCandidate.lastName,
          lastInitial: existingCandidate.lastInitial,
          email: existingCandidate.email,
          phone: existingCandidate.phone || undefined,
          skills: existingCandidate.skills as string[],
          skills_comma_separated: (existingCandidate.skills as string[]).join(", "),
          experience: existingCandidate.experience || undefined,
        },
        fileName: originalname,
        resumePlainText: existingResume.content,
        publicResumeHtml: existingResume.publicResumeHtml || undefined,
        status: "skipped",
        fileIndex: index + 1,
      };
    }
  }

  // Extract text from file with timeout protection
  const content = await withTimeout(
    extractTextFromFile(buffer, mimetype),
    CONFIG.PROCESSING_TIMEOUT_MS,
    "File processing timeout after 30 seconds"
  );
  console.log(`Extracted text length: ${content.length} characters for ${originalname}`);

  // Create resume record first with content
  const resume = await storage.createResume({
    contentHash,
    fileName: originalname,
    fileSize: buffer.length,
    fileType: mimetype,
    content,
    publicResumeHtml: null, // Will be updated when anonymization completes
  });

  // Extract candidate information
  let candidateInfo:
    | (Omit<InsertCandidate, "resumeId"> & { skills_comma_separated?: string })
    | null = null;
  let candidateId: string | null = null;
  let candidateExtractionQueued = false;

  try {
    const extractedInfo = await extractCandidateInfo(content);
    candidateInfo = {
      firstName: extractedInfo.firstName,
      lastName: extractedInfo.lastName,
      lastInitial: extractedInfo.lastInitial,
      email: extractedInfo.email,
      phone: extractedInfo.phone,
      skills: extractedInfo.skills,
      skills_comma_separated: extractedInfo.skills_comma_separated,
      experience: extractedInfo.experience,
    };
    console.log(
      `Extracted candidate info for: ${candidateInfo.firstName} ${candidateInfo.lastName} from ${originalname}`
    );

    // Create candidate record
    const candidate = await storage.createCandidate({
      resumeId: resume.id,
      firstName: candidateInfo.firstName,
      lastName: candidateInfo.lastName,
      lastInitial: candidateInfo.lastInitial,
      email: candidateInfo.email,
      phone: candidateInfo.phone,
      skills: candidateInfo.skills,
      experience: candidateInfo.experience,
    });
    candidateId = candidate.id;
  } catch (error) {
    if (isRateLimitError(error)) {
      console.log(`Candidate extraction rate limited, adding to queue for resume ${resume.id}`);
      await storage.addToCandidateExtractionQueue(resume.id);
      candidateExtractionQueued = true;
    } else {
      throw error;
    }
  }

  // Generate anonymized HTML
  let publicResumeHtml: string | null = null;
  let anonymizationQueued = false;

  try {
    publicResumeHtml = await anonymizeResumeAsHTML(content);
    console.log(`Generated anonymized HTML resume for ${originalname}`);

    // Update resume with anonymized HTML
    await storage.updateResumeHtml(resume.id, publicResumeHtml);
  } catch (error) {
    if (isRateLimitError(error)) {
      console.log(`Resume anonymization rate limited, adding to queue for resume ${resume.id}`);
      await storage.addToResumeAnonymizationQueue(resume.id);
      anonymizationQueued = true;
    } else {
      throw error;
    }
  }

  // Determine status
  let status: "completed" | "failed" | "skipped" = "completed";
  if (candidateExtractionQueued && anonymizationQueued) {
    status = "completed"; // Still return completed even if queued
  } else if (candidateExtractionQueued || anonymizationQueued) {
    status = "completed"; // Still return completed even if partially queued
  }

  return {
    resumeId: resume.id,
    candidateId: candidateId || undefined,
    candidateInfo: candidateInfo || undefined,
    fileName: originalname,
    resumePlainText: content,
    publicResumeHtml: publicResumeHtml || undefined,
    status,
    fileIndex: index + 1,
  };
}

/**
 * Process a file with comprehensive error handling
 */
async function processFileWithErrorHandling(
  item: { buffer: Buffer; originalname: string; mimetype: string },
  index: number,
  totalFiles: number
): Promise<ProcessResult> {
  const { buffer, originalname, mimetype } = item;
  try {
    return await processResumeFile(buffer, originalname, mimetype, index, totalFiles);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to process file ${originalname}:`, {
      error: errorMessage,
      fileIndex: index + 1,
      fileName: originalname,
      fileSize: buffer.length,
      mimeType: mimetype,
    });

    return {
      fileName: originalname,
      status: "failed",
      error: errorMessage,
      fileIndex: index + 1,
    };
  }
}

/**
 * Format the response summary from processing results
 */
function formatResponseSummary(results: ProcessResult[], totalFiles: number) {
  const successfulUploads = results.filter((r) => r.status === "completed");
  const failedUploads = results.filter((r) => r.status === "failed");
  const skippedUploads = results.filter((r) => r.status === "skipped");

  console.log(
    `Upload batch completed: ${successfulUploads.length} successful, ${skippedUploads.length} skipped (duplicates), ${failedUploads.length} failed out of ${totalFiles} total files`
  );

  if (failedUploads.length > 0) {
    console.error(
      "Failed files:",
      failedUploads.map((f) => ({ fileName: f.fileName, error: f.error }))
    );
  }

  if (skippedUploads.length > 0) {
    console.log(
      "Skipped duplicate files:",
      skippedUploads.map((f) => f.fileName)
    );
  }

  return {
    results,
    summary: {
      totalFiles,
      successfulUploads: successfulUploads.length,
      skippedUploads: skippedUploads.length,
      failedUploads: failedUploads.length,
      message: `Successfully processed ${successfulUploads.length} out of ${totalFiles} files (${skippedUploads.length} duplicates skipped)`,
    },
  };
}

/**
 * Upload and process resumes
 */
router.post("/api/resumes/upload", upload.array("file", CONFIG.MAX_FILES), async (req, res) => {
  try {
    // Validate request
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Extract files from uploads (handles ZIP archives)
    const allFiles = await extractFilesFromUploads(req.files);

    if (allFiles.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid files found in upload (PDF, DOC, DOCX only)" });
    }

    console.log(`Processing ${allFiles.length} files in parallel...`);

    // Process all files in parallel
    const results = await Promise.all(
      allFiles.map((item, index) => processFileWithErrorHandling(item, index, allFiles.length))
    );

    console.log(`Upload processing complete. Results: ${results.length} items`);

    // Format and return response
    res.json(formatResponseSummary(results, allFiles.length));
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
