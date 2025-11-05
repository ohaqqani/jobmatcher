import { PublicCandidateProfile } from "@shared/schemas";
import { Router } from "express";
import { calculateMatchScore } from "../services/matching";
import { storage } from "../storage";
import { generateTextHash } from "../services/lib/hash";
import { isRateLimitError } from "../services/lib/llmRetry";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Process matching for job description with internal candidates
 */
router.post("/api/job-descriptions/:jobId/match", async (req, res) => {
  try {
    const requestStartTime = Date.now();
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
    logger.info(`Found ${candidates.length} candidates for ${resumeIds.length} resume IDs`);

    logger.info(`Processing candidate matching in parallel for ${candidates.length} candidates...`);

    // Batch fetch all resumes at once for performance
    const candidateResumeIds = candidates.map((c) => c.resumeId);
    const resumes = await storage.getResumesByIds(candidateResumeIds);
    const resumeMap = new Map(resumes.map((r) => [r.id, r]));

    // Batch fetch all existing matches at once for performance
    const hashPairs = candidates.map((candidate) => {
      const resume = resumeMap.get(candidate.resumeId);
      if (!resume) {
        throw new Error(`Resume not found for candidate ${candidate.id}`);
      }
      return {
        resumeHash: resume.contentHash,
        jobHash: jobDesc.contentHash,
      };
    });

    const existingMatchRecords = await storage.getMatchResultsByHashPairs(hashPairs);
    const matchMap = new Map(
      existingMatchRecords.map((m) => [`${m.resumeContentHash}:${m.jobContentHash}`, m])
    );

    logger.info(
      `Found ${existingMatchRecords.length} existing matches, will calculate ${candidates.length - existingMatchRecords.length} new matches`
    );

    // Process all candidates concurrently (LLM calls in parallel)
    const llmStartTime = Date.now();
    const candidatePromises = candidates.map(async (candidate) => {
      try {
        // Get resume from pre-fetched map
        const resume = resumeMap.get(candidate.resumeId);
        if (!resume) {
          throw new Error(`Resume not found for candidate ${candidate.id}`);
        }

        // Check if match already exists using pre-fetched map
        const matchKey = `${resume.contentHash}:${jobDesc.contentHash}`;
        const existingMatch = matchMap.get(matchKey);

        if (existingMatch) {
          logger.debug(
            `Match already exists for resume hash ${resume.contentHash.substring(0, 16)}... and job hash ${jobDesc.contentHash.substring(0, 16)}..., reusing cached result`
          );
          return { type: "existing", data: existingMatch };
        }

        logger.debug(
          `Creating new match for candidate ${candidate.firstName} ${candidate.lastName} (${candidate.id})`
        );

        // Calculate match score with fuzzy matching
        const matchData = await calculateMatchScore(
          candidate.skills || [],
          jobDesc.requiredSkills || [],
          candidate.experience || undefined,
          resume.content
        );

        logger.debug(
          `Match score for ${candidate.firstName} ${candidate.lastName}: ${matchData.score}%`
        );
        logger.debug(
          `Scorecard for ${candidate.firstName} ${candidate.lastName}:`,
          JSON.stringify(matchData.scorecard, null, 2)
        );

        // Return match data for batch insert (not inserted yet)
        return {
          type: "new",
          data: {
            resumeContentHash: resume.contentHash,
            jobContentHash: jobDesc.contentHash,
            jobDescriptionId: jobId,
            candidateId: candidate.id,
            matchScore: matchData.score,
            scorecard: matchData.scorecard,
            matchingSkills: matchData.matchingSkills,
            analysis: matchData.analysis,
          },
          candidateName: `${candidate.firstName} ${candidate.lastName}`,
        };
      } catch (error) {
        if (isRateLimitError(error)) {
          logger.info(
            `Match calculation rate limited for candidate ${candidate.id}, adding to queue`
          );
          // Add to queue for retry
          await storage.addToMatchQueue(candidate.id, jobId);
          return {
            type: "queued",
            data: {
              jobDescriptionId: jobId,
              candidateId: candidate.id,
              matchScore: null,
              status: "queued",
              message: "Rate limited, queued for retry",
            },
          };
        }

        logger.error(
          `Failed to process match for candidate ${candidate.firstName} ${candidate.lastName}:`,
          error
        );
        // Return a failed match result instead of throwing
        return {
          type: "error",
          data: {
            jobDescriptionId: jobId,
            candidateId: candidate.id,
            matchScore: 0,
            matchingSkills: [],
            analysis: `Failed to calculate match: ${error instanceof Error ? error.message : "Unknown error"}`,
            error: true,
          },
        };
      }
    });

    // Wait for all candidate matching to complete
    const results = await Promise.all(candidatePromises);
    const llmProcessingTime = Date.now() - llmStartTime;

    // Separate results by type

    const newMatches = results.filter((r) => r.type === "new");

    const existingMatches = results.filter((r) => r.type === "existing");

    const queuedMatches = results.filter((r) => r.type === "queued");

    const errorMatches = results.filter((r) => r.type === "error");

    // Batch insert all new matches at once
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let createdMatches: any[] = [];
    if (newMatches.length > 0) {
      const dbInsertStart = Date.now();
      logger.info(`Batch inserting ${newMatches.length} new matches...`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchDataArray = newMatches.map((m: any) => m.data);
      createdMatches = await storage.batchCreateMatchResults(matchDataArray);
      const dbInsertTime = Date.now() - dbInsertStart;

      // Log summary at info level, details at debug level
      logger.info(`Successfully created ${createdMatches.length} new match results in ${dbInsertTime}ms`);
      createdMatches.forEach((match, index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matchInfo = newMatches[index] as any;
        logger.debug(
          `Created match result for ${matchInfo.candidateName}: score ${match.matchScore}%`
        );
      });
    }

    // Combine all results
    const matchResults = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...existingMatches.map((r: any) => r.data),
      ...createdMatches,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...queuedMatches.map((r: any) => r.data),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...errorMatches.map((r: any) => r.data),
    ];

    const totalTime = Date.now() - requestStartTime;
    logger.info(`Candidate matching complete. Processed ${matchResults.length} matches in ${totalTime}ms (LLM: ${llmProcessingTime}ms)`);
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
    const requestStartTime = Date.now();
    const { jobId } = req.params;
    const { candidates }: { candidates: PublicCandidateProfile[] } = req.body;

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ message: "No candidate profiles provided" });
    }

    const jobDesc = await storage.getJobDescription(jobId);
    if (!jobDesc) {
      return res.status(404).json({ message: "Job description not found" });
    }

    logger.info(`Processing candidate matching in parallel for ${candidates.length} candidates...`);

    // Process all candidates concurrently (LLM calls in parallel)
    const candidatePromises = candidates.map(async (candidate) => {
      try {
        logger.debug(
          `Processing public candidate ${candidate.firstName} ${candidate.lastInitial} (${candidate.id})`
        );

        // For public candidates, we calculate a hash from their profile data for deduplication
        const profileHash = generateTextHash(
          JSON.stringify({
            skills: candidate.skills,
            experience: candidate.experience,
            html: candidate.publicResumeHtml,
          })
        );

        // Check if match already exists (deduplication)
        const existingMatch = await storage.getMatchResultByHashes(
          profileHash,
          jobDesc.contentHash
        );
        if (existingMatch) {
          logger.debug(
            `Match already exists for public candidate ${candidate.firstName} ${candidate.lastInitial}, reusing cached result`
          );
          return { type: "existing", data: existingMatch };
        }

        // Calculate match score with fuzzy matching
        const matchData = await calculateMatchScore(
          candidate.skills || [],
          jobDesc.requiredSkills || [],
          candidate.experience || undefined,
          candidate.publicResumeHtml || undefined
        );

        logger.debug(
          `Match score for ${candidate.firstName} ${candidate.lastInitial}: ${matchData.score}%`
        );

        // Return match data for batch insert (not inserted yet)
        return {
          type: "new",
          data: {
            resumeContentHash: profileHash,
            jobContentHash: jobDesc.contentHash,
            jobDescriptionId: jobId,
            candidateId: candidate.id,
            matchScore: matchData.score,
            scorecard: matchData.scorecard,
            matchingSkills: matchData.matchingSkills,
            analysis: matchData.analysis,
          },
          candidateName: `${candidate.firstName} ${candidate.lastInitial}`,
        };
      } catch (error) {
        if (isRateLimitError(error)) {
          logger.info(
            `Match calculation rate limited for public candidate ${candidate.id}, returning queued status`
          );
          // For public candidates without stored IDs, we can't queue them
          // Return a rate-limited status instead
          return {
            type: "rate_limited",
            data: {
              jobDescriptionId: jobId,
              candidateId: candidate.id,
              matchScore: null,
              status: "rate_limited",
              message: "Rate limited, please retry",
            },
          };
        }

        logger.error(
          `Failed to process match for candidate ${candidate.firstName} ${candidate.lastInitial}:`,
          error
        );
        // Return a failed match result instead of throwing
        return {
          type: "error",
          data: {
            jobDescriptionId: jobId,
            candidateId: candidate.id,
            matchScore: 0,
            matchingSkills: [],
            analysis: `Failed to calculate match: ${error instanceof Error ? error.message : "Unknown error"}`,
            error: true,
          },
        };
      }
    });

    // Wait for all candidate matching to complete
    const results = await Promise.all(candidatePromises);

    // Separate results by type

    const newMatches = results.filter((r) => r.type === "new");

    const existingMatches = results.filter((r) => r.type === "existing");

    const rateLimitedMatches = results.filter((r) => r.type === "rate_limited");

    const errorMatches = results.filter((r) => r.type === "error");

    // Batch insert all new matches at once
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let createdMatches: any[] = [];
    if (newMatches.length > 0) {
      logger.info(`Batch inserting ${newMatches.length} new matches...`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchDataArray = newMatches.map((m: any) => m.data);
      createdMatches = await storage.batchCreateMatchResults(matchDataArray);

      // Log summary at info level, details at debug level
      logger.info(`Successfully created ${createdMatches.length} new public match results`);
      createdMatches.forEach((match, index) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const matchInfo = newMatches[index] as any;
        logger.debug(
          `Created match result for ${matchInfo.candidateName}: score ${match.matchScore}%`
        );
      });
    }

    // Combine all results
    const matchResults = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...existingMatches.map((r: any) => r.data),
      ...createdMatches,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...rateLimitedMatches.map((r: any) => r.data),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...errorMatches.map((r: any) => r.data),
    ];

    const totalTime = Date.now() - requestStartTime;
    logger.info(`Public candidate matching complete. Processed ${matchResults.length} matches in ${totalTime}ms`);
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
