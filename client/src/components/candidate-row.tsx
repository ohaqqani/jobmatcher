import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CandidateWithMatch } from "@shared/schema";
import { BarChart3, TrendingUp } from "lucide-react";

interface CandidateRowProps {
  candidate: CandidateWithMatch;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function CandidateRow({ candidate, index, isExpanded, onToggle }: CandidateRowProps) {
  const getMatchColor = (score: number) => {
    if (score >= 80) return 'bg-accent';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
  };

  const getMatchBadge = (score: number) => {
    if (score >= 80) return { text: 'Excellent', variant: 'default' as const };
    if (score >= 60) return { text: 'Good', variant: 'secondary' as const };
    return { text: 'Needs Review', variant: 'destructive' as const };
  };

  // Handle missing matchResult
  const matchScore = candidate.matchResult?.matchScore ?? 0;
  const badge = getMatchBadge(matchScore);

  return (
    <>
      <tr className="hover:bg-slate-50/80 transition-all duration-300 border-b border-slate-200 bg-white shadow-sm hover:shadow-md group">
        {/* Candidate Column */}
        <td className="px-6 py-6 w-64 overflow-hidden border-r border-slate-200">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
              {candidate.firstName} {candidate.lastName}
            </div>
            <div className="text-sm text-slate-500 truncate">{candidate.resume.fileName}</div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="text-sm text-slate-700 truncate cursor-help hover:text-blue-600 transition-colors">
                  {candidate.email}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs bg-slate-800 text-white border-slate-700">
                <div>
                  <p>{candidate.email}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="text-sm text-slate-500">{candidate.phone || 'N/A'}</div>
        </td>

        {/* Experience & Key Skills Column */}
        <td className="px-6 py-4 w-auto border-r border-slate-200">
          <div className="space-y-3">
            {/* Experience Section */}
            {candidate.experience && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  Experience
                </div>
                <div className="text-sm text-slate-700 leading-relaxed">
                  {candidate.experience}
                </div>
              </div>
            )}

            {/* Skills Section */}
            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Key Skills
              </div>
              {candidate.skills && candidate.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.slice(0, 6).map((skill: string, index: number) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-white"
                    >
                      {skill}
                    </span>
                  ))}
                  {candidate.skills.length > 6 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-xs text-slate-500 px-2 py-1 font-medium cursor-help hover:text-blue-600 transition-colors">
                            +{candidate.skills.length - 6} more
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs bg-slate-800 text-white border-slate-700">
                          <div className="space-y-1">
                            <p className="font-semibold text-xs mb-2">Additional Skills:</p>
                            {candidate.skills.slice(6).map((skill: string, index: number) => (
                              <div key={index} className="text-xs">• {skill}</div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-400 italic">
                  No skills listed
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Match Score Column (now rightmost) */}
        <td className="px-6 py-4 w-40">
          <div className="space-y-4">
            <div className="flex justify-center">
              <Badge variant={badge.variant} className="shadow-sm font-semibold">{badge.text}</Badge>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-900 mb-2">{matchScore}%</div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 shadow-inner">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${getMatchColor(matchScore)} shadow-sm`}
                  style={{ width: `${matchScore}%` }}
                ></div>
              </div>
            </div>
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onToggle}
                className="text-xs font-medium border-slate-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all duration-200"
              >
                {isExpanded ? 'Hide Analysis' : 'View Analysis'}
              </Button>
            </div>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/80 border-b-2 border-blue-200/60 shadow-inner">
          <td colSpan={3} className="px-8 py-8">
            <div className="space-y-6 max-w-none">
              {/* Scorecard Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-3 text-blue-600" />
                  Detailed Scorecard
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 bg-slate-50/50">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Category</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Score</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Weight</th>
                        <th className="text-center py-3 px-4 font-semibold text-slate-700">Weighted Score</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidate.matchResult?.scorecard && Object.entries(candidate.matchResult.scorecard).map(([category, data], index) => {

                        let score: number;
                        let weight: number;
                        let comments: string;

                        // Now that the schema is correct, we can access the properties directly
                        score = data.score || 0;
                        weight = data.weight || 0;
                        comments = data.comments || 'No comments available';

                        const weightedScore = Math.round((score * weight) / 100);
                        
                        return (
                          <tr key={index} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900">{category}</td>
                            <td className="text-center py-3 px-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                {Math.round(score)}/100
                              </span>
                            </td>
                            <td className="text-center py-3 px-4 text-slate-600 font-medium">{Math.round(weight)}%</td>
                            <td className="text-center py-3 px-4">
                              <span className="font-bold text-slate-900">
                                {weightedScore}/100
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-600 leading-relaxed">
                              {comments}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Analysis Section */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <h4 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                  <TrendingUp className="h-5 w-5 mr-3 text-emerald-600" />
                  Analysis
                </h4>
                <div 
                  className="text-slate-700 leading-relaxed prose prose-sm max-w-none prose-headings:text-slate-900 prose-strong:text-slate-900 prose-blue"
                  dangerouslySetInnerHTML={{ 
                    __html: candidate.matchResult?.analysis || 'No analysis available' 
                  }}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
