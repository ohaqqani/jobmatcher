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
import { randomUUID } from "crypto";

export interface IStorage {
  // Job Description methods
  createJobDescription(jobDesc: InsertJobDescription): Promise<JobDescription>;
  getJobDescription(id: string): Promise<JobDescription | undefined>;
  analyzeJobDescription(id: string, requiredSkills: string[]): Promise<JobDescription>;

  // Resume methods
  createResume(resume: InsertResume): Promise<Resume>;
  getResume(id: string): Promise<Resume | undefined>;
  getResumesByIds(ids: string[]): Promise<Resume[]>;

  // Candidate methods
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  getCandidate(id: string): Promise<Candidate | undefined>;
  getCandidatesByResumeIds(resumeIds: string[]): Promise<Candidate[]>;

  // Match Result methods
  createMatchResult(matchResult: InsertMatchResult): Promise<MatchResult>;
  getMatchResultsByJobId(jobId: string): Promise<CandidateWithMatch[]>;
  getMatchResult(candidateId: string, jobId: string): Promise<MatchResult | undefined>;
}

export class MemStorage implements IStorage {
  private jobDescriptions: Map<string, JobDescription>;
  private resumes: Map<string, Resume>;
  private candidates: Map<string, Candidate>;
  private matchResults: Map<string, MatchResult>;

  constructor() {
    this.jobDescriptions = new Map();
    this.resumes = new Map();
    this.candidates = new Map();
    this.matchResults = new Map();
  }

  // Job Description methods
  async createJobDescription(insertJobDesc: InsertJobDescription): Promise<JobDescription> {
    const id = randomUUID();
    const jobDesc: JobDescription = {
      ...insertJobDesc,
      id,
      requiredSkills: [],
      analyzedAt: new Date(),
    };
    this.jobDescriptions.set(id, jobDesc);
    return jobDesc;
  }

  async getJobDescription(id: string): Promise<JobDescription | undefined> {
    return this.jobDescriptions.get(id);
  }

  async analyzeJobDescription(id: string, requiredSkills: string[]): Promise<JobDescription> {
    const jobDesc = this.jobDescriptions.get(id);
    if (!jobDesc) throw new Error("Job description not found");

    const updated: JobDescription = {
      ...jobDesc,
      requiredSkills,
      analyzedAt: new Date(),
    };
    this.jobDescriptions.set(id, updated);
    return updated;
  }

  // Resume methods
  async createResume(insertResume: InsertResume): Promise<Resume> {
    const id = randomUUID();
    const resume: Resume = {
      ...insertResume,
      id,
      publicResumeHtml: insertResume.publicResumeHtml ?? null,
      uploadedAt: new Date(),
    };
    this.resumes.set(id, resume);
    return resume;
  }

  async getResume(id: string): Promise<Resume | undefined> {
    return this.resumes.get(id);
  }

  async getResumesByIds(ids: string[]): Promise<Resume[]> {
    return ids.map((id) => this.resumes.get(id)).filter(Boolean) as Resume[];
  }

  // Candidate methods
  async createCandidate(insertCandidate: InsertCandidate): Promise<Candidate> {
    const id = randomUUID();
    const candidate: Candidate = {
      ...insertCandidate,
      id,
      phone: insertCandidate.phone ?? null,
      experience: insertCandidate.experience ?? null,
      skills: Array.isArray(insertCandidate.skills) ? (insertCandidate.skills as string[]) : null,
      extractedAt: new Date(),
    };
    this.candidates.set(id, candidate);
    return candidate;
  }

  async getCandidate(id: string): Promise<Candidate | undefined> {
    return this.candidates.get(id);
  }

  async getCandidatesByResumeIds(resumeIds: string[]): Promise<Candidate[]> {
    return Array.from(this.candidates.values()).filter((candidate) =>
      resumeIds.includes(candidate.resumeId)
    );
  }

  // Match Result methods
  async createMatchResult(insertMatchResult: InsertMatchResult): Promise<MatchResult> {
    const id = randomUUID();
    const matchResult: MatchResult = {
      ...insertMatchResult,
      id,
      scorecard: insertMatchResult.scorecard ?? {},
      matchingSkills: Array.isArray(insertMatchResult.matchingSkills)
        ? (insertMatchResult.matchingSkills as string[])
        : null,
      analysis: insertMatchResult.analysis ?? null,
      createdAt: new Date(),
    };
    this.matchResults.set(id, matchResult);
    return matchResult;
  }

  async getMatchResultsByJobId(jobId: string): Promise<CandidateWithMatch[]> {
    const matchResults = Array.from(this.matchResults.values()).filter(
      (result) => result.jobDescriptionId === jobId
    );

    // Process all match results in parallel
    const candidatesWithMatchPromises = matchResults.map(async (matchResult) => {
      const candidate = this.candidates.get(matchResult.candidateId);
      if (!candidate) return null;

      const resume = this.resumes.get(candidate.resumeId);
      if (!resume) return null;

      return {
        ...candidate,
        resume,
        matchResult,
      } as CandidateWithMatch;
    });

    const candidatesWithMatch = (await Promise.all(candidatesWithMatchPromises)).filter(
      Boolean
    ) as CandidateWithMatch[];

    return candidatesWithMatch.sort((a, b) => b.matchResult.matchScore - a.matchResult.matchScore);
  }

  async getMatchResult(candidateId: string, jobId: string): Promise<MatchResult | undefined> {
    return Array.from(this.matchResults.values()).find(
      (result) => result.candidateId === candidateId && result.jobDescriptionId === jobId
    );
  }
}

export const storage = new MemStorage();
