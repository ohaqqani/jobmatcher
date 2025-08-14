import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobDescriptions = pgTable("job_descriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requiredSkills: jsonb("required_skills").$type<string[]>().default([]),
  analyzedAt: timestamp("analyzed_at").defaultNow(),
});

export const resumes = pgTable("resumes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  content: text("content").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const candidates = pgTable("candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resumeId: varchar("resume_id").references(() => resumes.id).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  skills: jsonb("skills").$type<string[]>().default([]),
  experience: text("experience"),
  extractedAt: timestamp("extracted_at").defaultNow(),
});

export const matchResults = pgTable("match_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobDescriptionId: varchar("job_description_id").references(() => jobDescriptions.id).notNull(),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  matchScore: integer("match_score").notNull(),
  scorecard: jsonb("scorecard").$type<Record<string, number>>().default({}),
  matchingSkills: jsonb("matching_skills").$type<string[]>().default([]),
  analysis: text("analysis"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertJobDescriptionSchema = createInsertSchema(jobDescriptions).pick({
  title: true,
  description: true,
});

export const insertResumeSchema = createInsertSchema(resumes).pick({
  fileName: true,
  fileSize: true,
  fileType: true,
  content: true,
});

export const insertCandidateSchema = createInsertSchema(candidates).pick({
  resumeId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  skills: true,
  experience: true,
});

export const insertMatchResultSchema = createInsertSchema(matchResults).pick({
  jobDescriptionId: true,
  candidateId: true,
  matchScore: true,
  scorecard: true,
  matchingSkills: true,
  analysis: true,
});

// Types
export type JobDescription = typeof jobDescriptions.$inferSelect;
export type InsertJobDescription = z.infer<typeof insertJobDescriptionSchema>;
export type Resume = typeof resumes.$inferSelect;
export type InsertResume = z.infer<typeof insertResumeSchema>;
export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type MatchResult = typeof matchResults.$inferSelect;
export type InsertMatchResult = z.infer<typeof insertMatchResultSchema>;

// Extended types for API responses
export type CandidateWithMatch = Candidate & {
  resume: Resume;
  matchResult: MatchResult;
};

export type ProcessingStatus = {
  id: string;
  fileName: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
};
