import { storage } from "../storage";
import { extractCandidateInfo } from "../services/candidates";
import { calculateNextRetry } from "../services/lib/llmRetry";
import { logger } from "../lib/logger";

const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Process items from the candidate extraction queue
 */
async function processQueueItems() {
  if (isRunning) {
    logger.debug("Candidate extraction worker already running, skipping");
    return;
  }

  isRunning = true;

  try {
    // Fetch ALL available items (no limit)
    const items = await storage.getRetryableCandidateExtractionJobs();

    if (items.length === 0) {
      return;
    }

    logger.info(`Processing ${items.length} candidate extraction queue items in parallel`);

    // Process all items in parallel
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // Fetch resume content
          const resume = await storage.getResume(item.resumeId);

          if (!resume) {
            logger.error(`Resume ${item.resumeId} not found, removing from queue`);
            await storage.completeCandidateExtractionJob(item.id);
            return { status: "removed", itemId: item.id };
          }

          logger.debug(
            `Retrying candidate extraction for resume ${resume.id} (attempt ${item.attemptCount + 1}/${MAX_RETRIES})`
          );

          // Retry the LLM call
          const candidateInfo = await extractCandidateInfo(resume.content);

          // Create candidate record
          await storage.createCandidate({
            resumeId: resume.id,
            ...candidateInfo,
          });

          logger.info(
            `Successfully extracted candidate info for ${candidateInfo.firstName} ${candidateInfo.lastName}`
          );

          // Remove from queue
          await storage.completeCandidateExtractionJob(item.id);
          return { status: "success", itemId: item.id };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(
            `Failed to process candidate extraction queue item ${item.id}:`,
            errorMessage
          );

          // Increment attempt count
          const newAttemptCount = item.attemptCount + 1;

          if (newAttemptCount >= MAX_RETRIES) {
            logger.error(
              `Max retries exceeded for candidate extraction queue item ${item.id}, keeping in queue with failed status`
            );
            // Keep in queue but mark as failed by setting a far-future retry time
            const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
            await storage.incrementCandidateExtractionRetry(item.id, errorMessage, farFuture);
            return { status: "failed", itemId: item.id };
          } else {
            // Calculate next retry time with rate limit reset from headers
            const nextRetry = calculateNextRetry(newAttemptCount, error);
            await storage.incrementCandidateExtractionRetry(
              item.id,
              errorMessage,
              nextRetry.toISOString()
            );
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
      `Candidate extraction batch complete: ${succeeded} succeeded, ${requeued} requeued, ${failed} failed, ${removed} removed`
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the candidate extraction queue worker
 */
export function startCandidateExtractionWorker() {
  logger.info("Starting candidate extraction queue worker");

  // Process immediately on start
  processQueueItems();

  // Then process every POLL_INTERVAL_MS
  intervalId = setInterval(() => {
    processQueueItems();
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the candidate extraction queue worker
 */
export function stopCandidateExtractionWorker() {
  logger.info("Stopping candidate extraction queue worker");

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
