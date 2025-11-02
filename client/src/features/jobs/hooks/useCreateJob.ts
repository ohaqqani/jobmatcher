import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  createJob,
  type CreateJobData,
  type CreateJobResponse,
  type JobDescription,
} from "../api/jobsApi";

interface UseCreateJobOptions {
  onSuccess?: (jobDesc: JobDescription, analysisStatus: "complete" | "queued") => void;
}

export function useCreateJob(options?: UseCreateJobOptions) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateJobData) => createJob(data),
    onSuccess: (response: CreateJobResponse) => {
      if (response.analysisStatus === "complete") {
        toast({
          title: "Job description created & analyzed",
          description: `Successfully extracted ${response.job.requiredSkills.length} required skills.`,
        });
      } else if (response.analysisStatus === "queued") {
        toast({
          title: "Job description created",
          description:
            response.message ||
            "Analysis is queued and will complete automatically within a few minutes.",
        });
      }
      options?.onSuccess?.(response.job, response.analysisStatus);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create job description",
        variant: "destructive",
      });
    },
  });
}
