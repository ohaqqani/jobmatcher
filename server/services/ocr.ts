import vision from "@google-cloud/vision";
import { logger } from "../lib/logger";

/**
 * OCR Service using Google Cloud Vision API
 * Extracts text from PDF documents using Vision API's native PDF support
 */

const visionClient = new vision.ImageAnnotatorClient();

/**
 * Extract text from PDF using Google Cloud Vision's batchAnnotateFiles
 * Supports PDFs up to 5 pages (synchronous processing)
 */
export async function extractTextWithOCR(pdfBuffer: Buffer): Promise<string> {
  try {
    logger.info("Starting OCR extraction", { bufferSize: pdfBuffer.length });

    const [result] = await visionClient.batchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            content: pdfBuffer,
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    });

    const fileResponse = result.responses?.[0];
    if (!fileResponse) {
      throw new Error("No response from Vision API");
    }

    const pageAnnotations = fileResponse.responses || [];
    const pageTexts = pageAnnotations.map((annotation, index) => {
      const text = annotation.fullTextAnnotation?.text || "";
      logger.debug(`Page ${index + 1} extracted ${text.length} characters`);
      return text;
    });

    const combinedText = pageTexts.join("\n\n");
    logger.info("OCR extraction complete", {
      totalChars: combinedText.length,
      pageCount: pageTexts.length,
    });

    return combinedText;
  } catch (error) {
    logger.error("OCR extraction failed:", error);
    throw new Error(
      `OCR extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
