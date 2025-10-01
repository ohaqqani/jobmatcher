import { openai } from "./lib/openai";

/**
 * Analyze job description with AI to extract required skills
 */
export async function analyzeJobDescriptionWithAI(
  title: string,
  description: string
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an expert job analysis specialist. Extract comprehensive skill requirements from job descriptions, considering both explicit and implicit needs.

EXTRACTION GUIDELINES:
- Include technical skills, programming languages, frameworks, and tools
- Capture soft skills and behavioral competencies when mentioned
- Identify domain knowledge and industry experience requirements
- Consider related/similar skills that would be valuable (e.g., if React is mentioned, also consider JavaScript, Frontend Development)
- Include certifications, educational requirements if specified
- Extract experience levels and seniority indicators

Return a comprehensive but focused list of skills that candidates should have or could reasonably develop for success in this role.`,
        },
        {
          role: "user",
          content: `Job Title: ${title}\n\nJob Description: ${description}\n\nExtract all relevant skills and requirements for this position. Focus on skills that predict job performance success. Return as JSON format with a "skills" array.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return Array.isArray(result.skills) ? result.skills : [];
  } catch (error) {
    console.error("Failed to analyze job description:", error);
    return [];
  }
}
