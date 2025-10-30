import { storage } from "../storage";
import { calculateMatchScore } from "../services/matching";
import { calculateNextRetry } from "../services/lib/llmRetry";

const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Process items from the match processing queue
 */
async function processQueueItems() {
  if (isRunning) {
    console.log("Match processing worker already running, skipping");
    return;
  }

  isRunning = true;

  try {
    // Fetch ALL available items (no limit)
    const items = await storage.getRetryableMatchJobs();

    if (items.length === 0) {
      return;
    }

    console.log(`Processing ${items.length} match processing queue items in parallel`);

    // Process all items in parallel
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          // Fetch candidate and job data
          const candidate = await storage.getCandidate(item.candidateId);
          if (!candidate) {
            console.error(`Candidate ${item.candidateId} not found, removing from queue`);
            await storage.completeMatchJob(item.id);
            return { status: "removed", itemId: item.id };
          }

          const resume = await storage.getResume(candidate.resumeId);
          if (!resume) {
            console.error(`Resume ${candidate.resumeId} not found, removing from queue`);
            await storage.completeMatchJob(item.id);
            return { status: "removed", itemId: item.id };
          }

          const job = await storage.getJobDescription(item.jobDescriptionId);
          if (!job) {
            console.error(
              `Job description ${item.jobDescriptionId} not found, removing from queue`
            );
            await storage.completeMatchJob(item.id);
            return { status: "removed", itemId: item.id };
          }

          console.log(
            `Retrying match calculation for candidate ${candidate.id} and job ${job.id} (attempt ${item.attemptCount + 1}/${MAX_RETRIES})`
          );

          // Retry the LLM call
          const matchData = await calculateMatchScore(
            (candidate.skills as string[]) || [],
            (job.requiredSkills as string[]) || [],
            candidate.experience || undefined,
            resume.content
          );

          // Create match result
          await storage.createMatchResult({
            resumeContentHash: resume.contentHash,
            jobContentHash: job.contentHash,
            jobDescriptionId: job.id,
            candidateId: candidate.id,
            matchScore: matchData.score,
            scorecard: matchData.scorecard,
            matchingSkills: matchData.matchingSkills,
            analysis: matchData.analysis,
          });

          console.log(
            `Successfully calculated match for candidate ${candidate.firstName} ${candidate.lastName} and job ${job.title}: ${matchData.score}%`
          );

          // Remove from queue
          await storage.completeMatchJob(item.id);
          return { status: "success", itemId: item.id };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`Failed to process match queue item ${item.id}:`, errorMessage);

          // Increment attempt count
          const newAttemptCount = item.attemptCount + 1;

          if (newAttemptCount >= MAX_RETRIES) {
            console.error(
              `Max retries exceeded for match queue item ${item.id}, keeping in queue with failed status`
            );
            // Keep in queue but mark as failed by setting a far-future retry time
            const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
            await storage.incrementMatchRetry(item.id, errorMessage, farFuture);
            return { status: "failed", itemId: item.id };
          } else {
            // Calculate next retry time with rate limit reset from headers
            const nextRetry = calculateNextRetry(newAttemptCount, error);
            await storage.incrementMatchRetry(item.id, errorMessage, nextRetry.toISOString());
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
      `Match processing batch complete: ${succeeded} succeeded, ${requeued} requeued, ${failed} failed, ${removed} removed`
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the match processing queue worker
 */
export function startMatchProcessingWorker() {
  console.log("Starting match processing queue worker");

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
  console.log("Stopping match processing queue worker");

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
