import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CandidateWithMatch } from "@shared/schema";
import { Download, Filter } from "lucide-react";
import CandidateRow from "./candidate-row";

interface CandidateTableProps {
  candidates: CandidateWithMatch[];
  expandedCandidates: Set<string>;
  onRowToggle: (candidateId: string) => void;
  onExport: () => void;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export default function CandidateTable({ 
  candidates, 
  expandedCandidates, 
  onRowToggle, 
  onExport, 
  totalPages, 
  currentPage, 
  onPageChange 
}: CandidateTableProps) {
  return (
    <Card className="border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-gray-900">Candidate Analysis Results</h2>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button onClick={onExport} size="sm">
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
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {candidates.map((candidate, index) => (
              <CandidateRow 
                key={`${candidate.id}-${index}`} 
                candidate={candidate} 
                index={index}
                isExpanded={expandedCandidates.has(candidate.id)}
                onToggle={() => onRowToggle(candidate.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white px-6 py-3 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">1</span> to <span className="font-medium">{candidates.length}</span> of{' '}
            <span className="font-medium">{candidates.length}</span> candidates
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
