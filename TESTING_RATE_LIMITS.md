# Testing Rate Limit Queue System

This guide walks you through testing the rate limit handling and queue retry system using simulated rate limits.

## Prerequisites

1. Database is running and migrations are applied
2. Server dependencies are installed (`npm install`)
3. OpenAI API key is configured (even though we won't use it for testing)

## Setup

### Step 1: Apply Database Migrations

First, ensure the new queue tables are created:

```bash
npm run db:push
```

This creates the following tables:

- `candidate_extraction_queue`
- `resume_anonymization_queue`
- `job_analysis_queue`
- `match_processing_queue`

### Step 2: Verify Tables Exist

```sql
-- Check that all queue tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%queue%';
```

You should see all 4 queue tables listed.

---

## Test 1: Candidate Extraction Queue

### Enable Rate Limit Simulation

```bash
SIMULATE_RATE_LIMIT=true npm run dev
```

### Upload a Mock Resume

Create a test file `test-resume.txt`:

```text
John Doe
Senior Software Engineer
Email: john.doe@email.com
Phone: (555) 123-4567

EXPERIENCE
Senior Software Engineer at Tech Corp (2020-Present)
- Led development of microservices architecture using Node.js and React
- Managed team of 5 engineers
- Implemented CI/CD pipelines

Software Engineer at StartupCo (2018-2020)
- Built RESTful APIs with Python and Django
- Worked with PostgreSQL and MongoDB databases

SKILLS
JavaScript, TypeScript, React, Node.js, Python, Django, PostgreSQL, MongoDB,
AWS, Docker, Kubernetes, Git, Agile, Team Leadership

EDUCATION
Bachelor of Science in Computer Science
University of Technology (2014-2018)
```

### Upload the Resume

```bash
curl -X POST http://localhost:3000/api/candidates \
  -F "files=@test-resume.txt" \
  -H "Content-Type: multipart/form-data"
```

### Expected Response

```json
{
  "processed": 1,
  "results": [
    {
      "fileName": "test-resume.txt",
      "status": "queued",
      "candidateExtractionQueued": true,
      "anonymizationQueued": true,
      "resumeId": "some-uuid",
      "fileIndex": 1
    }
  ]
}
```

### Verify Queue Entries

```sql
-- Check candidate extraction queue
SELECT * FROM candidate_extraction_queue;

-- Check resume anonymization queue
SELECT * FROM resume_anonymization_queue;

-- Both should have 1 entry with status='pending'
```

### Verify Resume Was Created (but not candidate)

```sql
-- Resume should exist
SELECT id, file_name, content_hash FROM resumes;

-- Candidate should NOT exist yet
SELECT * FROM candidates; -- Should be empty
```

---

## Test 2: Process the Queue (Workers)

### Stop the Server

Press `Ctrl+C` to stop the server.

### Restart WITHOUT Simulation

```bash
npm run dev
# Or explicitly:
SIMULATE_RATE_LIMIT=false npm run dev
```

### Watch the Logs

You should see output like:

```
Starting background workers...
Starting candidate extraction queue worker
Starting resume anonymization queue worker
Starting job analysis queue worker
Starting match processing queue worker
Background workers started successfully

Processing 1 candidate extraction queue items
Retrying candidate extraction for resume abc-123 (attempt 1/3)
Successfully extracted candidate info for John Doe
Extracted candidate info for: John Doe

Processing 1 resume anonymization queue items
Retrying resume anonymization for resume abc-123 (attempt 1/3)
Successfully anonymized resume abc-123
```

### Verify Queue is Empty

```sql
-- Both queues should now be empty
SELECT * FROM candidate_extraction_queue; -- 0 rows
SELECT * FROM resume_anonymization_queue; -- 0 rows
```

### Verify Candidate Was Created

```sql
-- Candidate should now exist
SELECT id, first_name, last_name, email, skills
FROM candidates;

-- Resume should have anonymized HTML
SELECT id, file_name,
       CASE WHEN public_resume_html IS NOT NULL
            THEN 'HTML present'
            ELSE 'HTML missing'
       END as html_status
FROM resumes;
```

---

## Test 3: Job Analysis Queue

### Enable Simulation Again

```bash
SIMULATE_RATE_LIMIT=true npm run dev
```

### Create and Analyze a Job Description

Note: Job creation now automatically triggers analysis in a single request.

```bash
curl -X POST http://localhost:3000/api/job-descriptions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior Full Stack Engineer",
    "description": "We are seeking a Senior Full Stack Engineer with 5+ years of experience in React, Node.js, and TypeScript. You will lead the development of our core platform, mentor junior developers, and work with PostgreSQL databases. Experience with AWS and Docker is required. Must have strong communication skills and experience working in Agile teams."
  }'
```

### Expected Response (When Rate Limited)

```json
{
  "job": {
    "id": "job-uuid",
    "title": "Senior Full Stack Engineer",
    "description": "...",
    "requiredSkills": [],
    "contentHash": "hash-value",
    "analyzedAt": "timestamp"
  },
  "analysisStatus": "queued",
  "message": "Job created successfully! Analysis is queued due to high demand and will complete automatically within a few minutes."
}
```

Job is created, but `requiredSkills` is empty and analysis is queued.

### Expected Response (Without Rate Limit)

```json
{
  "job": {
    "id": "job-uuid",
    "title": "Senior Full Stack Engineer",
    "description": "...",
    "requiredSkills": [
      "React",
      "Node.js",
      "TypeScript",
      "PostgreSQL",
      "AWS",
      "Docker",
      "Agile",
      "Leadership"
    ],
    "contentHash": "hash-value",
    "analyzedAt": "timestamp"
  },
  "analysisStatus": "complete"
}
```

### Verify Queue Entry

```sql
SELECT * FROM job_analysis_queue;
-- Should have 1 entry
```

### Process the Queue

```bash
# Stop server (Ctrl+C)
# Restart without simulation
npm run dev
```

Watch logs for:

```
Processing 1 job analysis queue items
Retrying job analysis for job abc-123 (attempt 1/3)
Successfully analyzed job abc-123, found 8 skills
```

### Verify Job Was Analyzed

```sql
SELECT id, title, required_skills
FROM job_descriptions;

-- required_skills should now be populated with an array like:
-- ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS", "Docker", ...]
```

---

## Test 4: Match Processing Queue

### Prerequisites

You need:

- At least 1 candidate (from Test 1 & 2)
- At least 1 analyzed job (from Test 3)

### Enable Simulation

```bash
SIMULATE_RATE_LIMIT=true npm run dev
```

### Get Resume IDs

```sql
SELECT id FROM resumes;
```

### Run Matching (Will Be Queued)

```bash
curl -X POST http://localhost:3000/api/job-descriptions/{job-id}/match \
  -H "Content-Type: application/json" \
  -d '{
    "resumeIds": ["resume-id-1", "resume-id-2"]
  }'
```

### Expected Response

```json
{
  "jobId": "job-uuid",
  "matches": [
    {
      "jobDescriptionId": "job-uuid",
      "candidateId": "candidate-uuid",
      "matchScore": null,
      "status": "queued",
      "message": "Rate limited, queued for retry"
    }
  ]
}
```

### Verify Queue Entry

```sql
SELECT * FROM match_processing_queue;
-- Should have entries for each candidate-job pair
```

### Process the Queue

```bash
# Stop server (Ctrl+C)
# Restart without simulation
npm run dev
```

Watch logs for:

```
Processing 1 match processing queue items
Retrying match calculation for candidate abc-123 and job xyz-456 (attempt 1/3)
Successfully calculated match for John Doe and Senior Full Stack Engineer: 85%
```

### Verify Match Results

```sql
SELECT
  mr.id,
  mr.match_score,
  c.first_name || ' ' || c.last_name as candidate_name,
  jd.title as job_title,
  mr.matching_skills
FROM match_results mr
JOIN candidates c ON mr.candidate_id = c.id
JOIN job_descriptions jd ON mr.job_description_id = jd.id;

-- Should show the match with score and matching skills
```

---

## Test 5: Retry Logic with Exponential Backoff

This tests that the system retries with increasing delays.

### Setup

1. Add items to queue (use Test 1-4 with simulation ON)
2. Keep simulation ON but restart server

```bash
SIMULATE_RATE_LIMIT=true npm run dev
```

### Watch Worker Retry Behavior

With simulation still enabled, the workers will continuously retry and fail. Watch the logs:

```
[10:00:00] Processing 1 candidate extraction queue items
[10:00:00] Retrying candidate extraction for resume abc-123 (attempt 1/3)
[10:00:00] Rate limit hit, retrying in 1s (attempt 1/3)
[10:00:01] Rate limit hit, retrying in 2s (attempt 2/3)
[10:00:03] Rate limit hit, retrying in 4s (attempt 3/3)
[10:00:07] Failed to process candidate extraction queue item: Rate limit exceeded after 3 retries

[10:00:10] Processing 1 candidate extraction queue items (polls again)
[10:00:10] Retrying candidate extraction for resume abc-123 (attempt 2/3)
```

### Check Queue Status After Max Retries

```sql
SELECT
  id,
  resume_id,
  status,
  attempt_count,
  last_error,
  next_retry_at
FROM candidate_extraction_queue;

-- After 3 failed attempts:
-- attempt_count will be 3
-- next_retry_at will be far in the future (1 year)
-- last_error will show "Rate limit exceeded after 3 retries"
```

### Recover Failed Items

```bash
# Turn off simulation
SIMULATE_RATE_LIMIT=false npm run dev

# Workers will eventually pick up the items again
# Even items marked as "failed" will be retried when next_retry_at expires
```

---

## Test 6: Batch Resume Fetching Performance

This verifies the N+1 query fix for matching.

### Create Multiple Resumes

Upload 10 test resumes with simulation OFF:

```bash
SIMULATE_RATE_LIMIT=false npm run dev

# Upload 10 resumes
for i in {1..10}; do
  echo "Test Candidate $i
Email: candidate$i@test.com
Skills: JavaScript, React, Node.js
Experience: $i years of software development" > "resume-$i.txt"

  curl -X POST http://localhost:3000/api/candidates \
    -F "files=@resume-$i.txt"
done
```

### Run Matching and Watch Database Queries

Enable query logging in PostgreSQL:

```sql
-- In psql
SET log_statement = 'all';
SET log_min_duration_statement = 0;
```

Run matching:

```bash
curl -X POST http://localhost:3000/api/job-descriptions/{job-id}/match \
  -H "Content-Type: application/json" \
  -d '{
    "resumeIds": ["id1", "id2", "id3", "id4", "id5", "id6", "id7", "id8", "id9", "id10"]
  }'
```

### Check Logs

You should see:

- **1 batch SELECT** for all 10 resumes (using `WHERE id = ANY(...)`)
- NOT 10 individual SELECT queries

Before the fix:

```sql
SELECT * FROM resumes WHERE id = 'id1';
SELECT * FROM resumes WHERE id = 'id2';
... (10 queries)
```

After the fix:

```sql
SELECT * FROM resumes WHERE id = ANY(ARRAY['id1', 'id2', ..., 'id10']);
-- Only 1 query!
```

---

## Test 7: Graceful Shutdown

### Start Server with Queued Items

```bash
SIMULATE_RATE_LIMIT=true npm run dev
# Upload some resumes to create queue items

# Stop and restart without simulation
SIMULATE_RATE_LIMIT=false npm run dev
```

### Send Shutdown Signal While Processing

In another terminal:

```bash
# Get the server PID
ps aux | grep "node.*server"

# Send SIGTERM
kill -SIGTERM <pid>

# Or just press Ctrl+C in the server terminal
```

### Expected Shutdown Logs

```
^CSIGINT received, shutting down gracefully...
Stopping candidate extraction queue worker
Stopping resume anonymization queue worker
Stopping job analysis queue worker
Stopping match processing queue worker
Server closed
```

The server should:

1. Stop accepting new requests
2. Stop all 4 workers (clear intervals)
3. Close gracefully within 10 seconds
4. If stuck, force shutdown after 10s

---

## Verification Checklist

After running all tests, verify:

- [ ] Resumes are created even when extraction fails
- [ ] Candidates are created by workers after retry
- [ ] Anonymized HTML is added by workers after retry
- [ ] Jobs are analyzed by workers after retry
- [ ] Matches are calculated by workers after retry
- [ ] Queue tables are empty after successful processing
- [ ] Failed items stay in queue with far-future retry time
- [ ] Batch resume fetching uses 1 query instead of N queries
- [ ] Workers stop gracefully on SIGTERM/SIGINT
- [ ] No data is persisted with error values (no "Unknown" candidates)

---

## Troubleshooting

### Queue Items Not Processing

**Check:**

1. Workers are running: Look for "Starting background workers..." in logs
2. `next_retry_at` is in the past: `SELECT * FROM *_queue WHERE next_retry_at > NOW()`
3. Simulation is OFF: `echo $SIMULATE_RATE_LIMIT` should be empty or "false"

### Workers Not Starting

**Check:**

1. No TypeScript errors: `npm run build`
2. Database connection is working: Check server logs
3. Migrations applied: `npm run db:push`

### "Unknown" Candidates Still Created

**Issue:** Rate limit errors should NOT create candidates with default values.

**Fix:** Make sure you're using the latest code where `extractCandidateInfo()` throws errors instead of returning defaults.

### Queue Growing Unbounded

**Issue:** Items failing and being retried indefinitely.

**Check:**

1. `attempt_count` column: Should max out at 3
2. `next_retry_at` after max retries: Should be ~1 year in future
3. Turn off simulation to let workers succeed

---

## Clean Up

After testing, you may want to clear the test data:

```sql
-- Clear all queue tables
TRUNCATE candidate_extraction_queue CASCADE;
TRUNCATE resume_anonymization_queue CASCADE;
TRUNCATE job_analysis_queue CASCADE;
TRUNCATE match_processing_queue CASCADE;

-- Clear test data
DELETE FROM match_results;
DELETE FROM candidates;
DELETE FROM resumes;
DELETE FROM job_descriptions;
```

---

## Summary

This testing guide demonstrates:

✅ Rate limit simulation with environment variable
✅ Queue entries created when rate limited
✅ Workers automatically retry failed items
✅ Exponential backoff with max retries
✅ Partial success handling (resume created, extraction queued)
✅ Batch performance optimization (N+1 fix)
✅ Graceful shutdown of workers
✅ No error data persisted to database

The system is now production-ready for handling OpenAI rate limits! 🚀
