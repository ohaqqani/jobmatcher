import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { matchCandidates, type MatchResponse } from "../api/matchingApi";

interface UseMatchCandidatesOptions {
  jobId: string;
  onSuccess?: (data: MatchResponse) => void;
}

export function useMatchCandidates(options: UseMatchCandidatesOptions) {
  const { toast } = useToast();
  const { jobId } = options;

  return useMutation({
    mutationFn: (resumeIds: string[]) => matchCandidates(jobId, resumeIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-descriptions", jobId, "results"] });

      toast({
        title: "Matching complete",
        description: "All candidates have been analyzed successfully.",
      });

      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Matching failed",
        description: error.message || "Failed to analyze candidates",
        variant: "destructive",
      });
    },
  });
}
