import postgres from "postgres";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = postgres(process.env.DATABASE_URL);

async function enableRLS() {
  try {
    console.log("Enabling RLS on job_descriptions table...");
    await sql`ALTER TABLE job_descriptions ENABLE ROW LEVEL SECURITY`;
    console.log("✓ RLS enabled on job_descriptions");

    console.log("Enabling RLS on resumes table...");
    await sql`ALTER TABLE resumes ENABLE ROW LEVEL SECURITY`;
    console.log("✓ RLS enabled on resumes");

    console.log("Enabling RLS on match_results table...");
    await sql`ALTER TABLE match_results ENABLE ROW LEVEL SECURITY`;
    console.log("✓ RLS enabled on match_results");

    console.log("\nRLS successfully enabled on all tables!");
  } catch (error) {
    console.error("Error enabling RLS:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

enableRLS();
