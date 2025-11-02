import { apiRequest } from "@/lib/queryClient";

export interface CreateJobData {
  title: string;
  description: string;
}

export interface JobDescription {
  id: string;
  title: string;
  description: string;
  requiredSkills: string[];
  analyzedAt: Date;
}

export interface CreateJobResponse {
  job: JobDescription;
  analysisStatus: "complete" | "queued";
  message?: string;
}

/**
 * Create a new job description and analyze it with AI
 * Returns the job description along with analysis status.
 * If analysis is queued due to rate limits, the job is still created
 * and will be analyzed automatically by background workers.
 */
export async function createJob(data: CreateJobData): Promise<CreateJobResponse> {
  const response = await apiRequest("POST", "/api/job-descriptions", data);
  return response.json();
}

/**
 * Get job description by ID
 */
export async function getJob(jobId: string): Promise<JobDescription> {
  const response = await apiRequest("GET", `/api/job-descriptions/${jobId}`);
  return response.json();
}
