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
} from "@shared/schemas";
import { PostgresStorage } from "./db/storage";

export interface IStorage {
  // Job Description methods
  createJobDescription(jobDesc: InsertJobDescription): Promise<JobDescription>;
  getJobDescription(id: string): Promise<JobDescription | undefined>;
  getJobDescriptionByHash(hash: string): Promise<JobDescription | undefined>;
  analyzeJobDescription(id: string, requiredSkills: string[]): Promise<JobDescription>;

  // Resume methods
  createResume(resume: InsertResume): Promise<Resume>;
  getResume(id: string): Promise<Resume | undefined>;
  getResumesByIds(ids: string[]): Promise<Resume[]>;
  getResumeByHash(hash: string): Promise<Resume | undefined>;

  // Candidate methods
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  getCandidate(id: string): Promise<Candidate | undefined>;
  getCandidatesByResumeIds(resumeIds: string[]): Promise<Candidate[]>;
  getCandidateByResumeId(resumeId: string): Promise<Candidate | undefined>;

  // Match Result methods
  createMatchResult(matchResult: InsertMatchResult): Promise<MatchResult>;
  getMatchResultsByJobId(jobId: string): Promise<CandidateWithMatch[]>;
  getMatchResult(candidateId: string, jobId: string): Promise<MatchResult | undefined>;
  getMatchResultByHashes(resumeHash: string, jobHash: string): Promise<MatchResult | undefined>;
}

export const storage = new PostgresStorage();
