/**
 * Simple logging utility with configurable log levels
 * Set LOG_LEVEL environment variable to control verbosity:
 * - error: Only errors
 * - warn: Errors and warnings
 * - info: Errors, warnings, and info (default for production)
 * - debug: All logs including verbose matching details (default for development)
 */

type LogLevel = "error" | "warn" | "info" | "debug";

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();

  // Default to debug in development, info in production
  if (!level) {
    return process.env.NODE_ENV === "production" ? "info" : "debug";
  }

  if (level in LOG_LEVELS) {
    return level as LogLevel;
  }

  return "info"; // Fallback
}

const currentLogLevel = getLogLevel();
const currentLogLevelValue = LOG_LEVELS[currentLogLevel];

export const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => {
    if (currentLogLevelValue >= LOG_LEVELS.error) {
      console.error(...args);
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => {
    if (currentLogLevelValue >= LOG_LEVELS.warn) {
      console.warn(...args);
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...args: any[]) => {
    if (currentLogLevelValue >= LOG_LEVELS.info) {
      console.log(...args);
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => {
    if (currentLogLevelValue >= LOG_LEVELS.debug) {
      console.log(...args);
    }
  },
};
