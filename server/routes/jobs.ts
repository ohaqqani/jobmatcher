import { Router } from "express";
import { insertJobDescriptionSchema } from "@shared/schemas";
import { storage } from "../storage";
import { analyzeJobDescriptionWithAI } from "../services/jobs";
import { generateTextHash } from "../services/lib/hash";
import { isRateLimitError } from "../services/lib/llmRetry";

const router = Router();

/**
 * Create job description
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
    const existingJobDesc = await storage.getJobDescriptionByHash(contentHash);
    if (existingJobDesc) {
      console.log(
        `Duplicate job description detected, returning existing record: ${existingJobDesc.id}`
      );
      return res.json(existingJobDesc);
    }

    // Validate and create new job description with normalized values
    const validatedData = insertJobDescriptionSchema.parse({
      contentHash,
      title: normalizedTitle,
      description: normalizedDescription,
    });
    const jobDesc = await storage.createJobDescription(validatedData);
    console.log(`Created new job description: ${jobDesc.id}`);
    res.json(jobDesc);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * Analyze job description with AI
 */
router.post("/api/job-descriptions/:id/analyze", async (req, res) => {
  try {
    const { id } = req.params;
    const jobDesc = await storage.getJobDescription(id);

    if (!jobDesc) {
      return res.status(404).json({ message: "Job description not found" });
    }

    const requiredSkills = await analyzeJobDescriptionWithAI(jobDesc.title, jobDesc.description);
    const updatedJobDesc = await storage.analyzeJobDescription(id, requiredSkills);

    res.json(updatedJobDesc);
  } catch (error) {
    if (isRateLimitError(error)) {
      // Add to queue for retry
      const { id } = req.params;
      await storage.addToJobAnalysisQueue(id);
      return res.status(429).json({
        message: "Rate limit exceeded, job analysis queued for retry",
        status: "queued",
        jobDescriptionId: id,
      });
    }
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
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
