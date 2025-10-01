import { useQuery } from "@tanstack/react-query";
import type { CandidateWithMatch } from "@shared/schemas";

interface UseMatchResultsOptions {
  jobId: string;
  enabled?: boolean;
}

export function useMatchResults({ jobId, enabled = true }: UseMatchResultsOptions) {
  return useQuery<CandidateWithMatch[]>({
    queryKey: ["/api/job-descriptions", jobId, "results"],
    enabled: enabled && !!jobId,
  });
}
