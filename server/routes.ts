import { insertJobDescriptionSchema } from "@shared/schema";
import dotenv from 'dotenv';
import type { Express } from "express";
import { createServer, type Server } from "http";
import mammoth from "mammoth";
import multer from "multer";
import OpenAI from "openai";
import pdf from "pdf-parse";
import { storage } from "./storage";

dotenv.config();

// Validate required environment variables
if (!process.env.OPENAI_API_KEY && process.env.NODE_ENV === 'production') {
  console.error('ERROR: OPENAI_API_KEY is required in production');
  process.exit(1);
}

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-dev'
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
    }
  }
});

// Helper function to extract text from different file types
async function extractTextFromFile(buffer: Buffer, mimetype: string): Promise<string> {
  let text = '';
  
  try {
    if (mimetype === 'application/pdf') {
      try {
        // Add more robust PDF parsing with available options
        const data = await pdf(buffer, {
          max: 0 // No page limit
        });
        text = data.text || '';
        
        // If pdf-parse fails, try alternative approach
        if (!text || text.trim().length === 0) {
          console.log('Primary PDF parsing yielded no text, attempting alternative extraction...');
          // Try with page limit
          const fallbackData = await pdf(buffer, {
            max: 50 // Limit to first 50 pages to avoid memory issues
          });
          text = fallbackData.text || '';
        }
        
      } catch (pdfError) {
        console.error('PDF parsing error details:', {
          error: pdfError instanceof Error ? pdfError.message : 'Unknown PDF error',
          bufferSize: buffer.length,
          isValidBuffer: Buffer.isBuffer(buffer)
        });
        
        // Try one more time with minimal options
        try {
          console.log('Attempting fallback PDF parsing with minimal options...');
          const minimalData = await pdf(buffer, { max: 1 }); // Try just first page
          text = minimalData.text || '';
          if (text.trim()) {
            console.log('Fallback PDF parsing succeeded with first page only');
          }
        } catch (fallbackError) {
          console.error('All PDF parsing attempts failed:', fallbackError);
          throw new Error(`PDF file appears to be corrupted, password-protected, or contains only images. Original error: ${pdfError instanceof Error ? pdfError.message : 'Invalid PDF format'}`);
        }
      }
    } else if (mimetype === 'application/msword' || 
               mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || '';
        
        // Check for extraction warnings
        if (result.messages && result.messages.length > 0) {
          console.log('Document extraction warnings:', result.messages.map(m => m.message));
        }
      } catch (docError) {
        console.error('Document parsing error:', docError);
        throw new Error(`Failed to parse document: ${docError instanceof Error ? docError.message : 'Invalid document format'}`);
      }
    } else {
      throw new Error(`Unsupported file type: ${mimetype}`);
    }

    // Clean and normalize the text
    if (text) {
      text = text
        .replace(/\r\n/g, '\n') // normalize line endings
        .replace(/\r/g, '\n')   // handle remaining carriage returns
        .replace(/\t/g, ' ')    // replace tabs with spaces
        .replace(/\s+/g, ' ')   // collapse multiple spaces
        .trim();                // remove leading/trailing whitespace
    }

    // More lenient text validation
    if (!text || text.length < 10) {
      throw new Error('Extracted text is too short or empty - file may be corrupted, password-protected, or contain only images/scanned content');
    }

    console.log(`Successfully extracted ${text.length} characters of text`);
    return text;
    
  } catch (error) {
    console.error('Text extraction failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      mimetype,
      bufferSize: buffer.length
    });
    throw error; // Re-throw to be handled by calling function
  }
}

// Helper function to analyze job description with AI
async function analyzeJobDescriptionWithAI(title: string, description: string): Promise<string[]> {
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

Return a comprehensive but focused list of skills that candidates should have or could reasonably develop for success in this role.`
        },
        {
          role: "user",
          content: `Job Title: ${title}\n\nJob Description: ${description}\n\nExtract all relevant skills and requirements for this position. Focus on skills that predict job performance success. Return as JSON format with a "skills" array.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return Array.isArray(result.skills) ? result.skills : [];
  } catch (error) {
    console.error("Failed to analyze job description:", error);
    return [];
  }
}

