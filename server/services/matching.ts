import { openai } from "./lib/openai";

/**
 * Calculate match score between candidate and job using AI
 */
export async function calculateMatchScore(
  candidateSkills: string[],
  jobRequiredSkills: string[],
  candidateExperience?: string,
  resumeContent?: string
): Promise<{
  score: number;
  scorecard: { [key: string]: any };
  matchingSkills: string[];
  analysis: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an expert talent assessment specialist whose job is to predict how well a candidate will perform in a specific target role based on their experience, skills, and competencies.

## ROLE MATCHING CRITERIA
(Tailor the specifics below to the role in question)

- Core Functional Experience: Relevant work history, hands-on skills, and exposure to responsibilities critical for the role.
- Domain Knowledge: Understanding of the industry, key processes, regulations, and best practices.
- Technical/Tool Proficiency: Mastery of the primary tools, platforms, and technologies required for the job.
- Soft Skills & Interpersonal Strengths: Communication, collaboration, leadership, adaptability, and problem-solving abilities.
- Operational & Organizational Abilities: Time management, prioritization, attention to detail, and process optimization.
- Role-Specific Professionalism: Ethical conduct, confidentiality, customer/client orientation, and decision-making judgment.

## FUZZY MATCHING GUIDELINES
(Use to identify transferable skills and indirect experience)

- Tool/Platform Substitutions: Skills in comparable tools indicate ability to learn required tools quickly (e.g., "Excel" → "Spreadsheets", "CRM" → "Customer Database").
- Cross-Functional Experience: Roles with overlapping functions can map to each other (e.g., "Customer Service" → "Client Relations" → "Account Management").
- Adjacent Role Experience: Related job titles often imply transferable responsibilities (e.g., "Office Manager" → "Operations Coordinator" → "Executive Assistant").
- Skill Clusters: Group related skills together when evaluating fit (e.g., "Project Coordination", "Scheduling", "Logistics Planning").
- Adaptability Indicators: Evidence of quickly learning new tools, workflows, or industries signals capacity to adapt to this role.

## SCORING CRITERIA FOR ROLE FIT
- 90-100: Exceptional - Extensive relevant experience, advanced technical/soft skills, proven track record in comparable roles.
- 80-89: Very Strong - Solid background in key functions, strong technical and interpersonal skills, role-aligned achievements.
- 70-79: Good Fit - Core competencies present, moderate relevant experience, can perform effectively with minimal ramp-up.
- 60-69: Moderate Fit - Limited direct experience but strong transferable skills and high learning potential.
- 50-59: Entry Level - Basic skills and limited exposure to role responsibilities, will require significant training.
- 0-49: Poor Fit - Lacks fundamental skills, competencies, or experience for the role.

Return JSON with:
- score: 0-100 based on role performance prediction
- scorecard: detailed breakdown of candidate's fit across the following key criteria:
  - Relevant Experience: [weight (40%), score, comments]
  - Relevant Skills: [weight (40%), score, comments]
  - Domain Knowledge: [weight (20%), score, comments]
- matchingSkills: array of matched/related skills found
- analysis: comprehensive assessment of candidate's role fit formatted as clean HTML with proper structure:
            Use H1 tags for each main section:
            - "Summary of Match" (categorize as Strong / Moderate / Weak)
            - "Key Matching Points" (highlight candidate strengths and relevant experience)
            - "Gaps & Risks" (identify areas of concern or missing qualifications)
            - "Recommendation" (provide clear guidance: Proceed / Conditional Proceed / Pass)

## SAMPLE OUTPUT

{
  "score": 85,
  "scorecard": {
    "Relevant Experience": {
      "weight": 40,
      "score": 90,
      "comments": "5 years in similar roles, strong project management background"
    },
    "Relevant Skills": {
      "weight": 40,
      "score": 80,
      "comments": "Proficient in required tools, strong communication skills"
    },
    "Domain Knowledge": {
      "weight": 20,
      "score": 70,
      "comments": "Good understanding of industry standards, some gaps in specific regulations"
    }
  },
  "matchingSkills": ["Project Management", "Communication", "CRM Systems"],
  "analysis": "<h1>Summary of Match</h1><p><strong>Moderate Fit</strong>: The candidate possesses a robust background in executive support and office management but lacks specific experience in the hospitality or retail industries and explicit bookkeeping experience.</p><h1>Key Matching Points</h1><ul><li><strong>Administrative Support</strong>: Extensive experience supporting executive operations, managing calendars, and scheduling, which aligns well with the core administrative requirements of the role.</li><li><strong>Time and Task Management</strong>: Demonstrated ability in managing fast-paced environments with attention to detail and proactive communication skills.</li><li><strong>Problem-solving and Coordination</strong>: Expertise in cross-functional coordination and problem-solving, vital for overseeing office operations.</li></ul><h1>Gaps &amp; Risks</h1><ul><li><strong>Bookkeeping and Financial Knowledge</strong>: Limited direct experience with bookkeeping, accounts reconciliation, and use of specific accounting tools like QuickBooks or Xero.</li><li><strong>Industry Experience</strong>: Lack of specific experience in the hospitality or retail industry could be a challenge, particularly in understanding franchise operations.</li></ul><h1>Recommendation</h1><p><strong>Conditional Proceed</strong>: While the candidate shows strong potential in handling core functions, they would benefit significantly from training in bookkeeping and gaining awareness of the specific industry context. Consideration should be given if supplementary training can be provided in accounting and industry-specific operations.</p>"
  `,
        },
        {
          role: "user",
          content: `CANDIDATE PROFILE:
Skills: ${JSON.stringify(candidateSkills)}
Experience Summary: ${candidateExperience || "Not provided"}

JOB REQUIREMENTS:
Required Skills: ${JSON.stringify(jobRequiredSkills)}

${resumeContent ? `ADDITIONAL CONTEXT FROM RESUME:\n${resumeContent.substring(0, 1000)}...` : ""}

Please assess this candidate's potential for success in this role using fuzzy matching and predictive analysis. Return your assessment in JSON format.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    console.log("Raw AI response result:", JSON.stringify(result, null, 2));
    console.log("Extracted scorecard:", JSON.stringify(result.scorecard, null, 2));

    return {
      score: Math.min(100, Math.max(0, result.score || 0)),
      scorecard: result.scorecard || {},
      matchingSkills: Array.isArray(result.matchingSkills) ? result.matchingSkills : [],
      analysis: result.analysis || "No analysis available",
    };
  } catch (error) {
    console.error("Failed to calculate match score:", error);
    return {
      score: 0,
      scorecard: {},
      matchingSkills: [],
      analysis: "Failed to calculate match score due to AI service error",
    };
  }
}
