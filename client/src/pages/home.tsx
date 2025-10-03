import JobDescriptionForm from "@/features/jobs/components/JobDescriptionForm";
import MatchingResults from "@/features/matching/components/MatchingResults";
import ProcessingStatus from "@/components/processing-status";
import ResumeUpload from "@/features/candidates/components/ResumeUpload";
import { Button } from "@/components/ui/button";
import { HelpCircle, Search, User } from "lucide-react";
import { useState } from "react";

interface ProcessingFile {
  name: string;
  status: "processing";
  progress: number;
}

export default function Home() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [uploadedResumes, setUploadedResumes] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFiles, setProcessingFiles] = useState<ProcessingFile[]>([]);
  const [isAnalyzingComplete, setIsAnalyzingComplete] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm shadow-sm border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Search className="text-blue-600 text-2xl mr-3" />
              <h1 className="text-xl font-bold text-slate-900">Job Matcher</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" className="hover:bg-slate-100 transition-colors">
                <HelpCircle className="h-5 w-5" />
              </Button>
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                <User className="text-white text-sm" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Section: Job Description and Resume Upload */}
        <div className="grid grid-cols-1 gap-8 mb-8">
          <JobDescriptionForm
            onJobCreated={setCurrentJobId}
            currentJobId={currentJobId}
            setIsAnalyzingComplete={setIsAnalyzingComplete}
          />
          {isAnalyzingComplete && (
            <ResumeUpload
              onFilesUploaded={setUploadedResumes}
              onProcessingUpdate={setProcessingFiles}
              setIsProcessing={setIsProcessing}
            />
          )}
        </div>

        {/* Processing Status */}
        {isProcessing && processingFiles.length > 0 && <ProcessingStatus files={processingFiles} />}

        {/* Results Section */}
        {currentJobId && uploadedResumes.length > 0 && (
          <MatchingResults jobId={currentJobId} resumeIds={uploadedResumes} />
        )}

        {/* Empty State */}
        {(!currentJobId || uploadedResumes.length === 0) && !isProcessing && (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Get started with resume matching
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {!currentJobId
                ? "Enter a job description and upload resumes to begin analyzing candidates."
                : "Upload resumes to start matching candidates against your job requirements."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
