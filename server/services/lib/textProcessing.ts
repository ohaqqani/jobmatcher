/**
 * Clean and normalize text content
 */
export function normalizeText(text: string): string {
  if (!text) return "";

  return text
    .replace(/\r\n/g, "\n") // normalize line endings
    .replace(/\r/g, "\n") // handle remaining carriage returns
    .replace(/\t/g, " ") // replace tabs with spaces
    .replace(/\s+/g, " ") // collapse multiple spaces
    .trim(); // remove leading/trailing whitespace
}

/**
 * Clean HTML content for embedding (remove document-level tags, escaped chars, etc.)
 */
export function cleanHTMLContent(htmlContent: string): string {
  let cleaned = htmlContent.trim();

  // Remove outer quotes if the entire content is wrapped in quotes
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove code block markers
  cleaned = cleaned.replace(/```(?:html)?/g, "").trim();

  // Remove escaped characters in one pass
  cleaned = cleaned
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\t/g, "")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");

  // Remove document-level HTML tags if they somehow made it through
  const documentTags = [
    /<!DOCTYPE[^>]*>/gi,
    /<\/?html[^>]*>/gi,
    /<head[\s\S]*?<\/head>/gi,
    /<\/?body[^>]*>/gi,
    /<title[\s\S]*?<\/title>/gi,
  ];

  for (const tagRegex of documentTags) {
    cleaned = cleaned.replace(tagRegex, "");
  }

  // Remove excessive whitespace between tags while preserving content spacing
  cleaned = cleaned.replace(/>\s+</g, "><");

  return cleaned.trim();
}
