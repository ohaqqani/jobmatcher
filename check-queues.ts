import { db } from "./server/db/index";
import {
  candidateExtractionQueue,
  resumeAnonymizationQueue,
  resumes,
  candidates,
} from "./shared/schemas/index";
import { eq } from "drizzle-orm";

async function checkQueues() {
  console.log("\n=== Checking Queue Tables ===\n");

  // Check candidate extraction queue
  const candidateQueue = await db.select().from(candidateExtractionQueue);
  console.log("Candidate Extraction Queue:");
  console.log(JSON.stringify(candidateQueue, null, 2));

  // Check resume anonymization queue
  const anonymizationQueue = await db.select().from(resumeAnonymizationQueue);
  console.log("\nResume Anonymization Queue:");
  console.log(JSON.stringify(anonymizationQueue, null, 2));

  // Check if resume exists
  const resumeId = "5229cd42-8539-4bf1-8145-42aac67bcc29";
  const resume = await db.select().from(resumes).where(eq(resumes.id, resumeId));
  console.log("\nResume:");
  console.log(
    JSON.stringify(
      resume.map((r) => ({ id: r.id, fileName: r.fileName, contentHash: r.contentHash })),
      null,
      2
    )
  );

  // Check if candidate exists
  const candidate = await db.select().from(candidates).where(eq(candidates.resumeId, resumeId));
  console.log("\nCandidate (should be empty):");
  console.log(JSON.stringify(candidate, null, 2));

  process.exit(0);
}

checkQueues().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
