import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { uploadResumes, type UploadResponse } from "../api/candidatesApi";

interface UseUploadResumesOptions {
  onSuccess?: (data: UploadResponse) => void;
  onError?: (error: Error) => void;
}

export function useUploadResumes(options?: UseUploadResumesOptions) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: (formData: FormData) => uploadResumes(formData),
    onSuccess: (data) => {
      const successCount = data.summary.successfulUploads;
      const failureCount = data.summary.failedUploads;

      toast({
        title: "Upload complete",
        description: `${successCount} resumes processed successfully${failureCount > 0 ? `, ${failureCount} failed` : ""}`,
        variant: failureCount > 0 ? "destructive" : "default",
      });

      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload resumes",
        variant: "destructive",
      });

      options?.onError?.(error);
    },
  });
}
