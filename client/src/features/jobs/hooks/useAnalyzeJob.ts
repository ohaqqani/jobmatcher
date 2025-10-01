import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { analyzeJob, type JobDescription } from "../api/jobsApi";

interface UseAnalyzeJobOptions {
  onSuccess?: (jobDesc: JobDescription) => void;
}

export function useAnalyzeJob(options?: UseAnalyzeJobOptions) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (jobId: string) => analyzeJob(jobId),
    onSuccess: (jobDesc) => {
      toast({
        title: "Analysis complete",
        description: "Job requirements have been analyzed successfully.",
      });
      options?.onSuccess?.(jobDesc);
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze job requirements",
        variant: "destructive",
      });
    },
  });
}
