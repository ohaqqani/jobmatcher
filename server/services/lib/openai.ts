import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

// Validate required environment variables
if (!process.env.OPENAI_API_KEY && process.env.NODE_ENV === "production") {
  console.error("ERROR: OPENAI_API_KEY is required in production");
  process.exit(1);
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-dev",
});
