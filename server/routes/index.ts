import type { Express } from "express";
import { createServer, type Server } from "http";
import jobsRouter from "./jobs";
import candidatesRouter from "./candidates";
import matchingRouter from "./matching";

/**
 * Register all routes with the Express app
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Register domain-specific routes
  app.use(jobsRouter);
  app.use(candidatesRouter);
  app.use(matchingRouter);

  const httpServer = createServer(app);
  return httpServer;
}
