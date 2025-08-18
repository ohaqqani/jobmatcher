import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CandidateWithMatch } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import CandidateTable from "./candidate-table";
import { EmptyState, LoadingState } from "./results-states";
import StatsCards from "./stats-cards";

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
  const { toast } = useToast();

  const matchMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/job-descriptions/${jobId}/match`, {
        resumeIds,
      });
      return response.json();
    },
    onSuccess: () => {
      setIsMatching(false);
      queryClient.invalidateQueries({ queryKey: ['/api/job-descriptions', jobId, 'results'] });
      toast({
        title: "Matching complete",
        description: "All candidates have been analyzed successfully.",
      });
    },
    onError: (error: any) => {
      setIsMatching(false);
      toast({
        title: "Matching failed",
        description: error.message || "Failed to analyze candidates",
        variant: "destructive",
      });
    },
  });

  const { data: results = [], isLoading } = useQuery<CandidateWithMatch[]>({
    queryKey: ['/api/job-descriptions', jobId, 'results'],
    enabled: !!jobId,
  });

  // Auto-trigger matching when resumeIds change
  useEffect(() => {
    const resumeIdsChanged = JSON.stringify(currentResumeIds.current) !== JSON.stringify(resumeIds);
    
    if (resumeIds.length > 0 && results.length === 0 && !isMatching && !matchMutation.isPending && 
        !hasTriggeredMatching.current && resumeIdsChanged) {
      hasTriggeredMatching.current = true;
      currentResumeIds.current = [...resumeIds];
      setIsMatching(true);
      matchMutation.mutate();
    }
  }, [resumeIds, results.length, isMatching, matchMutation]);

  // Reset ref when resumeIds change significantly (new upload)
  useEffect(() => {
    const resumeIdsChanged = JSON.stringify(currentResumeIds.current) !== JSON.stringify(resumeIds);
    if (resumeIdsChanged && resumeIds.length > 0) {
      console.log('Resume IDs changed, resetting matching flag');
      hasTriggeredMatching.current = false;
    }
  }, [resumeIds]);

  const handleExport = () => {
    if (results.length === 0) return;

    const csvData = results.map(candidate => ({
      'First Name': candidate.firstName,
      'Last Name': candidate.lastName,
      'Email': candidate.email,
      'Phone': candidate.phone || '',
      'Match Score': `${candidate.matchResult.matchScore}%`,
      'Skills': candidate.skills?.join(', ') || '',
      'Experience': typeof candidate.experience === 'string' 
        ? candidate.experience 
        : candidate.experience 
          ? JSON.stringify(candidate.experience).replace(/[{}",]/g, ' ').trim()
          : '',
      'File Name': candidate.resume.fileName,
      'Analysis': candidate.matchResult.analysis || '',
    }));

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'candidate-analysis-results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
  const averageMatch = totalCandidates > 0 
    ? Math.round(results.reduce((acc, r) => acc + r.matchResult.matchScore, 0) / totalCandidates) 
    : 0;
  const bestMatch = totalCandidates > 0 
    ? Math.max(...results.map(r => r.matchResult.matchScore)) 
    : 0;
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
