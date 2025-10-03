import AdmZip from "adm-zip";
import mammoth from "mammoth";
import pdf from "pdf-parse";
import { openai } from "./lib/openai";
import { cleanHTMLContent, normalizeText } from "./lib/textProcessing";

/**
 * Extract text from PDF or DOC/DOCX files
 */
export async function extractTextFromFile(buffer: Buffer, mimetype: string): Promise<string> {
  let text = "";

  try {
    if (mimetype === "application/pdf") {
      try {
        // Add more robust PDF parsing with available options
        const data = await pdf(buffer, {
          max: 0, // No page limit
        });
        text = data.text || "";

        // If pdf-parse fails, try alternative approach
        if (!text || text.trim().length === 0) {
          console.log("Primary PDF parsing yielded no text, attempting alternative extraction...");
          // Try with page limit
          const fallbackData = await pdf(buffer, {
            max: 50, // Limit to first 50 pages to avoid memory issues
          });
          text = fallbackData.text || "";
        }
      } catch (pdfError) {
        console.error("PDF parsing error details:", {
          error: pdfError instanceof Error ? pdfError.message : "Unknown PDF error",
          bufferSize: buffer.length,
          isValidBuffer: Buffer.isBuffer(buffer),
        });

        // Try one more time with minimal options
        try {
          console.log("Attempting fallback PDF parsing with minimal options...");
          const minimalData = await pdf(buffer, { max: 1 }); // Try just first page
          text = minimalData.text || "";
          if (text.trim()) {
            console.log("Fallback PDF parsing succeeded with first page only");
          }
        } catch (fallbackError) {
          console.error("All PDF parsing attempts failed:", fallbackError);
          throw new Error(
            `PDF file appears to be corrupted, password-protected, or contains only images. Original error: ${pdfError instanceof Error ? pdfError.message : "Invalid PDF format"}`
          );
        }
      }
    } else if (
      mimetype === "application/msword" ||
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || "";

        // Check for extraction warnings
        if (result.messages && result.messages.length > 0) {
          console.log(
            "Document extraction warnings:",
            result.messages.map((m) => m.message)
          );
        }
      } catch (docError) {
        console.error("Document parsing error:", docError);
        throw new Error(
          `Failed to parse document: ${docError instanceof Error ? docError.message : "Invalid document format"}`
        );
      }
    } else {
      throw new Error(`Unsupported file type: ${mimetype}`);
    }

    // Clean and normalize the text
    if (text) {
      text = normalizeText(text);
    }

    // More lenient text validation
    if (!text || text.length < 10) {
      throw new Error(
        "Extracted text is too short or empty - file may be corrupted, password-protected, or contain only images/scanned content"
      );
    }

    console.log(`Successfully extracted ${text.length} characters of text`);
    return text;
  } catch (error) {
    console.error("Text extraction failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      mimetype,
      bufferSize: buffer.length,
    });
    throw error; // Re-throw to be handled by calling function
  }
}

/**
 * Extract candidate information from resume text using AI
 */
