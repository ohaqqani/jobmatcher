import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const jobDescriptions = pgTable("job_descriptions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requiredSkills: jsonb("required_skills").$type<string[]>().default([]),
  analyzedAt: timestamp("analyzed_at").defaultNow(),
});

export const insertJobDescriptionSchema = createInsertSchema(jobDescriptions).pick({
  title: true,
  description: true,
});

export type JobDescription = typeof jobDescriptions.$inferSelect;
export type InsertJobDescription = z.infer<typeof insertJobDescriptionSchema>;
