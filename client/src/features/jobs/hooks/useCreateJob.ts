import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { createJob, type CreateJobData, type JobDescription } from "../api/jobsApi";

interface UseCreateJobOptions {
  onSuccess?: (jobDesc: JobDescription) => void;
}

export function useCreateJob(options?: UseCreateJobOptions) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateJobData) => createJob(data),
    onSuccess: (jobDesc) => {
      toast({
        title: "Job description created",
        description: "Your job description has been saved successfully.",
      });
      options?.onSuccess?.(jobDesc);
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
