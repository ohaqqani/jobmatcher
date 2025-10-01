export interface FileValidationError {
  fileName: string;
  message: string;
}

const VALID_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file type
 */
export function validateFileType(file: File): FileValidationError | null {
  if (!VALID_FILE_TYPES.includes(file.type)) {
    return {
      fileName: file.name,
      message: `${file.name} is not a valid file type. Only PDF, DOC, and DOCX files are allowed.`,
    };
  }
  return null;
}

/**
 * Validate file size
 */
export function validateFileSize(file: File): FileValidationError | null {
  if (file.size > MAX_FILE_SIZE) {
    return {
      fileName: file.name,
      message: `${file.name} is too large. Maximum file size is 10MB.`,
    };
  }
  return null;
}

/**
 * Validate multiple files
 */
export function validateFiles(files: File[]): {
  validFiles: File[];
  errors: FileValidationError[];
} {
  const validFiles: File[] = [];
  const errors: FileValidationError[] = [];

  for (const file of files) {
    const typeError = validateFileType(file);
    const sizeError = validateFileSize(file);

    if (typeError) {
      errors.push(typeError);
    } else if (sizeError) {
      errors.push(sizeError);
    } else {
      validFiles.push(file);
    }
  }

  return { validFiles, errors };
}
