import dotenv from "dotenv";
import express, { NextFunction, type Request, Response } from "express";
import { registerRoutes } from "./routes/index";
import { log, serveStatic, setupVite } from "./vite";
import {
  startCandidateExtractionWorker,
  stopCandidateExtractionWorker,
} from "./workers/candidateExtractionWorker";
import { startJobAnalysisWorker, stopJobAnalysisWorker } from "./workers/jobAnalysisWorker";
import {
  startMatchProcessingWorker,
  stopMatchProcessingWorker,
} from "./workers/matchProcessingWorker";
import {
  startResumeAnonymizationWorker,
  stopResumeAnonymizationWorker,
} from "./workers/resumeAnonymizationWorker";

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json({ limit: "600mb" }));
app.use(express.urlencoded({ limit: "600mb", extended: true }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Add health check endpoint
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const server = await registerRoutes(app);

  app.use(
    (
      err: Error & { status?: number; statusCode?: number },
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Server error:", err);

      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    }
  );

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Railway provides PORT environment variable, fallback to 3000 for local development
  const port = parseInt(process.env.PORT || "3000", 10);

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port} in ${process.env.NODE_ENV || "development"} mode`);
    log(`Server running on port ${port} in ${process.env.NODE_ENV || "development"} mode`);

    // Start background workers for rate limit retry queue processing
    console.log("Starting background workers...");
    startCandidateExtractionWorker();
    startResumeAnonymizationWorker();
    startJobAnalysisWorker();
    startMatchProcessingWorker();
    console.log("Background workers started successfully");
  });

  // Graceful shutdown handling
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    // Stop all workers
    stopCandidateExtractionWorker();
    stopResumeAnonymizationWorker();
    stopJobAnalysisWorker();
    stopMatchProcessingWorker();

    // Close server
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error("Forcing shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
