import {
  pgTable,
  foreignKey,
  varchar,
  text,
  timestamp,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { resumes, jobDescriptions, candidates } from "./index";

// Queue tables for retry logic on rate limit errors

export const candidateExtractionQueue = pgTable(
  "candidate_extraction_queue",
  {
    id: varchar()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    resumeId: varchar("resume_id").notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { mode: "string" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.resumeId],
      foreignColumns: [resumes.id],
      name: "candidate_extraction_queue_resume_fk",
    }),
    unique("candidate_extraction_resume_unique").on(table.resumeId),
  ]
);

export const resumeAnonymizationQueue = pgTable(
  "resume_anonymization_queue",
  {
    id: varchar()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    resumeId: varchar("resume_id").notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { mode: "string" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.resumeId],
      foreignColumns: [resumes.id],
      name: "resume_anonymization_queue_resume_fk",
    }),
    unique("resume_anonymization_resume_unique").on(table.resumeId),
  ]
);

export const jobAnalysisQueue = pgTable(
  "job_analysis_queue",
  {
    id: varchar()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    jobDescriptionId: varchar("job_description_id").notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { mode: "string" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.jobDescriptionId],
      foreignColumns: [jobDescriptions.id],
      name: "job_analysis_queue_job_fk",
    }),
    unique("job_analysis_job_unique").on(table.jobDescriptionId),
  ]
);

export const matchProcessingQueue = pgTable(
  "match_processing_queue",
  {
    id: varchar()
      .default(sql`gen_random_uuid()`)
      .primaryKey()
      .notNull(),
    candidateId: varchar("candidate_id").notNull(),
    jobDescriptionId: varchar("job_description_id").notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { mode: "string" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.candidateId],
      foreignColumns: [candidates.id],
      name: "match_queue_candidate_fk",
    }),
    foreignKey({
      columns: [table.jobDescriptionId],
      foreignColumns: [jobDescriptions.id],
      name: "match_queue_job_fk",
    }),
    unique("match_queue_unique_pair").on(table.candidateId, table.jobDescriptionId),
  ]
);
