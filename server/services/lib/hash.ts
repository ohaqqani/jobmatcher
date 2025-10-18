import { createHash } from "crypto";

/**
 * Generate SHA-256 hash from buffer
 * Used for content-based deduplication of resume files
 */
export function generateContentHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generate SHA-256 hash from text string
 * Used for content-based deduplication of text content (e.g., job descriptions)
 */
export function generateTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