// Helper function to extract candidate info from resume
async function extractCandidateInfo(resumeText: string): Promise<{
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skills: string[];
  experience?: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an expert resume parser and skills analyst. Extract comprehensive candidate information optimized for job matching.

CANDIDATE INFO EXTRACTION GUIDELINES:
- Extract the candidate's first name, last name, email address, and phone number

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
  "email": "email address",
  "phone": "phone number",
  "skills": ["skill1", "skill2", "skill3"],
  "experience": "text summary of experience"
}

Ensure all fields use these exact field names and data types.`
        },
        {
          role: "user", 
          content: `Parse this resume and extract comprehensive candidate information. Return the data in JSON format:\n\n${resumeText}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Log the parsed result for debugging
    console.log("Parsed candidate data:", JSON.stringify(result, null, 2));
    
    // Handle nested candidate object if present
    const candidateData = result.candidate || result;
    
    return {
      firstName: candidateData.firstName || candidateData.first_name || result.firstName || result.first_name || "Unknown",
      lastName: candidateData.lastName || candidateData.last_name || result.lastName || result.last_name || "Unknown", 
      email: candidateData.email || candidateData.emailAddress || result.email || result.emailAddress || "",
      phone: candidateData.phone || candidateData.phoneNumber || candidateData.phone_number || result.phone || result.phoneNumber || result.phone_number,
      skills: Array.isArray(result.skills) ? result.skills : [],
      experience: result.experience_summary || result.experience || candidateData.experience_summary || candidateData.experience || "Experience details not available"
    };
  } catch (error) {
    console.error("Failed to extract candidate info:", error);
    return {
      firstName: "Unknown",
      lastName: "Unknown",
      email: "",
      skills: [],
      experience: "Failed to extract experience information"
    };
  }
}

