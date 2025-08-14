import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { CloudUpload, FileText, Settings, CheckCircle, X, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ResumeUploadProps {
  onFilesUploaded: (resumeIds: string[]) => void;
  onProcessingUpdate: (files: any[]) => void;
  setIsProcessing: (processing: boolean) => void;
}

export default function ResumeUpload({ 
  onFilesUploaded, 
  onProcessingUpdate, 
  setIsProcessing 
}: ResumeUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/resumes/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || response.statusText);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setIsProcessing(false);
      const successfulUploads = data.results.filter((r: any) => r.status === 'completed');
      const resumeIds = successfulUploads.map((r: any) => r.resumeId);
      
      onFilesUploaded(resumeIds);
      setUploadedFiles(data.results);
      
      const successCount = successfulUploads.length;
      const failureCount = data.results.length - successCount;
      
      toast({
        title: "Upload complete",
        description: `${successCount} resumes processed successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
        variant: failureCount > 0 ? "destructive" : "default",
      });
    },
    onError: (error: any) => {
      setIsProcessing(false);
      onProcessingUpdate([]);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload resumes",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (files: FileList) => {
    const fileArray = Array.from(files);
    
    // Validate files
    const validFiles = fileArray.filter(file => {
      const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a valid file type. Only PDF, DOC, and DOCX files are allowed.`,
          variant: "destructive",
        });
        return false;
      }
      
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${file.name} is too large. Maximum file size is 10MB.`,
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    });

    if (validFiles.length === 0) return;

    // Create processing status
    const processingFiles = validFiles.map(file => ({
      name: file.name,
      status: 'processing' as const,
      progress: 0,
    }));
    
    onProcessingUpdate(processingFiles);
    setIsProcessing(true);

    // Create form data
    const formData = new FormData();
    validFiles.forEach(file => {
      formData.append('resumes', file);
    });

    uploadMutation.mutate(formData);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    
    const successfulUploads = newFiles.filter(f => f.status === 'completed');
    const resumeIds = successfulUploads.map(f => f.resumeId);
    onFilesUploaded(resumeIds);
  };

  return (
    <Card className="border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <CloudUpload className="text-primary mr-2 h-5 w-5" />
          <h2 className="text-lg font-semibold text-gray-900">Upload Resumes</h2>
        </div>
        
        <div className="space-y-4">
          {/* Drag and Drop Zone */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors duration-200 cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">Drop resume files here</p>
            <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
            <p className="text-xs text-gray-400">Supports PDF, DOC, DOCX • Max 10MB per file</p>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".pdf,.doc,.docx"
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
              className="hidden"
            />
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              {uploadedFiles.map((file, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 border rounded-md ${
                    file.status === 'completed' 
                      ? 'bg-green-50 border-green-200' 
                      : file.status === 'failed'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-center">
                    <FileText className={`mr-2 h-4 w-4 ${
                      file.status === 'completed' 
                        ? 'text-green-600' 
                        : file.status === 'failed'
                        ? 'text-red-600'
                        : 'text-blue-600'
                    }`} />
                    <span className="text-sm font-medium text-gray-900">{file.fileName}</span>
                  </div>
                  <div className="flex items-center">
                    {file.status === 'completed' && (
                      <CheckCircle className="text-green-600 mr-2 h-4 w-4" />
                    )}
                    {file.status === 'failed' && (
                      <AlertCircle className="text-red-600 mr-2 h-4 w-4" />
                    )}
                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadedFiles.length > 0 && uploadedFiles.some(f => f.status === 'completed') && (
            <Button
              variant="secondary"
              className="w-full bg-accent hover:bg-accent/90 text-white"
              disabled
            >
              <Settings className="mr-2 h-4 w-4" />
              Resumes Processed Successfully
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
