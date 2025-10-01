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

/**
 * Create a new job description
 */
export async function createJob(data: CreateJobData): Promise<JobDescription> {
  const response = await apiRequest("POST", "/api/job-descriptions", data);
  return response.json();
}

/**
 * Analyze job description with AI to extract required skills
 */
export async function analyzeJob(jobId: string): Promise<JobDescription> {
  const response = await apiRequest("POST", `/api/job-descriptions/${jobId}/analyze`);
  return response.json();
}

/**
 * Get job description by ID
 */
export async function getJob(jobId: string): Promise<JobDescription> {
  const response = await apiRequest("GET", `/api/job-descriptions/${jobId}`);
  return response.json();
}
