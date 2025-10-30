import { eq, and, lte, inArray, or, isNull } from "drizzle-orm";
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
    const [current] = await db
      .select()
      .from(candidateExtractionQueue)
      .where(eq(candidateExtractionQueue.id, id));
    await db
      .update(candidateExtractionQueue)
      .set({
        attemptCount: (current?.attemptCount || 0) + 1,
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
    const [current] = await db
      .select()
      .from(resumeAnonymizationQueue)
      .where(eq(resumeAnonymizationQueue.id, id));
    await db
      .update(resumeAnonymizationQueue)
      .set({
        attemptCount: (current?.attemptCount || 0) + 1,
        lastError: error,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(resumeAnonymizationQueue.id, id));
  }

  async incrementJobAnalysisRetry(id: string, error: string, nextRetryAt: string): Promise<void> {
    const [current] = await db.select().from(jobAnalysisQueue).where(eq(jobAnalysisQueue.id, id));
    await db
      .update(jobAnalysisQueue)
      .set({
        attemptCount: (current?.attemptCount || 0) + 1,
        lastError: error,
        nextRetryAt: nextRetryAt,
      })
      .where(eq(jobAnalysisQueue.id, id));
  }

  async incrementMatchRetry(id: string, error: string, nextRetryAt: string): Promise<void> {
    const [current] = await db
      .select()
      .from(matchProcessingQueue)
      .where(eq(matchProcessingQueue.id, id));
    await db
      .update(matchProcessingQueue)
      .set({
        attemptCount: (current?.attemptCount || 0) + 1,
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

  async updateResumeHtml(resumeId: string, html: string): Promise<Resume> {
    const [updated] = await db
      .update(resumes)
      .set({ publicResumeHtml: html })
      .where(eq(resumes.id, resumeId))
      .returning();
    return updated;
  }
}
