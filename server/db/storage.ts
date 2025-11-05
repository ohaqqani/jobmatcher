import { eq, and, lte, inArray, or, isNull, sql } from "drizzle-orm";
import {
  type Candidate,
  type CandidateWithMatch,
  type InsertCandidate,
  type InsertJobDescription,
  type InsertMatchResult,
  type InsertResume,
  type JobDescription,
  type MatchResult,
  type Resume,
  jobDescriptions,
  resumes,
  candidates,
  matchResults,
  candidateExtractionQueue,
  resumeAnonymizationQueue,
  jobAnalysisQueue,
  matchProcessingQueue,
} from "@shared/schemas";
import { db } from "./index";
import type { IStorage } from "../storage";

export class PostgresStorage implements IStorage {
  // Job Description methods
  async createJobDescription(jobDesc: InsertJobDescription): Promise<JobDescription> {
    const [created] = await db.insert(jobDescriptions).values(jobDesc).returning();
    return created;
  }

  async getJobDescription(id: string): Promise<JobDescription | undefined> {
    const [jobDesc] = await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id));
    return jobDesc;
  }

  async getJobDescriptionByHash(hash: string): Promise<JobDescription | undefined> {
    const [jobDesc] = await db
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.contentHash, hash));
    return jobDesc;
  }

  async getJobDescriptionsByIds(ids: string[]): Promise<JobDescription[]> {
    if (ids.length === 0) return [];
    return await db.select().from(jobDescriptions).where(inArray(jobDescriptions.id, ids));
  }

  async analyzeJobDescription(id: string, requiredSkills: string[]): Promise<JobDescription> {
    const [updated] = await db
      .update(jobDescriptions)
      .set({
        requiredSkills,
        analyzedAt: new Date(),
      })
      .where(eq(jobDescriptions.id, id))
      .returning();
    return updated;
  }

  // Resume methods
  async createResume(resume: InsertResume): Promise<Resume> {
    const [created] = await db.insert(resumes).values(resume).returning();
    return created;
  }

  async getResume(id: string): Promise<Resume | undefined> {
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));
    return resume;
  }

  async getResumesByIds(ids: string[]): Promise<Resume[]> {
    if (ids.length === 0) return [];
    return await db.select().from(resumes).where(inArray(resumes.id, ids));
  }

  async getResumeByHash(hash: string): Promise<Resume | undefined> {
    const [resume] = await db.select().from(resumes).where(eq(resumes.contentHash, hash));
    return resume;
  }

  // Candidate methods
  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    // Type assertion needed due to Drizzle's strict JSONB array type inference
    const [created] = await db
      .insert(candidates)
      .values(candidate as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .returning();
    return created;
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async getCandidatesByResumeIds(resumeIds: string[]): Promise<Candidate[]> {
    if (resumeIds.length === 0) return [];
    return await db.select().from(candidates).where(inArray(candidates.resumeId, resumeIds));
  }

  async getCandidateByResumeId(resumeId: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.resumeId, resumeId));
    return candidate;
  }

  async getCandidatesByIds(ids: string[]): Promise<Candidate[]> {
    if (ids.length === 0) return [];
    return await db.select().from(candidates).where(inArray(candidates.id, ids));
  }

  // Match Result methods
  async createMatchResult(matchResult: InsertMatchResult): Promise<MatchResult> {
    // Type assertion needed due to Drizzle's strict JSONB array type inference
    const [created] = await db
      .insert(matchResults)
      .values(matchResult as any) // eslint-disable-line @typescript-eslint/no-explicit-any
      .returning();
    return created;
  }

  async getMatchResultsByJobId(jobId: string): Promise<CandidateWithMatch[]> {
    const results = await db
      .select({
        candidate: candidates,
        resume: resumes,
        matchResult: matchResults,
      })
      .from(matchResults)
      .where(eq(matchResults.jobDescriptionId, jobId))
      .innerJoin(candidates, eq(matchResults.candidateId, candidates.id))
      .innerJoin(resumes, eq(candidates.resumeId, resumes.id))
      .orderBy(matchResults.matchScore);

    return results.map((result) => ({
      ...result.candidate,
      resume: result.resume,
      matchResult: result.matchResult,
    }));
  }

  async getMatchResult(candidateId: string, jobId: string): Promise<MatchResult | undefined> {
    const [result] = await db
      .select()
      .from(matchResults)
      .where(
        and(eq(matchResults.candidateId, candidateId), eq(matchResults.jobDescriptionId, jobId))
      );
    return result;
  }

  async getMatchResultByHashes(
    resumeHash: string,
    jobHash: string
  ): Promise<MatchResult | undefined> {
    const [result] = await db
      .select()
      .from(matchResults)
      .where(
        and(
          eq(matchResults.resumeContentHash, resumeHash),
          eq(matchResults.jobContentHash, jobHash)
        )
      );
    return result;
  }

  /**
   * Batch fetch match results for multiple (resume_hash, job_hash) pairs
   * Uses PostgreSQL row value comparison for optimal composite index utilization
   *
   * @param pairs - Array of {resumeHash, jobHash} objects to query
   * @returns Array of MatchResult objects that exist in the database
   */
  async getMatchResultsByHashPairs(
    pairs: Array<{ resumeHash: string; jobHash: string }>
  ): Promise<MatchResult[]> {
    if (pairs.length === 0) return [];

    // Build parameterized query using sql.join for safety
    // This creates: WHERE (resume_content_hash, job_content_hash) IN ((?, ?), (?, ?), ...)
    const conditions = pairs.map((pair) => sql`(${pair.resumeHash}, ${pair.jobHash})`);

    const results = await db
      .select()
      .from(matchResults)
      .where(
        sql`(${matchResults.resumeContentHash}, ${matchResults.jobContentHash}) IN (${sql.join(conditions, sql`, `)})`
      );

    return results;
  }

  // Queue methods for rate limit retry logic

  async addToCandidateExtractionQueue(resumeId: string): Promise<void> {
    await db
      .insert(candidateExtractionQueue)
      .values({ resumeId })
      .onConflictDoUpdate({
        target: candidateExtractionQueue.resumeId,
        set: { status: "pending", attemptCount: 0, nextRetryAt: null, lastError: null },
      });
  }

  async addToResumeAnonymizationQueue(resumeId: string): Promise<void> {
    await db
      .insert(resumeAnonymizationQueue)
      .values({ resumeId })
      .onConflictDoUpdate({
        target: resumeAnonymizationQueue.resumeId,
        set: { status: "pending", attemptCount: 0, nextRetryAt: null, lastError: null },
      });
  }

  async addToJobAnalysisQueue(jobDescriptionId: string): Promise<void> {
    await db
      .insert(jobAnalysisQueue)
      .values({ jobDescriptionId })
      .onConflictDoUpdate({
        target: jobAnalysisQueue.jobDescriptionId,
        set: { status: "pending", attemptCount: 0, nextRetryAt: null, lastError: null },
      });
  }

  async addToMatchQueue(candidateId: string, jobDescriptionId: string): Promise<void> {
    await db
      .insert(matchProcessingQueue)
      .values({ candidateId, jobDescriptionId })
      .onConflictDoUpdate({
        target: [matchProcessingQueue.candidateId, matchProcessingQueue.jobDescriptionId],
        set: { status: "pending", attemptCount: 0, nextRetryAt: null, lastError: null },
      });
  }

  async getRetryableCandidateExtractionJobs(limit?: number) {
    const now = new Date().toISOString();
    const query = db
      .select()
      .from(candidateExtractionQueue)
      .where(
        and(
          eq(candidateExtractionQueue.status, "pending"),
          or(
            isNull(candidateExtractionQueue.nextRetryAt),
            lte(candidateExtractionQueue.nextRetryAt, now)
          )
        )
      );

    if (limit !== undefined) {
      return await query.limit(limit);
    }

    return await query;
  }

  async getRetryableResumeAnonymizationJobs(limit?: number) {
    const now = new Date().toISOString();
    const query = db
      .select()
      .from(resumeAnonymizationQueue)
      .where(
        and(
          eq(resumeAnonymizationQueue.status, "pending"),
          or(
            isNull(resumeAnonymizationQueue.nextRetryAt),
            lte(resumeAnonymizationQueue.nextRetryAt, now)
          )
        )
      );

    if (limit !== undefined) {
      return await query.limit(limit);
    }

    return await query;
  }

  async getRetryableJobAnalysisJobs(limit?: number) {
    const now = new Date().toISOString();
    const query = db
      .select()
      .from(jobAnalysisQueue)
      .where(
        and(
          eq(jobAnalysisQueue.status, "pending"),
          or(isNull(jobAnalysisQueue.nextRetryAt), lte(jobAnalysisQueue.nextRetryAt, now))
        )
      );

    if (limit !== undefined) {
      return await query.limit(limit);
    }

    return await query;
  }

  async getRetryableMatchJobs(limit?: number) {
    const now = new Date().toISOString();
    const query = db
      .select()
      .from(matchProcessingQueue)
      .where(
        and(
          eq(matchProcessingQueue.status, "pending"),
          or(isNull(matchProcessingQueue.nextRetryAt), lte(matchProcessingQueue.nextRetryAt, now))
        )
      );

    if (limit !== undefined) {
      return await query.limit(limit);
    }

    return await query;
  }

  async incrementCandidateExtractionRetry(
    id: string,
    error: string,
    nextRetryAt: string
  ): Promise<void> {
    await db
      .update(candidateExtractionQueue)
      .set({
        attemptCount: sql`${candidateExtractionQueue.attemptCount} + 1`,
        lastError: error,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(candidateExtractionQueue.id, id));
  }

  async incrementResumeAnonymizationRetry(
    id: string,
    error: string,
    nextRetryAt: string
  ): Promise<void> {
    await db
      .update(resumeAnonymizationQueue)
      .set({
        attemptCount: sql`${resumeAnonymizationQueue.attemptCount} + 1`,
        lastError: error,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(resumeAnonymizationQueue.id, id));
  }

  async incrementJobAnalysisRetry(id: string, error: string, nextRetryAt: string): Promise<void> {
    await db
      .update(jobAnalysisQueue)
      .set({
        attemptCount: sql`${jobAnalysisQueue.attemptCount} + 1`,
        lastError: error,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(jobAnalysisQueue.id, id));
  }

  async incrementMatchRetry(id: string, error: string, nextRetryAt: string): Promise<void> {
    await db
      .update(matchProcessingQueue)
      .set({
        attemptCount: sql`${matchProcessingQueue.attemptCount} + 1`,
        lastError: error,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(matchProcessingQueue.id, id));
  }

  async completeCandidateExtractionJob(id: string): Promise<void> {
    await db.delete(candidateExtractionQueue).where(eq(candidateExtractionQueue.id, id));
  }

  async completeResumeAnonymizationJob(id: string): Promise<void> {
    await db.delete(resumeAnonymizationQueue).where(eq(resumeAnonymizationQueue.id, id));
  }

  async completeJobAnalysisJob(id: string): Promise<void> {
    await db.delete(jobAnalysisQueue).where(eq(jobAnalysisQueue.id, id));
  }

  async completeMatchJob(id: string): Promise<void> {
    await db.delete(matchProcessingQueue).where(eq(matchProcessingQueue.id, id));
  }

  async batchCompleteMatchJobs(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(matchProcessingQueue).where(inArray(matchProcessingQueue.id, ids));
  }

  async updateResumeHtml(resumeId: string, html: string): Promise<Resume> {
    const [updated] = await db
      .update(resumes)
      .set({ publicResumeHtml: html })
      .where(eq(resumes.id, resumeId))
      .returning();
    return updated;
  }

  /**
   * Atomically create match result and remove from queue in a transaction
   * This prevents duplicate matches if worker crashes between operations
   */
  async createMatchAndCompleteJob(
    matchData: InsertMatchResult,
    queueItemId: string
  ): Promise<MatchResult> {
    return await db.transaction(async (tx) => {
      // Create match result
      // Type assertion needed due to Drizzle's strict JSONB array type inference
      const [created] = await tx
        .insert(matchResults)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(matchData as any)
        .returning();

      // Remove from queue
      await tx.delete(matchProcessingQueue).where(eq(matchProcessingQueue.id, queueItemId));

      return created;
    });
  }

  /**
   * Batch create match results with chunking and duplicate handling
   * Chunks large batches to respect PostgreSQL parameter limits
   * Uses onConflictDoNothing to gracefully handle duplicates
   * Processes chunks in parallel for optimal performance
   */
  async batchCreateMatchResults(results: InsertMatchResult[]): Promise<MatchResult[]> {
    if (results.length === 0) return [];

    const BATCH_SIZE = 500; // Safe batch size respecting PostgreSQL 65535 param limit

    // Split into chunks
    const chunks: InsertMatchResult[][] = [];
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      chunks.push(results.slice(i, i + BATCH_SIZE));
    }

    // Process all chunks in parallel
    const chunkPromises = chunks.map(async (chunk) => {
      // Type assertion needed due to Drizzle's strict JSONB array type inference
      return await db
        .insert(matchResults)
        .values(chunk as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .returning()
        .onConflictDoNothing({
          target: [matchResults.resumeContentHash, matchResults.jobContentHash],
        });
    });

    const createdChunks = await Promise.all(chunkPromises);

    // Flatten results from all chunks
    return createdChunks.flat();
  }
}
