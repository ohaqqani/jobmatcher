import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface LoadingStateProps {
  isMatching: boolean;
}

export function LoadingState({ isMatching }: LoadingStateProps) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {isMatching ? "Analyzing candidates..." : "Loading results..."}
        </h3>
        <p className="text-gray-500">
          Please wait while we process the candidate matching analysis.
        </p>
      </CardContent>
    </Card>
  );
}

export function EmptyState() {
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
