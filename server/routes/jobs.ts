import { Router } from "express";
import { insertJobDescriptionSchema } from "@shared/schemas";
import { storage } from "../storage";
import { analyzeJobDescriptionWithAI } from "../services/jobs";

const router = Router();

/**
 * Create job description
 */
router.post("/api/job-descriptions", async (req, res) => {
  try {
    const validatedData = insertJobDescriptionSchema.parse(req.body);
    const jobDesc = await storage.createJobDescription(validatedData);
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
    // Clear all storage
    (storage as any).jobDescriptions.clear();
    (storage as any).resumes.clear();
    (storage as any).candidates.clear();
    (storage as any).matchResults.clear();

    console.log("All data cleared for testing");
    res.json({ message: "All data cleared successfully" });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
