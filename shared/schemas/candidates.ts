import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const resumes = pgTable("resumes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type").notNull(),
  content: text("content").notNull(),
  public_resume_html: text("public_resume_html"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const candidates = pgTable("candidates", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  resumeId: varchar("resume_id")
    .references(() => resumes.id)
    .notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  lastInitial: text("last_initial").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  skills: jsonb("skills").$type<string[]>().default([]),
  experience: text("experience"),
  extractedAt: timestamp("extracted_at").defaultNow(),
});

export const insertResumeSchema = createInsertSchema(resumes).pick({
  fileName: true,
  fileSize: true,
  fileType: true,
  content: true,
  public_resume_html: true,
});

export const insertCandidateSchema = createInsertSchema(candidates).pick({
  resumeId: true,
  firstName: true,
  lastName: true,
  lastInitial: true,
  email: true,
  phone: true,
  skills: true,
  experience: true,
});

export type Resume = typeof resumes.$inferSelect;
export type InsertResume = z.infer<typeof insertResumeSchema>;
export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
