import { storage } from "../storage";
import { anonymizeResumeAsHTML } from "../services/candidates";
import { calculateNextRetry } from "../services/lib/llmRetry";

const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Process items from the resume anonymization queue
 */
async function processQueueItems() {
  if (isRunning) {
    console.log("Resume anonymization worker already running, skipping");
    return;
  }

  isRunning = true;

  try {
    // Fetch ALL available items (no limit)
    const items = await storage.getRetryableResumeAnonymizationJobs();

    if (items.length === 0) {
      return;
    }

    console.log(`Processing ${items.length} resume anonymization queue items in parallel`);

    // Process all items in parallel
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // Fetch resume content
          const resume = await storage.getResume(item.resumeId);

          if (!resume) {
            console.error(`Resume ${item.resumeId} not found, removing from queue`);
            await storage.completeResumeAnonymizationJob(item.id);
            return { status: "removed", itemId: item.id };
          }

          console.log(
            `Retrying resume anonymization for resume ${resume.id} (attempt ${item.attemptCount + 1}/${MAX_RETRIES})`
          );

          // Retry the LLM call
          const publicResumeHtml = await anonymizeResumeAsHTML(resume.content);

          // Update resume with anonymized HTML
          await storage.updateResumeHtml(resume.id, publicResumeHtml);

          console.log(`Successfully anonymized resume ${resume.id}`);

          // Remove from queue
          await storage.completeResumeAnonymizationJob(item.id);
          return { status: "success", itemId: item.id };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(
            `Failed to process resume anonymization queue item ${item.id}:`,
            errorMessage
          );

          // Increment attempt count
          const newAttemptCount = item.attemptCount + 1;

          if (newAttemptCount >= MAX_RETRIES) {
            console.error(
              `Max retries exceeded for resume anonymization queue item ${item.id}, keeping in queue with failed status`
            );
            // Keep in queue but mark as failed by setting a far-future retry time
            const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
            await storage.incrementResumeAnonymizationRetry(item.id, errorMessage, farFuture);
            return { status: "failed", itemId: item.id };
          } else {
            // Calculate next retry time with rate limit reset from headers
            const nextRetry = calculateNextRetry(newAttemptCount, error);
            await storage.incrementResumeAnonymizationRetry(
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

    console.log(
      `Resume anonymization batch complete: ${succeeded} succeeded, ${requeued} requeued, ${failed} failed, ${removed} removed`
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the resume anonymization queue worker
 */
export function startResumeAnonymizationWorker() {
  console.log("Starting resume anonymization queue worker");

  // Process immediately on start
  processQueueItems();

  // Then process every POLL_INTERVAL_MS
  intervalId = setInterval(() => {
    processQueueItems();
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the resume anonymization queue worker
 */
export function stopResumeAnonymizationWorker() {
  console.log("Stopping resume anonymization queue worker");

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
