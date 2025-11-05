import { storage } from "../storage";
import { calculateMatchScore } from "../services/matching";
import { calculateNextRetry } from "../services/lib/llmRetry";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Process items from the match processing queue
 */
async function processQueueItems() {
  if (isRunning) {
    logger.debug("Match processing worker already running, skipping");
    return;
  }

  isRunning = true;
  const batchStartTime = Date.now();

  try {
    // Fetch ALL available items (no limit)
    const items = await storage.getRetryableMatchJobs();

    if (items.length === 0) {
      return;
    }

    logger.info(`Processing ${items.length} match processing queue items in parallel`);

    // Batch fetch all candidates, jobs, and resumes upfront (3 queries instead of N×3)
    const dbFetchStartTime = Date.now();
    const candidateIds = items.map((item) => item.candidateId);
    const jobIds = items.map((item) => item.jobDescriptionId);

    const [candidates, jobs] = await Promise.all([
      storage.getCandidatesByIds(candidateIds),
      storage.getJobDescriptionsByIds(jobIds),
    ]);

    // Build lookup maps
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    // Batch fetch resumes for all candidates
    const resumeIds = candidates.map((c) => c.resumeId);
    const resumes = await storage.getResumesByIds(resumeIds);
    const resumeMap = new Map(resumes.map((r) => [r.id, r]));

    const dbFetchTime = Date.now() - dbFetchStartTime;
    logger.debug(`Database fetch completed in ${dbFetchTime}ms`);

    // Process all items in parallel
    const llmStartTime = Date.now();
    const llmTimes: number[] = [];

    const results = await Promise.all(
      items.map(async (item) => {
        const itemStartTime = Date.now();
        try {
          // Get data from pre-fetched maps (instant lookup)
          const candidate = candidateMap.get(item.candidateId);
          if (!candidate) {
            logger.error(`Candidate ${item.candidateId} not found, removing from queue`);
            await storage.completeMatchJob(item.id);
            return { status: "removed", itemId: item.id, duration: Date.now() - itemStartTime };
          }

          const resume = resumeMap.get(candidate.resumeId);
          if (!resume) {
            logger.error(`Resume ${candidate.resumeId} not found, removing from queue`);
            await storage.completeMatchJob(item.id);
            return { status: "removed", itemId: item.id, duration: Date.now() - itemStartTime };
          }

          const job = jobMap.get(item.jobDescriptionId);
          if (!job) {
            logger.error(
              `Job description ${item.jobDescriptionId} not found, removing from queue`
            );
            await storage.completeMatchJob(item.id);
            return { status: "removed", itemId: item.id, duration: Date.now() - itemStartTime };
          }

          logger.debug(
            `Retrying match calculation for candidate ${candidate.id} and job ${job.id} (attempt ${item.attemptCount + 1}/${MAX_RETRIES})`
          );

          // Retry the LLM call
          const llmCallStart = Date.now();
          const matchData = await calculateMatchScore(
            (candidate.skills as string[]) || [],
            (job.requiredSkills as string[]) || [],
            candidate.experience || undefined,
            resume.content
          );
          const llmCallTime = Date.now() - llmCallStart;
          llmTimes.push(llmCallTime);

          // Atomically create match result and remove from queue (prevents duplicates on crash)
          await storage.createMatchAndCompleteJob(
            {
              resumeContentHash: resume.contentHash,
              jobContentHash: job.contentHash,
              jobDescriptionId: job.id,
              candidateId: candidate.id,
              matchScore: matchData.score,
              scorecard: matchData.scorecard,
              matchingSkills: matchData.matchingSkills,
              analysis: matchData.analysis,
            },
            item.id
          );

          logger.info(
            `Successfully calculated match for candidate ${candidate.firstName} ${candidate.lastName} and job ${job.title}: ${matchData.score}%`
          );

          return { status: "success", itemId: item.id, duration: Date.now() - itemStartTime };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(`Failed to process match queue item ${item.id}:`, errorMessage);

          // Increment attempt count
          const newAttemptCount = item.attemptCount + 1;

          if (newAttemptCount >= MAX_RETRIES) {
            logger.error(
              `Max retries exceeded for match queue item ${item.id}, keeping in queue with failed status`
            );
            // Keep in queue but mark as failed by setting a far-future retry time
            const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
            await storage.incrementMatchRetry(item.id, errorMessage, farFuture);
            return { status: "failed", itemId: item.id, duration: Date.now() - itemStartTime };
          } else {
            // Calculate next retry time with rate limit reset from headers
            const nextRetry = calculateNextRetry(newAttemptCount, error);
            await storage.incrementMatchRetry(item.id, errorMessage, nextRetry.toISOString());
            return { status: "requeued", itemId: item.id, duration: Date.now() - itemStartTime };
          }
        }
      })
    );

    // Log summary statistics with performance metrics
    const succeeded = results.filter((r) => r.status === "success").length;
    const requeued = results.filter((r) => r.status === "requeued").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const removed = results.filter((r) => r.status === "removed").length;

    const totalBatchTime = Date.now() - batchStartTime;
    const totalLlmTime = Date.now() - llmStartTime;

    // Calculate LLM statistics
    const avgLlmTime = llmTimes.length > 0
      ? Math.round(llmTimes.reduce((a, b) => a + b, 0) / llmTimes.length)
      : 0;
    const minLlmTime = llmTimes.length > 0 ? Math.min(...llmTimes) : 0;
    const maxLlmTime = llmTimes.length > 0 ? Math.max(...llmTimes) : 0;

    // Calculate parallelization efficiency
    const theoreticalSequentialTime = llmTimes.reduce((a, b) => a + b, 0);
    const speedup = theoreticalSequentialTime > 0
      ? (theoreticalSequentialTime / totalLlmTime).toFixed(2)
      : "N/A";

    logger.info(
      `Match processing batch complete: ${succeeded} succeeded, ${requeued} requeued, ${failed} failed, ${removed} removed`
    );
    logger.info(
      `Performance: Total=${totalBatchTime}ms, DB Fetch=${dbFetchTime}ms, LLM Processing=${totalLlmTime}ms`
    );
    logger.info(
      `LLM Stats: Avg=${avgLlmTime}ms, Min=${minLlmTime}ms, Max=${maxLlmTime}ms, Speedup=${speedup}x`
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the match processing queue worker
 */
export function startMatchProcessingWorker() {
  logger.info("Starting match processing queue worker");

  // Process immediately on start
  processQueueItems();

  // Then process every POLL_INTERVAL_MS
  intervalId = setInterval(() => {
    processQueueItems();
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the match processing queue worker
 */
export function stopMatchProcessingWorker() {
  logger.info("Stopping match processing queue worker");

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
