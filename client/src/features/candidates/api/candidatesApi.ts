export interface CandidateInfo {
  firstName: string;
  lastName: string;
  lastInitial: string;
  email: string;
  phone?: string;
  skills: string[];
  skills_comma_separated: string;
  experience?: string;
}

export interface UploadResult {
  resumeId?: string;
  candidateId?: string;
  candidateInfo?: CandidateInfo;
  fileName: string;
  status: "completed" | "failed";
  error?: string;
  fileIndex: number;
}

export interface UploadResponse {
  results: UploadResult[];
  summary: {
    totalFiles: number;
    successfulUploads: number;
    failedUploads: number;
    message: string;
  };
}

/**
 * Upload resume files for processing
 */
export async function uploadResumes(formData: FormData): Promise<UploadResponse> {
  const response = await fetch("/api/resumes/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || response.statusText);
  }

  return response.json();
}
