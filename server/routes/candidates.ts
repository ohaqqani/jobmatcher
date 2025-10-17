import { Router } from "express";
import {
  anonymizeResumeAsHTML,
  extractCandidateInfo,
  extractFilesFromZip,
  extractTextFromFile,
} from "../services/candidates";
import { upload } from "../services/lib/fileUpload";
import { storage } from "../storage";

const router = Router();

/**
 * Upload and process resumes
 */
router.post("/api/resumes/upload", upload.array("file", 100), async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Helper to flatten files from zips and normal files (parallelized)
    const extractFilesFromUploads = async (files: Express.Multer.File[]) => {
      // Process all files in parallel
      const extractionPromises = files.map(async (file) => {
        const ext = file.originalname.split(".").pop()?.toLowerCase();
        if (
          file.mimetype === "application/zip" ||
          file.mimetype === "application/x-zip-compressed" ||
          (file.mimetype === "application/octet-stream" && ext === "zip")
        ) {
          // Unzip and extract valid files
          const zipFiles = await extractFilesFromZip(file.buffer);
          return zipFiles.map((zipFile) => ({
            file,
            buffer: zipFile.buffer,
            originalname: zipFile.originalname,
            mimetype: zipFile.mimetype,
          }));
        } else {
          return [
            {
              file,
              buffer: file.buffer,
              originalname: file.originalname,
              mimetype: file.mimetype,
            },
          ];
        }
      });

      // Wait for all extractions to complete and flatten the results
      const extractedArrays = await Promise.all(extractionPromises);
      return extractedArrays.flat();
    };

    const allFiles = await extractFilesFromUploads(req.files);

    if (allFiles.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid files found in upload (PDF, DOC, DOCX only)" });
    }

    console.log(`Processing ${allFiles.length} files in parallel...`);

    // Process all files concurrently with comprehensive error handling
    const filePromises = allFiles.map(async (item, index) => {
      const { buffer, originalname, mimetype } = item;
      try {
        console.log(
          `Processing file ${index + 1}/${allFiles.length}: ${originalname}, size: ${buffer.length}, type: ${mimetype}`
        );
        // Extract text from file with timeout protection
        const extractionPromise = extractTextFromFile(buffer, mimetype);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("File processing timeout after 30 seconds")), 30000);
        });

        let content: string;
        try {
          content = await Promise.race([extractionPromise, timeoutPromise]);
          console.log(`Extracted text length: ${content.length} characters for ${originalname}`);
        } catch (extractError) {
          console.error(`Failed to extract text from ${originalname}:`, extractError);
          throw new Error(
            `Text extraction failed: ${extractError instanceof Error ? extractError.message : "Unknown extraction error"}`
          );
        }

        // Extract candidate information and generate anonymized HTML in parallel
        let candidateInfo;
        let publicResumeHtml: string;
        try {
          // Run both LLM calls in parallel for better performance
          const [extractedInfo, anonymizedHtml] = await Promise.all([
            extractCandidateInfo(content),
            anonymizeResumeAsHTML(content),
          ]);

          candidateInfo = extractedInfo;
          publicResumeHtml = anonymizedHtml;

          console.log(
            `Extracted candidate info for: ${candidateInfo.firstName} ${candidateInfo.lastName} from ${originalname}`
          );
          console.log(
            `Generated anonymized HTML resume for ${candidateInfo.firstName} ${candidateInfo.lastInitial}`
          );
        } catch (aiError) {
          console.error(`Failed to process resume with AI from ${originalname}:`, aiError);
          throw new Error(
            `AI processing failed: ${aiError instanceof Error ? aiError.message : "Failed to analyze resume content"}`
          );
        }

        // Create resume record with both original content and anonymized HTML
        let resume;
        try {
          resume = await storage.createResume({
            fileName: originalname,
            fileSize: buffer.length,
            fileType: mimetype,
            content,
            publicResumeHtml: publicResumeHtml,
          });
        } catch (resumeError) {
          console.error(`Failed to create resume record for ${originalname}:`, resumeError);
          throw new Error(
            `Database error: ${resumeError instanceof Error ? resumeError.message : "Failed to save resume"}`
          );
        }

        // Create candidate record
        let candidate;
        try {
          candidate = await storage.createCandidate({
            resumeId: resume.id,
            ...candidateInfo,
          });
        } catch (candidateError) {
          console.error(`Failed to create candidate record for ${originalname}:`, candidateError);
          throw new Error(
            `Database error: ${candidateError instanceof Error ? candidateError.message : "Failed to save candidate"}`
          );
        }

        return {
          resumeId: resume.id,
          candidateId: candidate.id,
          candidateInfo: candidateInfo,
          fileName: originalname,
          resumePlainText: content,
          publicResumeHtml: publicResumeHtml,
          status: "completed",
          fileIndex: index + 1,
        };
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
    });

    // Wait for all files to be processed
    const results = await Promise.all(filePromises);

    // Categorize results
    const successfulUploads = results.filter((r) => r?.status === "completed");
    const failedUploads = results.filter((r) => r?.status === "failed");

    console.log(
      `Upload batch completed: ${successfulUploads.length} successful, ${failedUploads.length} failed out of ${allFiles.length} total files`
    );

    if (failedUploads.length > 0) {
      console.error(
        "Failed files:",
        failedUploads.map((f) => ({ fileName: f?.fileName, error: f?.error }))
      );
    }

    console.log(`Upload processing complete. Results: ${results.length} items`);
    res.json({
      results,
      summary: {
        totalFiles: allFiles.length,
        successfulUploads: successfulUploads.length,
        failedUploads: failedUploads.length,
        message: `Successfully processed ${successfulUploads.length} out of ${allFiles.length} files`,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
