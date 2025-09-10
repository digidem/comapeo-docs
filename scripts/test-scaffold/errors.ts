/**
 * Custom error class for scaffold-related errors
 */
export class ScaffoldError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ScaffoldError";
    this.code = code;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ScaffoldError);
    }
  }
}

/**
 * Error codes for different scaffold error scenarios
 */
export enum ScaffoldErrorCode {
  INVALID_EXTENSION = "INVALID_EXTENSION",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  TEST_FILE_INPUT = "TEST_FILE_INPUT",
  TYPE_DEFINITION_FILE = "TYPE_DEFINITION_FILE",
  GENERATION_FAILED = "GENERATION_FAILED",
  TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
}
