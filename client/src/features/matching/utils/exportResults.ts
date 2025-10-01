import type { CandidateWithMatch } from "@shared/schemas";

/**
 * Export matching results to CSV format
 */
export function exportToCsv(results: CandidateWithMatch[]): void {
  if (results.length === 0) return;

  const csvData = results.map((candidate) => ({
    "First Name": candidate.firstName,
    "Last Name": candidate.lastName,
    Email: candidate.email,
    Phone: candidate.phone || "",
    "Match Score": `${candidate.matchResult.matchScore}%`,
    Skills: candidate.skills?.join(", ") || "",
    Experience:
      typeof candidate.experience === "string"
        ? candidate.experience
        : candidate.experience
          ? JSON.stringify(candidate.experience)
              .replace(/[{}",]/g, " ")
              .trim()
          : "",
    "File Name": candidate.resume.fileName,
    Analysis: candidate.matchResult.analysis || "",
  }));

  const headers = Object.keys(csvData[0]);
  const csvContent = [
    headers.join(","),
    ...csvData.map((row) =>
      headers.map((header) => `"${row[header as keyof typeof row]}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "candidate-analysis-results.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
