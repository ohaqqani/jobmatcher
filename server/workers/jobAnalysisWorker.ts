import { storage } from "../storage";
import { analyzeJobDescriptionWithAI } from "../services/jobs";
import { calculateNextRetry } from "../services/lib/llmRetry";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Process items from the job analysis queue
 */
async function processQueueItems() {
  if (isRunning) {
    logger.debug("Job analysis worker already running, skipping");
    return;
  }

  isRunning = true;

  try {
    // Fetch ALL available items (no limit)
    const items = await storage.getRetryableJobAnalysisJobs();

    if (items.length === 0) {
      return;
    }

    logger.info(`Processing ${items.length} job analysis queue items in parallel`);

    // Process all items in parallel
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // Fetch job description
          const job = await storage.getJobDescription(item.jobDescriptionId);

          if (!job) {
            logger.error(`Job description ${item.jobDescriptionId} not found, removing from queue`);
            await storage.completeJobAnalysisJob(item.id);
            return { status: "removed", itemId: item.id };
          }

          logger.debug(
            `Retrying job analysis for job ${job.id} (attempt ${item.attemptCount + 1}/${MAX_RETRIES})`
          );

          // Retry the LLM call
          const requiredSkills = await analyzeJobDescriptionWithAI(job.title, job.description);

          // Update job with analyzed skills
          await storage.analyzeJobDescription(job.id, requiredSkills);

          logger.info(`Successfully analyzed job ${job.id}, found ${requiredSkills.length} skills`);

          // Remove from queue
          await storage.completeJobAnalysisJob(item.id);
          return { status: "success", itemId: item.id };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(`Failed to process job analysis queue item ${item.id}:`, errorMessage);

          // Increment attempt count
          const newAttemptCount = item.attemptCount + 1;

          if (newAttemptCount >= MAX_RETRIES) {
            logger.error(
              `Max retries exceeded for job analysis queue item ${item.id}, keeping in queue with failed status`
            );
            // Keep in queue but mark as failed by setting a far-future retry time
            const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
            await storage.incrementJobAnalysisRetry(item.id, errorMessage, farFuture);
            return { status: "failed", itemId: item.id };
          } else {
            // Calculate next retry time with rate limit reset from headers
            const nextRetry = calculateNextRetry(newAttemptCount, error);
            await storage.incrementJobAnalysisRetry(item.id, errorMessage, nextRetry.toISOString());
            return { status: "requeued", itemId: item.id };
          }
        }
      })
    );

    // Log summary statistics
    const succeeded = results.filter((r) => r.status === "success").length;
    const requeued = results.filter((r) => r.status === "requeued").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const removed = results.filter((r) => r.status === "removed").length;

    logger.info(
      `Job analysis batch complete: ${succeeded} succeeded, ${requeued} requeued, ${failed} failed, ${removed} removed`
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the job analysis queue worker
 */
export function startJobAnalysisWorker() {
  logger.info("Starting job analysis queue worker");

  // Process immediately on start
  processQueueItems();

  // Then process every POLL_INTERVAL_MS
  intervalId = setInterval(() => {
    processQueueItems();
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the job analysis queue worker
 */
export function stopJobAnalysisWorker() {
  logger.info("Stopping job analysis queue worker");

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
