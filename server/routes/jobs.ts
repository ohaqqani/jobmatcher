import { Router } from "express";
import { insertJobDescriptionSchema } from "@shared/schemas";
import { storage } from "../storage";
import { analyzeJobDescriptionWithAI } from "../services/jobs";
import { generateTextHash } from "../services/lib/hash";
import { isRateLimitError } from "../services/lib/llmRetry";

const router = Router();

/**
 * Create and analyze job description
 * This endpoint creates a job description and immediately analyzes it with AI.
 * Returns consistent response structure with analysis status.
 */
router.post("/api/job-descriptions", async (req, res) => {
  try {
    const { title, description } = req.body;

    // Normalize inputs by trimming whitespace
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    // Generate content hash from normalized description only
    const contentHash = generateTextHash(normalizedDescription);
    console.log(`Generated job description hash: ${contentHash.substring(0, 16)}...`);

    // Check if this exact job description already exists
    let jobDesc = await storage.getJobDescriptionByHash(contentHash);
    if (jobDesc) {
      console.log(`Duplicate job description detected, found existing record: ${jobDesc.id}`);

      // If duplicate has already been analyzed, return it immediately
      if (jobDesc.requiredSkills && jobDesc.requiredSkills.length > 0) {
        console.log(`Job already analyzed with ${jobDesc.requiredSkills.length} skills`);
        return res.json({
          job: jobDesc,
          analysisStatus: "complete",
        });
      }

      // If duplicate hasn't been analyzed yet, analyze it now
      console.log(`Job needs analysis, analyzing now...`);
    } else {
      // Validate and create new job description with normalized values
      const validatedData = insertJobDescriptionSchema.parse({
        contentHash,
        title: normalizedTitle,
        description: normalizedDescription,
      });
      jobDesc = await storage.createJobDescription(validatedData);
      console.log(`Created new job description: ${jobDesc.id}`);
    }

    // Analyze the job description
    try {
      const requiredSkills = await analyzeJobDescriptionWithAI(
        normalizedTitle,
        normalizedDescription
      );
      const analyzedJobDesc = await storage.analyzeJobDescription(jobDesc.id, requiredSkills);
      console.log(`Successfully analyzed job with ${requiredSkills.length} skills`);

      return res.json({
        job: analyzedJobDesc,
        analysisStatus: "complete",
      });
    } catch (error) {
      if (isRateLimitError(error)) {
        // Add to queue for retry
        console.log(`Rate limit hit, queueing job ${jobDesc.id} for analysis`);
        await storage.addToJobAnalysisQueue(jobDesc.id);
        return res.json({
          job: jobDesc,
          analysisStatus: "queued",
          message:
            "Job created successfully! Analysis is queued due to high demand and will complete automatically within a few minutes.",
        });
      }
      // Re-throw other errors to be caught by outer catch block
      throw error;
    }
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * Get job description
 */
router.get("/api/job-descriptions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const jobDesc = await storage.getJobDescription(id);

    if (!jobDesc) {
      return res.status(404).json({ message: "Job description not found" });
    }

    res.json(jobDesc);
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * Clear all data for testing (development only)
 */
router.delete("/api/clear-data", async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({ message: "Only available in development" });
  }

  try {
    // Clear all storage - only works with MemStorage
    // Type assertion since this is development-only code
    const memStorage = storage as unknown as {
      jobDescriptions?: Map<string, unknown>;
      resumes?: Map<string, unknown>;
      candidates?: Map<string, unknown>;
      matchResults?: Map<string, unknown>;
    };

    if (memStorage.jobDescriptions instanceof Map) {
      memStorage.jobDescriptions.clear();
      memStorage.resumes?.clear();
      memStorage.candidates?.clear();
      memStorage.matchResults?.clear();
    }

    console.log("All data cleared for testing");
    res.json({ message: "All data cleared successfully" });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
