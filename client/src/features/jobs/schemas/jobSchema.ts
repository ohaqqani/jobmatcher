import { z } from "zod";

export const jobDescriptionSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  description: z.string().min(10, "Job description must be at least 10 characters"),
});

export type JobDescriptionForm = z.infer<typeof jobDescriptionSchema>;
