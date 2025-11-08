import fs from "fs";
import { logger } from "./logger";

/**
 * Initializes Google Cloud credentials for Railway deployment.
 *
 * This function supports two methods of credential configuration:
 * 1. GCLOUD_KEY_BASE64: Base64-encoded service account key (for Railway/production)
 * 2. GOOGLE_APPLICATION_CREDENTIALS: File path to credentials JSON (for local development)
 *
 * For Railway deployment:
 * - Base64 encode your service account key: `base64 -i service-account-key.json`
 * - Set GCLOUD_KEY_BASE64 environment variable with the encoded string
 * - Credentials will be decoded and written to /tmp/gcloud-creds.json at runtime
 */
export function initializeGoogleCloudCredentials(): void {
  try {
    const base64Key = process.env.GCLOUD_KEY_BASE64;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    // If base64 key is provided (Railway deployment), decode and write to temp file
    if (base64Key) {
      logger.info("Initializing Google Cloud credentials from GCLOUD_KEY_BASE64");

      // Decode the base64-encoded credentials
      const credentialsJson = Buffer.from(base64Key, "base64").toString("utf-8");

      // Validate that it's valid JSON
      try {
        JSON.parse(credentialsJson);
      } catch {
        throw new Error("GCLOUD_KEY_BASE64 contains invalid JSON after decoding");
      }

      // Write to /tmp directory (writable in Railway containers)
      const tempCredPath = "/tmp/gcloud-creds.json";
      fs.writeFileSync(tempCredPath, credentialsJson, { mode: 0o600 }); // Secure file permissions

      // Set the environment variable that Google Cloud libraries expect
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredPath;

      logger.info("Google Cloud credentials initialized successfully", {
        credentialsPath: tempCredPath,
      });

      return;
    }

    // If file path is provided (local development), verify it exists
    if (credentialsPath) {
      if (!fs.existsSync(credentialsPath)) {
        logger.warn("GOOGLE_APPLICATION_CREDENTIALS file not found", {
          path: credentialsPath,
        });
        throw new Error(`Credentials file not found: ${credentialsPath}`);
      }

      logger.info("Using existing GOOGLE_APPLICATION_CREDENTIALS", {
        credentialsPath,
      });

      return;
    }

    // No credentials configured
    logger.warn(
      "No Google Cloud credentials configured. Set either GCLOUD_KEY_BASE64 or GOOGLE_APPLICATION_CREDENTIALS environment variable. OCR functionality will not be available."
    );
  } catch (error) {
    logger.error("Failed to initialize Google Cloud credentials", error);

    // In production, we want to fail fast if credentials are misconfigured
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Failed to initialize Google Cloud credentials in production. Please check your GCLOUD_KEY_BASE64 environment variable."
      );
    }

    // In development, just warn and continue
    logger.warn("Continuing without Google Cloud credentials (development mode)");
  }
}
