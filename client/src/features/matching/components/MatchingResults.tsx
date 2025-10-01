import { useEffect, useRef, useState } from "react";
import CandidateTable from "@/components/candidate-table";
import { EmptyState, LoadingState } from "@/components/results-states";
import StatsCards from "@/components/stats-cards";
import { useMatchCandidates } from "../hooks/useMatchCandidates";
import { useMatchResults } from "../hooks/useMatchResults";
import { exportToCsv } from "../utils/exportResults";

interface MatchingResultsProps {
  jobId: string;
  resumeIds: string[];
}

export default function MatchingResults({ jobId, resumeIds }: MatchingResultsProps) {
  const [isMatching, setIsMatching] = useState(false);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const hasTriggeredMatching = useRef(false);
  const currentResumeIds = useRef<string[]>([]);

  const matchMutation = useMatchCandidates({
    jobId,
    onSuccess: () => {
      setIsMatching(false);
    },
  });

  const { data: results = [], isLoading } = useMatchResults({ jobId });

  // Auto-trigger matching when resumeIds change
  useEffect(() => {
    const resumeIdsChanged = JSON.stringify(currentResumeIds.current) !== JSON.stringify(resumeIds);

    if (
      resumeIds.length > 0 &&
      results.length === 0 &&
      !isMatching &&
      !matchMutation.isPending &&
      !hasTriggeredMatching.current &&
      resumeIdsChanged
    ) {
      hasTriggeredMatching.current = true;
      currentResumeIds.current = [...resumeIds];
      setIsMatching(true);
      matchMutation.mutate(resumeIds);
    }
  }, [resumeIds, results.length, isMatching, matchMutation]);

  // Reset ref when resumeIds change significantly (new upload)
  useEffect(() => {
    const resumeIdsChanged = JSON.stringify(currentResumeIds.current) !== JSON.stringify(resumeIds);
    if (resumeIdsChanged && resumeIds.length > 0) {
      console.log("Resume IDs changed, resetting matching flag");
      hasTriggeredMatching.current = false;
    }
  }, [resumeIds]);

  const handleExport = () => {
    exportToCsv(results);
  };

  const toggleRowExpansion = (candidateId: string) => {
    const newExpanded = new Set(expandedCandidates);
    if (newExpanded.has(candidateId)) {
      newExpanded.delete(candidateId);
    } else {
      newExpanded.add(candidateId);
    }
    setExpandedCandidates(newExpanded);
  };

  // Calculate stats
  const totalCandidates = results.length;
  const averageMatch =
    totalCandidates > 0
      ? Math.round(results.reduce((acc, r) => acc + r.matchResult.matchScore, 0) / totalCandidates)
      : 0;
  const bestMatch =
    totalCandidates > 0 ? Math.max(...results.map((r) => r.matchResult.matchScore)) : 0;
  const processingTime = 2; // Mock value

  // Pagination
  const itemsPerPage = 10;
  const totalPages = Math.ceil(totalCandidates / itemsPerPage);

  if (isLoading || isMatching) {
    return <LoadingState isMatching={isMatching} />;
  }

  if (!results || results.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <StatsCards
        totalCandidates={totalCandidates}
        averageMatch={averageMatch}
        bestMatch={bestMatch}
        processingTime={processingTime}
      />

      <CandidateTable
        candidates={results}
        expandedCandidates={expandedCandidates}
        onRowToggle={toggleRowExpansion}
        onExport={handleExport}
        totalPages={totalPages}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
