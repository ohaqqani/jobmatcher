import type { Candidate } from "./candidates";
import type { Resume } from "./candidates";
import type { MatchResult } from "./matching";

export type CandidateWithMatch = Candidate & {
  resume: Resume;
  matchResult: MatchResult;
};

export type ProcessingStatus = {
  id: string;
  fileName: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  error?: string;
};

export type PublicCandidateProfile = {
  id: string;
  firstName: string;
  lastInitial: string;
  skills: string[];
  experience: string;
  public_resume?: string; // HTML formatted resume as a string
};
