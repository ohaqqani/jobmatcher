import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CandidateWithMatch } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Clock, Download, Filter, TrendingUp, Trophy, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MatchingResultsProps {
  jobId: string;
  resumeIds: string[];
}

export default function MatchingResults({ jobId, resumeIds }: MatchingResultsProps) {
  const [isMatching, setIsMatching] = useState(false);
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
    // Check if resumeIds actually changed
    const resumeIdsChanged = JSON.stringify(currentResumeIds.current) !== JSON.stringify(resumeIds);
    
    if (resumeIds.length > 0 && results.length === 0 && !isMatching && !matchMutation.isPending && 
        !hasTriggeredMatching.current && resumeIdsChanged) {
      console.log('Auto-triggering matching for:', resumeIds.length, 'resumes');
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

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0).toUpperCase()}${lastName.charAt(0).toUpperCase()}`;
  };

  const getMatchColor = (score: number) => {
    if (score >= 80) return 'bg-accent';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
  };

  const stats = {
    total: results.length,
    average: results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.matchResult.matchScore, 0) / results.length) : 0,
    best: results.length > 0 ? Math.max(...results.map(r => r.matchResult.matchScore)) : 0,
  };

  if (isLoading || isMatching || matchMutation.isPending) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="p-8 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {isMatching || matchMutation.isPending ? "Analyzing candidates..." : "Loading results..."}
          </h3>
          <p className="text-gray-500">
            Please wait while we process the candidate matching analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="p-8 text-center">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results yet</h3>
          <p className="text-gray-500">
            Upload resumes and create a job description to see matching results.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <BarChart3 className="text-primary mr-2 h-5 w-5" />
              <h2 className="text-lg font-semibold text-gray-900">Candidate Analysis Results</h2>
              <Badge variant="secondary" className="ml-2">
                {results.length} candidate{results.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filter
              </Button>
              <Button onClick={handleExport} size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export Results
              </Button>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[200px]">
                  Candidate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[100px]">
                  Match Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Key Skills & Experience
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Analysis
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((candidate, index) => (
                <tr key={`${candidate.id}-${index}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap max-w-[200px]">
                    <div className="mb-3">
                      <div className="text-sm font-medium text-gray-900 text-wrap">
                        {candidate.firstName} {candidate.lastName}
                      </div>
                      <div className="text-sm text-gray-500 truncate">{candidate.resume.fileName}</div>
                    </div>
                    <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="text-sm text-gray-900 text-wrap truncate max-w-[200px] cursor-help">{candidate.email}</div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div>
                            <p>{candidate.email}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                    </TooltipProvider>
                    <div className="text-sm text-gray-500">{candidate.phone || 'N/A'}</div>
                  </td>
                 
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center max-w-[100px]">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                        <div
                          className={`h-2 rounded-full ${getMatchColor(candidate.matchResult.matchScore)}`}
                          style={{ width: `${candidate.matchResult.matchScore}%` }}
                        />
                      </div>
                      <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-sm font-semibold text-gray-900 font-mono cursor-help">
                        {candidate.matchResult.matchScore}%
                      </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-lg">
                              <div className="p-2">
                                <h4 className="font-semibold mb-2 text-sm">Detailed Scorecard</h4>
                                {candidate.matchResult.scorecard && Object.keys(candidate.matchResult.scorecard).length > 0 ? (
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left py-1 px-2 font-medium">Criteria</th>
                                        <th className="text-left py-1 px-2 font-medium">Weight</th>
                                        <th className="text-left py-1 px-2 font-medium">Score</th>
                                        <th className="text-left py-1 px-2 font-medium">Comments</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.entries(candidate.matchResult.scorecard).map(([criteria, details]: [string, any]) => (
                                        <tr key={criteria} className="border-b border-gray-100">
                                          <td className="py-1 px-2 font-medium">{criteria}</td>
                                          <td className="py-1 px-2">{details?.weight || details?.[0] || 'N/A'}</td>
                                          <td className="py-1 px-2">{details?.score || details?.[1] || 'N/A'}</td>
                                          <td className="py-1 px-2 max-w-[200px] text-wrap">{details?.comments || details?.[2] || 'N/A'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <p className="text-xs text-gray-500">No detailed scorecard available</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                    </TooltipProvider>
                      
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap max-w-lg">
                  
                    <div className="text-sm text-gray-900 text-wrap">
                      {typeof candidate.experience === 'string' 
                        ? candidate.experience 
                        : candidate.experience 
                          ? JSON.stringify(candidate.experience).replace(/[{}",]/g, ' ').trim()
                          : 'N/A'
                      }
                    </div>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {candidate.skills?.slice(0, 3).map((skill, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {candidate.skills && candidate.skills.length > 3 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-xs cursor-help">
                                +{candidate.skills.length - 3} more
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <div className="flex flex-wrap gap-1">
                                {candidate.skills.slice(3).map((skill, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-600 text-wrap" dangerouslySetInnerHTML={{ __html: candidate.matchResult.analysis || '<p>No analysis available</p>' }}>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-white px-6 py-3 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">1</span> to <span className="font-medium">{results.length}</span> of{' '}
              <span className="font-medium">{results.length}</span> candidates
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
        <Card className="border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="text-primary h-5 w-5" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Candidates</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="text-accent h-5 w-5" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Avg Match Score</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.average}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Trophy className="text-warning h-5 w-5" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Best Match</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.best}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="text-purple-600 h-5 w-5" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Processing Time</p>
                <p className="text-2xl font-semibold text-gray-900">~2s</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
