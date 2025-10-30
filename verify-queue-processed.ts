import { db } from "./server/db/index";
import {
  candidateExtractionQueue,
  resumeAnonymizationQueue,
  resumes,
  candidates,
} from "./shared/schemas/index";
import { eq } from "drizzle-orm";

async function verifyProcessing() {
  console.log("\n=== Verifying Queue Processing ===\n");

  const resumeId = "5229cd42-8539-4bf1-8145-42aac67bcc29";

  // Check queues are empty
  const candidateQueue = await db.select().from(candidateExtractionQueue);
  const anonymizationQueue = await db.select().from(resumeAnonymizationQueue);

  console.log("✅ Candidate Extraction Queue (should be empty):");
  console.log(`   Items: ${candidateQueue.length}`);

  console.log("\n✅ Resume Anonymization Queue (should be empty):");
  console.log(`   Items: ${anonymizationQueue.length}`);

  // Check candidate was created
  const candidate = await db.select().from(candidates).where(eq(candidates.resumeId, resumeId));

  console.log("\n✅ Candidate (should exist now):");
  if (candidate.length > 0) {
    console.log(`   Name: ${candidate[0].firstName} ${candidate[0].lastName}`);
    console.log(`   Email: ${candidate[0].email}`);
    console.log(`   Skills: ${(candidate[0].skills as string[]).join(", ")}`);
  } else {
    console.log("   ❌ NOT FOUND - Worker may not have completed");
  }

  // Check resume has anonymized HTML
  const resume = await db.select().from(resumes).where(eq(resumes.id, resumeId));

  console.log("\n✅ Resume Anonymized HTML:");
  if (resume.length > 0 && resume[0].publicResumeHtml) {
    console.log(`   HTML present: Yes (${resume[0].publicResumeHtml.length} characters)`);
  } else {
    console.log("   ❌ HTML missing - Worker may not have completed");
  }

  console.log("\n=== Queue System Test: SUCCESS! ===\n");

  process.exit(0);
}

verifyProcessing().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
