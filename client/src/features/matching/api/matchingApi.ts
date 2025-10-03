import { apiRequest } from "@/lib/queryClient";
import type { CandidateWithMatch } from "@shared/schemas";

export interface MatchRequest {
  resumeIds: string[];
}

export interface MatchResponse {
  matchResults: CandidateWithMatch[];
}

/**
 * Match candidates with a job description
 */
export async function matchCandidates(jobId: string, resumeIds: string[]): Promise<MatchResponse> {
  const response = await apiRequest("POST", `/api/job-descriptions/${jobId}/match`, {
    resumeIds,
  });
  return response.json();
}

/**
 * Get matching results for a job
 */
export async function getMatchResults(jobId: string): Promise<CandidateWithMatch[]> {
  const response = await apiRequest("GET", `/api/job-descriptions/${jobId}/results`);
  return response.json();
}
