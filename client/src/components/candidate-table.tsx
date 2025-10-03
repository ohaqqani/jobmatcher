import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CandidateWithMatch } from "@shared/schemas";
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
  onPageChange,
}: CandidateTableProps) {
  return (
    <Card className="border border-slate-200 overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div className="p-6 border-b border-slate-200 bg-slate-50/50">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <h2 className="text-xl font-bold text-slate-900">Candidate Analysis Results</h2>
          </div>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200 hover:text-slate-800"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button
              onClick={onExport}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md transition-all duration-200"
            >
              <Download className="mr-2 h-4 w-4" />
              Export Results
            </Button>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-64" /> {/* Candidate - 256px */}
            <col className="w-auto" /> {/* Key Skills & Experience - flexible */}
            <col className="w-40" /> {/* Match Score - 160px */}
          </colgroup>
          <thead className="bg-slate-100/70">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-64 border-r border-slate-200">
                Candidate
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200">
                Experience & Key Skills
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider w-40">
                Match Score
              </th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {candidates.map((candidate, index) => (
              <CandidateRow
                key={`${candidate.id}-${index}`}
                candidate={candidate}
                isExpanded={expandedCandidates.has(candidate.id)}
                onToggle={() => onRowToggle(candidate.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-200">
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600 font-medium">
            Showing <span className="font-bold text-slate-900">1</span> to{" "}
            <span className="font-bold text-slate-900">{candidates.length}</span> of{" "}
            <span className="font-bold text-slate-900">{candidates.length}</span> candidates
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-all duration-200"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition-all duration-200"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
