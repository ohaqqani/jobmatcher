import multer from "multer";

// Configure multer for file uploads
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024, // 300MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream", // for Zapier/misc clients
    ];
    if (allowedTypes.includes(file.mimetype)) {
      // If octet-stream or zip, check extension
      const ext = file.originalname.split(".").pop()?.toLowerCase();
      if (
        file.mimetype === "application/octet-stream" &&
        !["pdf", "doc", "docx", "zip"].includes(ext || "")
      ) {
        cb(new Error("Invalid file type. Only PDF, DOC, DOCX, and ZIP files are allowed."));
      } else if (
        file.mimetype === "application/zip" ||
        file.mimetype === "application/x-zip-compressed" ||
        (file.mimetype === "application/octet-stream" && ext === "zip")
      ) {
        cb(null, true);
      } else if (
        ["pdf", "doc", "docx"].includes(ext || "") ||
        allowedTypes.includes(file.mimetype)
      ) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type. Only PDF, DOC, DOCX, and ZIP files are allowed."));
      }
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX, and ZIP files are allowed."));
    }
  },
});
