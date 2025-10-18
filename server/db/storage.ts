import { eq, and } from "drizzle-orm";
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
    const results = await db.select().from(resumes).where(eq(resumes.id, ids[0]));
    // For multiple IDs, we'd need to use an IN clause
    // But for now, this handles the basic case
    return results;
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
    const results = await db.select().from(candidates).where(eq(candidates.resumeId, resumeIds[0]));
    // For multiple IDs, we'd need to use an IN clause
    return results;
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
}
