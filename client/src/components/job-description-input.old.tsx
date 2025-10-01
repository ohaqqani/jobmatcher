import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Briefcase, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const jobDescriptionSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  description: z.string().min(10, "Job description must be at least 10 characters"),
});

type JobDescriptionForm = z.infer<typeof jobDescriptionSchema>;

interface JobDescriptionInputProps {
  onJobCreated: (jobId: string) => void;
  currentJobId: string | null;
  setIsAnalyzingComplete: (isComplete: boolean) => void;
}

export default function JobDescriptionInput({ onJobCreated, currentJobId, setIsAnalyzingComplete }: JobDescriptionInputProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const form = useForm<JobDescriptionForm>({
    resolver: zodResolver(jobDescriptionSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  const createJobMutation = useMutation({
    mutationFn: async (data: JobDescriptionForm) => {
      const response = await apiRequest("POST", "/api/job-descriptions", data);
      return response.json();
    },
    onSuccess: (jobDesc) => {
      onJobCreated(jobDesc.id);
      toast({
        title: "Job description created",
        description: "Your job description has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create job description",
        variant: "destructive",
      });
    },
  });

  const analyzeJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await apiRequest("POST", `/api/job-descriptions/${jobId}/analyze`);
      return response.json();
    },
    onSuccess: () => {
      setIsAnalyzing(false);
      setIsAnalyzingComplete(true);
      toast({
        title: "Analysis complete",
        description: "Job requirements have been analyzed successfully.",
      });
    },
    onError: (error: any) => {
      setIsAnalyzing(false);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze job requirements",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: JobDescriptionForm) => {
    createJobMutation.mutate(data);
  };

  const handleAnalyze = async () => {
    if (!currentJobId) return;
    setIsAnalyzing(true);
    analyzeJobMutation.mutate(currentJobId);
  };

  return (
    <Card className="border border-slate-200 shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardContent className="p-6">
        <div className="flex items-center mb-6">
          <Briefcase className="text-blue-600 mr-3 h-6 w-6" />
          <h2 className="text-xl font-bold text-slate-900">Job Description</h2>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">Job Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Executive Assistant, Office Administrator, Virtual Assistant"
                      {...field}
                      disabled={createJobMutation.isPending}
                      className="border-slate-300 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold text-slate-700">
                    Description & Requirements
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter job description and requirements here..."
                      rows={8}
                      className="resize-none border-slate-300 focus:border-blue-500 focus:ring-blue-500/20 transition-all duration-200"
                      {...field}
                      disabled={createJobMutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {!currentJobId ? (
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                disabled={createJobMutation.isPending}
              >
                {createJobMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Briefcase className="mr-2 h-4 w-4" />
                    Save Job Description
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleAnalyze}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200"
                disabled={isAnalyzing || analyzeJobMutation.isPending}
              >
                {isAnalyzing || analyzeJobMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze Job Requirements
                  </>
                )}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