export async function extractCandidateInfo(resumeText: string): Promise<{
  firstName: string;
  lastName: string;
  lastInitial: string;
  email: string;
  phone?: string;
  skills: string[];
  skills_comma_separated: string;
  experience?: string;
}> {
  try {
    const inputPrompt = `You are an expert resume parser and skills analyst. Extract comprehensive candidate information optimized for job matching.

CANDIDATE INFO EXTRACTION GUIDELINES:
- Extract the candidate's first name, last name, last initial, email address, and phone number

SKILLS EXTRACTION GUIDELINES:
- Extract technical skills, programming languages, frameworks, and tools
- Include soft skills and leadership competencies when clearly demonstrated
- Identify domain expertise and industry knowledge
- Capture certifications, educational background, and specializations
- Include related technologies and methodologies mentioned
- Normalize skill names (e.g., "JS" → "JavaScript", "React.js" → "React")
- Include experience levels when mentioned (e.g., "Senior Python Developer" → add both "Python" and "Senior Development")

EXPERIENCE SUMMARY:
- Provide a concise text string (not an object) summarizing key achievements, years of experience, and areas of expertise
- Focus on career progression and impact rather than just job titles
- Return experience as a simple string, not as structured data

Return comprehensive data to enable effective fuzzy matching.

REQUIRED JSON FORMAT:
{
  "firstName": "candidate first name",
  "lastName": "candidate last name",
  "lastInitial": "candidate last initial",
  "email": "email address",
  "phone": "phone number",
  "skills": ["skill1", "skill2", "skill3"],
  "skills_comma_separated": "skill1, skill2, skill3",
  "experience": "text summary of experience"
}

Ensure all fields use these exact field names and data types.

---

Parse this resume and extract comprehensive candidate information. Return the data in JSON format:

${resumeText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [{ role: "user", content: inputPrompt }],
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    // Log the parsed result for debugging
    console.log("Parsed candidate data:", JSON.stringify(result, null, 2));

    // Handle nested candidate object if present
    const candidateData = result.candidate || result;

    return {
      firstName:
        candidateData.firstName ||
        candidateData.first_name ||
        result.firstName ||
        result.first_name ||
        "Unknown",
      lastName:
        candidateData.lastName ||
        candidateData.last_name ||
        result.lastName ||
        result.last_name ||
        "Unknown",
      lastInitial:
        candidateData.lastInitial ||
        candidateData.last_initial ||
        result.lastInitial ||
        result.last_initial ||
        "Unknown",
      email:
        candidateData.email ||
        candidateData.emailAddress ||
        result.email ||
        result.emailAddress ||
        "",
      phone:
        candidateData.phone ||
        candidateData.phoneNumber ||
        candidateData.phone_number ||
        result.phone ||
        result.phoneNumber ||
        result.phone_number,
      skills: Array.isArray(result.skills) ? result.skills : [],
      skills_comma_separated: result.skills_comma_separated || "Unknown",
      experience:
        result.experience_summary ||
        result.experience ||
        candidateData.experience_summary ||
        candidateData.experience ||
        "Experience details not available",
    };
  } catch (error) {
    console.error("Failed to extract candidate info:", error);
    return {
      firstName: "Unknown",
      lastName: "Unknown",
      lastInitial: "Unknown",
      email: "",
      skills: [],
      skills_comma_separated: "",
      experience: "Failed to extract experience information",
    };
  }
}

/**
 * Anonymize resume and format as HTML using LLM
 */
export async function anonymizeResumeAsHTML(resumePlainText: string): Promise<string> {
  // Input validation
  if (!resumePlainText || resumePlainText.trim().length === 0) {
    return "<div><p>No resume content provided</p></div>";
  }

  // Prevent processing extremely large texts (> 50kb)
  if (resumePlainText.length > 50000) {
    console.warn("Resume text is very large, truncating for processing");
    resumePlainText = resumePlainText.substring(0, 50000);
  }

  try {
    const inputPrompt = `You are an expert resume anonymization and HTML formatting specialist. Your task is to anonymize personally identifiable information from resumes and format them as clean, professional HTML.

ANONYMIZATION REQUIREMENTS:
- Remove ALL email addresses completely
- Remove ALL phone numbers (any format, including international)
- Remove ALL physical addresses (street addresses, cities, states, zip codes)
- Remove ALL external links (URLs, website links, social media links, portfolio links)
- Remove the candidate's name completely from the entire document
- Preserve all professional experience, skills, education, and career achievements
- Keep all dates, company names, job titles, and professional accomplishments

HTML FORMATTING REQUIREMENTS:
- Use semantic HTML structure with proper headings and content organization
- Format resume sections (Experience, Education, Skills, Summary, etc.) with <h2> headings
- Use <p> tags for paragraph content
- Use <ul> and <li> tags for lists and bullet points
- Use <h3> tags for job titles or subsection headings within main sections
- DO NOT include any CSS classes, styles, or styling
- Output clean, semantic HTML without any CSS or style attributes
- Ensure proper HTML structure with opening and closing tags
- Output ONLY the HTML content that goes inside a div - no DOCTYPE, html, head, body, or title tags
- Return content that can be directly inserted into an existing HTML page
- Do not escape characters or include literal \\n sequences
- DO NOT include any \\n characters anywhere in your response
- Write HTML tags continuously without line breaks or newline characters
- Start directly with content elements like headings and paragraphs

Return only clean HTML content as a single continuous string without any \\n characters, additional text, explanations, or document wrapper tags.

---

Please anonymize this resume and format it as clean HTML. Remove the candidate's name completely from the document.

Resume content:
${resumePlainText}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      messages: [{ role: "user", content: inputPrompt }],
      temperature: 0.3,
      max_tokens: 5000,
    });

    const rawContent = response.choices[0].message.content;
    if (!rawContent) {
      throw new Error("No content returned from OpenAI API");
    }

    // Clean up the HTML content to ensure it's embeddable
    const htmlContent = cleanHTMLContent(rawContent);

    // Basic validation - ensure we have some HTML content
    if (htmlContent.length < 10 || !htmlContent.includes("<")) {
      throw new Error("Generated content does not appear to be valid HTML");
    }

    return htmlContent;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to anonymize resume with LLM:", errorMessage);

    // Return more specific error information in development
    if (process.env.NODE_ENV === "development") {
      return `<div><p>Error processing resume content: ${errorMessage}</p></div>`;
    }

    return "<div><p>Error processing resume content</p></div>";
  }
}

/**
 * Extract files from ZIP archive
 */
export async function extractFilesFromZip(zipBuffer: Buffer): Promise<
  Array<{
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }>
> {
  const extracted: Array<{ buffer: Buffer; originalname: string; mimetype: string }> = [];

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryExt = entry.entryName.split(".").pop()?.toLowerCase();
    if (["pdf", "doc", "docx"].includes(entryExt || "")) {
      extracted.push({
        buffer: entry.getData(),
        originalname: entry.entryName,
        mimetype:
          entryExt === "pdf"
            ? "application/pdf"
            : entryExt === "doc"
              ? "application/msword"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }
  }

  return extracted;
}
