import { PublicCandidateProfile } from "@shared/schemas";
import { Router } from "express";
import { calculateMatchScore } from "../services/matching";
import { storage } from "../storage";
import { generateTextHash } from "../services/lib/hash";

const router = Router();

/**
 * Process matching for job description with internal candidates
 */
router.post("/api/job-descriptions/:jobId/match", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { resumeIds } = req.body;

    if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
      return res.status(400).json({ message: "No resume IDs provided" });
    }

    const jobDesc = await storage.getJobDescription(jobId);
    if (!jobDesc) {
      return res.status(404).json({ message: "Job description not found" });
    }

    const candidates = await storage.getCandidatesByResumeIds(resumeIds);
    console.log(`Found ${candidates.length} candidates for ${resumeIds.length} resume IDs`);

    console.log(`Processing candidate matching in parallel for ${candidates.length} candidates...`);

    // Process all candidates concurrently
    const candidatePromises = candidates.map(async (candidate) => {
      try {
        // Get resume to access content hash
        const resume = await storage.getResume(candidate.resumeId);
        if (!resume) {
          throw new Error(`Resume not found for candidate ${candidate.id}`);
        }

        // Check if match already exists by content hashes
        const existingMatch = await storage.getMatchResultByHashes(
          resume.contentHash,
          jobDesc.contentHash
        );

        if (existingMatch) {
          console.log(
            `Match already exists for resume hash ${resume.contentHash.substring(0, 16)}... and job hash ${jobDesc.contentHash.substring(0, 16)}..., reusing cached result`
          );
          return existingMatch;
        }

        console.log(
          `Creating new match for candidate ${candidate.firstName} ${candidate.lastName} (${candidate.id})`
        );

        // Calculate match score with fuzzy matching
        const matchData = await calculateMatchScore(
          candidate.skills || [],
          jobDesc.requiredSkills || [],
          candidate.experience || undefined,
          resume.content
        );

        console.log(
          `Match score for ${candidate.firstName} ${candidate.lastName}: ${matchData.score}%`
        );
        console.log(
          `Scorecard for ${candidate.firstName} ${candidate.lastName}:`,
          JSON.stringify(matchData.scorecard, null, 2)
        );

        // Create match result with content hashes
        const matchResult = await storage.createMatchResult({
          resumeContentHash: resume.contentHash,
          jobContentHash: jobDesc.contentHash,
          jobDescriptionId: jobId,
          candidateId: candidate.id,
          matchScore: matchData.score,
          scorecard: matchData.scorecard,
          matchingSkills: matchData.matchingSkills,
          analysis: matchData.analysis,
        });

        console.log(
          `Created match result for ${candidate.firstName} ${candidate.lastName}:`,
          JSON.stringify(matchResult, null, 2)
        );

        return matchResult;
      } catch (error) {
        console.error(
          `Failed to process match for candidate ${candidate.firstName} ${candidate.lastName}:`,
          error
        );
        // Return a failed match result instead of throwing
        return {
          jobDescriptionId: jobId,
          candidateId: candidate.id,
          matchScore: 0,
          matchingSkills: [],
          analysis: `Failed to calculate match: ${error instanceof Error ? error.message : "Unknown error"}`,
          error: true,
        };
      }
    });

    // Wait for all candidate matching to complete
    const matchResults = await Promise.all(candidatePromises);

    console.log(`Candidate matching complete. Processed ${matchResults.length} matches`);
    res.json({ matchResults });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * Process matching for job description with provided public candidate profiles
 */
router.post("/api/job-descriptions/:jobId/match/public", async (req, res) => {
  try {
    const { jobId } = req.params;
    const { candidates }: { candidates: PublicCandidateProfile[] } = req.body;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ message: "No candidate profiles provided" });
    }

    const jobDesc = await storage.getJobDescription(jobId);
    if (!jobDesc) {
      return res.status(404).json({ message: "Job description not found" });
    }

    console.log(`Processing candidate matching in parallel for ${candidates.length} candidates...`);

    // Process all candidates concurrently
    const candidatePromises = candidates.map(async (candidate) => {
      try {
        console.log(
          `Processing public candidate ${candidate.firstName} ${candidate.lastInitial} (${candidate.id})`
        );

        // Note: Public candidates don't have stored resumes, so we can't use hash-based caching
        // Each public match request will calculate fresh results

        // Calculate match score with fuzzy matching
        const matchData = await calculateMatchScore(
          candidate.skills || [],
          jobDesc.requiredSkills || [],
          candidate.experience || undefined,
          candidate.publicResumeHtml || undefined
        );

        console.log(
          `Match score for ${candidate.firstName} ${candidate.lastInitial}: ${matchData.score}%`
        );
        console.log(
          `Scorecard for ${candidate.firstName} ${candidate.lastInitial}:`,
          JSON.stringify(matchData.scorecard, null, 2)
        );

        // For public candidates, we calculate a temporary hash from their profile data for caching
        const profileHash = generateTextHash(
          JSON.stringify({
            skills: candidate.skills,
            experience: candidate.experience,
            html: candidate.publicResumeHtml,
          })
        );

        // Create match result with content hashes
        const matchResult = await storage.createMatchResult({
          resumeContentHash: profileHash,
          jobContentHash: jobDesc.contentHash,
          jobDescriptionId: jobId,
          candidateId: candidate.id,
          matchScore: matchData.score,
          scorecard: matchData.scorecard,
          matchingSkills: matchData.matchingSkills,
          analysis: matchData.analysis,
        });

        console.log(
          `Created match result for ${candidate.firstName} ${candidate.lastInitial}:`,
          JSON.stringify(matchResult, null, 2)
        );

        return matchResult;
      } catch (error) {
        console.error(
          `Failed to process match for candidate ${candidate.firstName} ${candidate.lastInitial}:`,
          error
        );
        // Return a failed match result instead of throwing
        return {
          jobDescriptionId: jobId,
          candidateId: candidate.id,
          matchScore: 0,
          matchingSkills: [],
          analysis: `Failed to calculate match: ${error instanceof Error ? error.message : "Unknown error"}`,
          error: true,
        };
      }
    });

    // Wait for all candidate matching to complete
    const matchResults = await Promise.all(candidatePromises);

    console.log(`Candidate matching complete. Processed ${matchResults.length} matches`);
    res.json({ matchResults });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * Get matching results for a job
 */
router.get("/api/job-descriptions/:jobId/results", async (req, res) => {
  try {
    const { jobId } = req.params;
    const results = await storage.getMatchResultsByJobId(jobId);

    // Transform results to include publicResumeHtml field for anonymized access
    const transformedResults = results.map((result) => ({
      ...result,
      publicCandidateProfile: {
        id: result.id,
        firstName: result.firstName,
        lastInitial: result.lastInitial,
        skills: result.skills || [],
        experience: result.experience || "",
        publicResumeHtml: result.resume.publicResumeHtml || "",
      } as PublicCandidateProfile,
    }));

    res.json(transformedResults);
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