// Helper function to calculate match score with fuzzy matching
async function calculateMatchScore(
  candidateSkills: string[],
  jobRequiredSkills: string[],
  candidateExperience?: string,
  resumeContent?: string
): Promise<{ score: number; scorecard: { [key: string]: any }; matchingSkills: string[]; analysis: string }> {
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
  `
        },
        {
          role: "user",
          content: `CANDIDATE PROFILE:
Skills: ${JSON.stringify(candidateSkills)}
Experience Summary: ${candidateExperience || 'Not provided'}

JOB REQUIREMENTS:
Required Skills: ${JSON.stringify(jobRequiredSkills)}

${resumeContent ? `ADDITIONAL CONTEXT FROM RESUME:\n${resumeContent.substring(0, 1000)}...` : ''}

Please assess this candidate's potential for success in this role using fuzzy matching and predictive analysis. Return your assessment in JSON format.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    console.log("Raw AI response result:", JSON.stringify(result, null, 2));
    console.log("Extracted scorecard:", JSON.stringify(result.scorecard, null, 2));

    return {
      score: Math.min(100, Math.max(0, result.score || 0)),
      scorecard: result.scorecard || {},
      matchingSkills: Array.isArray(result.matchingSkills) ? result.matchingSkills : [],
      analysis: result.analysis || "No analysis available"
    };
  } catch (error) {
    console.error("Failed to calculate match score:", error);
    return {
      score: 0,
      scorecard: {},
      matchingSkills: [],
      analysis: "Failed to calculate match score due to AI service error"
    };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create job description
  app.post("/api/job-descriptions", async (req, res) => {
    try {
      const validatedData = insertJobDescriptionSchema.parse(req.body);
      const jobDesc = await storage.createJobDescription(validatedData);
      res.json(jobDesc);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Analyze job description
  app.post("/api/job-descriptions/:id/analyze", async (req, res) => {
    try {
      const { id } = req.params;
      const jobDesc = await storage.getJobDescription(id);
      
      if (!jobDesc) {
        return res.status(404).json({ message: "Job description not found" });
      }

      const requiredSkills = await analyzeJobDescriptionWithAI(jobDesc.title, jobDesc.description);
      const updatedJobDesc = await storage.analyzeJobDescription(id, requiredSkills);
      
      res.json(updatedJobDesc);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Upload and process resumes
  app.post("/api/resumes/upload", upload.array('resumes', 100), async (req, res) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      console.log(`Processing ${req.files.length} files in parallel...`);

      // Process all files concurrently with comprehensive error handling
      const filePromises = req.files.map(async (file, index) => {
        try {
          console.log(`Processing file ${index + 1}/${req.files!.length}: ${file.originalname}, size: ${file.size}, type: ${file.mimetype}`);
          
          // Extract text from file with timeout protection
          const extractionPromise = extractTextFromFile(file.buffer, file.mimetype);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('File processing timeout after 30 seconds')), 30000);
          });
          
          let content: string;
          try {
            content = await Promise.race([extractionPromise, timeoutPromise]);
            console.log(`Extracted text length: ${content.length} characters for ${file.originalname}`);
          } catch (extractError) {
            console.error(`Failed to extract text from ${file.originalname}:`, extractError);
            throw new Error(`Text extraction failed: ${extractError instanceof Error ? extractError.message : 'Unknown extraction error'}`);
          }
          
          // Create resume record
          let resume;
          try {
            resume = await storage.createResume({
              fileName: file.originalname,
              fileSize: file.size,
              fileType: file.mimetype,
              content,
            });
          } catch (resumeError) {
            console.error(`Failed to create resume record for ${file.originalname}:`, resumeError);
            throw new Error(`Database error: ${resumeError instanceof Error ? resumeError.message : 'Failed to save resume'}`);
          }

          // Extract candidate information
          let candidateInfo;
          try {
            candidateInfo = await extractCandidateInfo(content);
            console.log(`Extracted candidate info for: ${candidateInfo.firstName} ${candidateInfo.lastName} from ${file.originalname}`);
          } catch (aiError) {
            console.error(`Failed to extract candidate info from ${file.originalname}:`, aiError);
            throw new Error(`AI processing failed: ${aiError instanceof Error ? aiError.message : 'Failed to analyze resume content'}`);
          }
          
          // Create candidate record
          let candidate;
          try {
            candidate = await storage.createCandidate({
              resumeId: resume.id,
              ...candidateInfo,
            });
          } catch (candidateError) {
            console.error(`Failed to create candidate record for ${file.originalname}:`, candidateError);
            throw new Error(`Database error: ${candidateError instanceof Error ? candidateError.message : 'Failed to save candidate'}`);
          }

          return {
            resumeId: resume.id,
            candidateId: candidate.id,
            fileName: file.originalname,
            status: 'completed',
            fileIndex: index + 1
          };

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Failed to process file ${file.originalname}:`, {
            error: errorMessage,
            fileIndex: index + 1,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype
          });
          
          return {
            fileName: file.originalname,
            status: 'failed',
            error: errorMessage,
            fileIndex: index + 1
          };
        }
      });

      // Wait for all files to be processed
      const results = await Promise.all(filePromises);
      
      // Categorize results 
      const successfulUploads = results.filter(r => r?.status === 'completed');
      const failedUploads = results.filter(r => r?.status === 'failed');
      
      console.log(`Upload batch completed: ${successfulUploads.length} successful, ${failedUploads.length} failed out of ${req.files.length} total files`);
      
      if (failedUploads.length > 0) {
        console.error('Failed files:', failedUploads.map(f => ({ fileName: f?.fileName, error: f?.error })));
      }

      console.log(`Upload processing complete. Results: ${results.length} items`);
      res.json({ 
        results,
        summary: {
          totalFiles: req.files.length,
          successfulUploads: successfulUploads.length,
          failedUploads: failedUploads.length,
          message: `Successfully processed ${successfulUploads.length} out of ${req.files.length} files`
        }
      });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Process matching for job description
  app.post("/api/job-descriptions/:jobId/match", async (req, res) => {
    try {
      const { jobId } = req.params;
      const { resumeIds } = req.body;

      if (!Array.isArray(resumeIds) || resumeIds.length === 0) {
        return res.status(400).json({ message: "No resume IDs provided" });
      }

      const jobDesc = await storage.getJobDescription(jobId);
      if (!jobDesc) {
        return res.status(404).json({ message: "Job description not found" });
      }

      const candidates = await storage.getCandidatesByResumeIds(resumeIds);
      console.log(`Found ${candidates.length} candidates for ${resumeIds.length} resume IDs`);
      
      // Check if we already have matches for this job to prevent duplicate processing
      const existingResults = await storage.getMatchResultsByJobId(jobId);
      if (existingResults.length > 0) {
        console.log(`Found ${existingResults.length} existing matches for job ${jobId}, returning existing results`);
        return res.json({ matchResults: existingResults });
      }
      
      console.log(`Processing candidate matching in parallel for ${candidates.length} candidates...`);

      // Process all candidates concurrently
      const candidatePromises = candidates.map(async (candidate) => {
        try {
          // Check if match already exists to prevent duplicates
          const existingMatch = await storage.getMatchResult(candidate.id, jobId);
          if (existingMatch) {
            console.log(`Match already exists for candidate ${candidate.firstName} ${candidate.lastName} (${candidate.id}), skipping...`);
            return existingMatch;
          }

          console.log(`Creating new match for candidate ${candidate.firstName} ${candidate.lastName} (${candidate.id})`);

          // Get resume content for enhanced analysis
          const resume = await storage.getResume(candidate.resumeId);
          
          // Calculate match score with fuzzy matching
          const matchData = await calculateMatchScore(
            candidate.skills || [],
            jobDesc.requiredSkills || [],
            candidate.experience || undefined,
            resume?.content
          );

          console.log(`Match score for ${candidate.firstName} ${candidate.lastName}: ${matchData.score}%`);
          console.log(`Scorecard for ${candidate.firstName} ${candidate.lastName}:`, JSON.stringify(matchData.scorecard, null, 2));

          // Create match result
          const matchResult = await storage.createMatchResult({
            jobDescriptionId: jobId,
            candidateId: candidate.id,
            matchScore: matchData.score,
            scorecard: matchData.scorecard,
            matchingSkills: matchData.matchingSkills,
            analysis: matchData.analysis,
          });

          console.log(`Created match result for ${candidate.firstName} ${candidate.lastName}:`, JSON.stringify(matchResult, null, 2));

          return matchResult;
        } catch (error) {
          console.error(`Failed to process match for candidate ${candidate.firstName} ${candidate.lastName}:`, error);
          // Return a failed match result instead of throwing
          return {
            jobDescriptionId: jobId,
            candidateId: candidate.id,
            matchScore: 0,
            matchingSkills: [],
            analysis: `Failed to calculate match: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error: true
          };
        }
      });

      // Wait for all candidate matching to complete
      const matchResults = await Promise.all(candidatePromises);

      console.log(`Candidate matching complete. Processed ${matchResults.length} matches`);
      res.json({ matchResults });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get matching results for a job
  app.get("/api/job-descriptions/:jobId/results", async (req, res) => {
    try {
      const { jobId } = req.params;
      const results = await storage.getMatchResultsByJobId(jobId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get job description
  app.get("/api/job-descriptions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const jobDesc = await storage.getJobDescription(id);
      
      if (!jobDesc) {
        return res.status(404).json({ message: "Job description not found" });
      }

      res.json(jobDesc);
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Clear all data for testing (development only)
  app.delete("/api/clear-data", async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: "Only available in development" });
    }
    
    try {
      // Clear all storage
      (storage as any).jobDescriptions.clear();
      (storage as any).resumes.clear(); 
      (storage as any).candidates.clear();
      (storage as any).matchResults.clear();
      
      console.log("All data cleared for testing");
      res.json({ message: "All data cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}