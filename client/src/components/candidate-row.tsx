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

  return (
    <>
      <tr className="hover:bg-gray-50">
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
                <div className="text-sm text-gray-900 text-wrap truncate max-w-[200px] cursor-help">
                  {candidate.email}
                </div>
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
          <Badge 
            variant={candidate.matchResult.matchScore >= 80 ? "default" : candidate.matchResult.matchScore >= 60 ? "secondary" : "outline"}
            className="gap-1 mb-2"
          >
            {candidate.matchResult.matchScore >= 80 ? (
              <>
                <TrendingUp className="h-3 w-3" />
                Excellent
              </>
            ) : candidate.matchResult.matchScore >= 60 ? (
              <>
                <BarChart3 className="h-3 w-3" />
                Good
              </>
            ) : (
              "Needs Review"
            )}
          </Badge>
          <div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onToggle}
            >
              {isExpanded ? "Hide Details" : "View Details"}
            </Button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={5} className="py-4 px-6 bg-muted/20">
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                AI Analysis
              </h4>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div 
                  className="text-sm text-gray-600 text-wrap max-w-none
                    [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-800 [&_h1]:mt-4 [&_h1]:mb-1
                    [&_p]:mb-1 [&_p]:leading-snug
                    [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:list-outside
                    [&_li]:mb-0.5 [&_li]:leading-snug
                    [&_strong]:font-medium [&_strong]:text-gray-900"
                  dangerouslySetInnerHTML={{ 
                    __html: candidate.matchResult.analysis?.replace(/\n/g, '<br>') || '<p>No analysis available</p>' 
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
