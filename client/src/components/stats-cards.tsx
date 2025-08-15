import { Card, CardContent } from "@/components/ui/card";
import { Clock, TrendingUp, Trophy, Users } from "lucide-react";

interface StatsCardsProps {
  totalCandidates: number;
  averageMatch: number;
  bestMatch: number;
  processingTime: number;
}

export default function StatsCards({ 
  totalCandidates, 
  averageMatch, 
  bestMatch, 
  processingTime 
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">{/* removed mt-8 */}
      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="text-primary h-5 w-5" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Candidates</p>
              <p className="text-2xl font-semibold text-gray-900">{totalCandidates}</p>
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
              <p className="text-2xl font-semibold text-gray-900">{averageMatch}%</p>
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
              <p className="text-2xl font-semibold text-gray-900">{bestMatch}%</p>
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
              <p className="text-2xl font-semibold text-gray-900">{processingTime}s</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
