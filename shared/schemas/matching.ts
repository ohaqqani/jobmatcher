import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { jobDescriptions } from "./jobs";
import { candidates } from "./candidates";

export const matchResults = pgTable(
  "match_results",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    resumeContentHash: varchar("resume_content_hash", { length: 64 }).notNull(),
    jobContentHash: varchar("job_content_hash", { length: 64 }).notNull(),
    jobDescriptionId: varchar("job_description_id")
      .references(() => jobDescriptions.id)
      .notNull(),
    candidateId: varchar("candidate_id")
      .references(() => candidates.id)
      .notNull(),
    matchScore: integer("match_score").notNull(),
    scorecard: jsonb("scorecard")
      .$type<Record<string, { weight: number; score: number; comments: string }>>()
      .default({}),
    matchingSkills: jsonb("matching_skills").$type<string[]>().default([]),
    analysis: text("analysis"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // Composite unique constraint to prevent duplicate matches
    uniqueMatch: sql`UNIQUE (${table.resumeContentHash}, ${table.jobContentHash})`,
  })
);

export const insertMatchResultSchema = createInsertSchema(matchResults).pick({
  resumeContentHash: true,
  jobContentHash: true,
  jobDescriptionId: true,
  candidateId: true,
  matchScore: true,
  scorecard: true,
  matchingSkills: true,
  analysis: true,
});

export type MatchResult = typeof matchResults.$inferSelect;
export type InsertMatchResult = z.infer<typeof insertMatchResultSchema>;
