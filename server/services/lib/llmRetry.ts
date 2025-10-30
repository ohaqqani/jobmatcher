/**
 * Custom error class for rate limit errors from LLM APIs
 */
export class RateLimitError extends Error {
  public retryAfter?: Date;

  constructor(message: string, retryAfter?: Date) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Check if rate limit simulation is enabled (for testing)
 * Set SIMULATE_RATE_LIMIT=true to test queue functionality without hitting real rate limits
 */
export function shouldSimulateRateLimit(): boolean {
  return process.env.SIMULATE_RATE_LIMIT === "true";
}

/**
 * Check if an error is a rate limit error from OpenAI
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  if (error instanceof RateLimitError) {
    return true;
  }

  // Check for OpenAI rate limit status code
  if (error && typeof error === "object") {
    const err = error as { status?: number; statusCode?: number; message?: string };

    // OpenAI SDK wraps errors with status property
    if (err.status === 429 || err.statusCode === 429) {
      return true;
    }

    // Check error message for rate limit indicators
    const message = err.message?.toLowerCase() || "";
    if (
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("429")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Parse duration strings like "1s", "6m0s", "1m30s" to milliseconds
 */
function parseDuration(duration: string | undefined): number {
  if (!duration) return 0;

  let ms = 0;

  // Parse formats like "1s", "6m0s", "1m30s"
  const minutesMatch = duration.match(/(\d+)m/);
  const secondsMatch = duration.match(/(\d+)s/);

  if (minutesMatch) ms += parseInt(minutesMatch[1]) * 60 * 1000;
  if (secondsMatch) ms += parseInt(secondsMatch[1]) * 1000;

  return ms;
}

/**
 * Parse rate limit reset time from error headers if available
 */
function parseRateLimitReset(error: unknown): Date | undefined {
  try {
    // OpenAI includes headers in some error responses
    if (error && typeof error === "object") {
      const err = error as {
        headers?: Record<string, string>;
        response?: { headers?: Record<string, string> };
      };
      const headers = err.headers || err.response?.headers;
      if (headers) {
        // Parse "1s" or "6m0s" duration format from OpenAI
        const requestsReset = headers["x-ratelimit-reset-requests"];
        const tokensReset = headers["x-ratelimit-reset-tokens"];

        const requestsMs = parseDuration(requestsReset);
        const tokensMs = parseDuration(tokensReset);

        // Use the LONGER of the two (wait for both to reset)
        const maxWait = Math.max(requestsMs, tokensMs);

        if (maxWait > 0) {
          return new Date(Date.now() + maxWait);
        }
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return undefined;
}

/**
 * Calculate next retry timestamp based on attempt count
 * Tries to parse actual reset time from error headers
 * Falls back to 60 seconds if headers not available
 * Adds random jitter to prevent thundering herd
 */
export function calculateNextRetry(attemptCount: number, error?: unknown): Date {
  // Try to parse actual reset time from error headers
  if (error) {
    const resetTime = parseRateLimitReset(error);
    if (resetTime) {
      // Add jitter to prevent thundering herd (±1 second)
      const jitter = Math.random() * 2000 - 1000;
      return new Date(resetTime.getTime() + jitter);
    }
  }

  // Fallback: Wait 60 seconds (typical rate limit window)
  const baseDelay = 60 * 1000; // 60 seconds

  // Add 20% jitter (±10%)
  const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
  const delayMs = baseDelay + jitter;

  return new Date(Date.now() + delayMs);
}

/**
 * Retry a function with exponential backoff on rate limit errors
 * @param fn The async function to retry
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @returns The result of the function
 * @throws RateLimitError if all retries are exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // If it's a rate limit error and we have retries left, wait and retry
      if (isRateLimitError(error) && attempt < maxRetries) {
        const retryAfter = parseRateLimitReset(error);
        const nextRetry = retryAfter || calculateNextRetry(attempt);
        const delayMs = nextRetry.getTime() - Date.now();

        console.warn(
          `Rate limit hit, retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})`
        );

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // If it's a rate limit error but no retries left, throw RateLimitError
      if (isRateLimitError(error)) {
        const retryAfter = parseRateLimitReset(error);
        throw new RateLimitError(`Rate limit exceeded after ${maxRetries} retries`, retryAfter);
      }

      // For non-rate-limit errors, throw immediately
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error("Retry failed");
}
