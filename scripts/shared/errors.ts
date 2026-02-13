/**
 * Unified error handling utilities for consistent and actionable error messages.
 *
 * Provides:
 * - Standardized error types across all scripts
 * - Actionable error messages with suggested fixes
 * - Consistent error formatting with chalk
 * - Error context tracking
 */

import chalk from "chalk";

/**
 * Base application error with actionable suggestions
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly suggestions: string[] = [],
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Format error for display with suggestions
   */
  format(): string {
    let output = chalk.red(`❌ ${this.name}: ${this.message}`);

    if (this.suggestions.length > 0) {
      output += chalk.gray("\n\n💡 Suggestions:");
      for (const suggestion of this.suggestions) {
        output += chalk.gray(`\n   - ${suggestion}`);
      }
    }

    if (this.context && Object.keys(this.context).length > 0) {
      output += chalk.gray("\n\n📋 Context:");
      for (const [key, value] of Object.entries(this.context)) {
        output += chalk.gray(`\n   ${key}: ${JSON.stringify(value)}`);
      }
    }

    return output;
  }
}

/**
 * Configuration or environment-related errors
 */
export class ConfigError extends AppError {
  constructor(
    message: string,
    suggestions: string[] = [],
    context?: Record<string, unknown>
  ) {
    const defaultSuggestions = [
      "Check your .env file configuration",
      "Ensure all required environment variables are set",
      "Refer to documentation for proper setup",
    ];
    super(message, [...defaultSuggestions, ...suggestions], context);
  }
}

/**
 * Network or API-related errors
 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    suggestions: string[] = [],
    context?: Record<string, unknown>
  ) {
    const defaultSuggestions = [
      "Check your internet connection",
      "Verify API credentials are valid",
      "Try again in a few moments",
    ];
    super(message, [...defaultSuggestions, ...suggestions], context);
  }
}

/**
 * Data validation or parsing errors
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly statusCode = 400,
    suggestions: string[] = [],
    context?: Record<string, unknown>
  ) {
    const defaultSuggestions = [
      "Verify the input data format is correct",
      "Check for missing or invalid fields",
      "Refer to API documentation for expected format",
    ];
    super(message, [...defaultSuggestions, ...suggestions], context);
  }
}

/**
 * File system or I/O errors
 */
export class FileSystemError extends AppError {
  constructor(
    message: string,
    suggestions: string[] = [],
    context?: Record<string, unknown>
  ) {
    const defaultSuggestions = [
      "Check file permissions",
      "Ensure the file or directory exists",
      "Verify sufficient disk space",
    ];
    super(message, [...defaultSuggestions, ...suggestions], context);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends NetworkError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    const suggestions = [
      retryAfter
        ? `Wait ${retryAfter} seconds before retrying`
        : "Wait a few moments before retrying",
      "Reduce the number of concurrent requests",
    ];
    super(message, suggestions, context);
  }
}

/**
 * Log an error with consistent formatting
 */
export function logError(error: unknown, context?: string): void {
  const prefix = context ? chalk.gray(`[${context}]`) : "";

  if (error instanceof AppError) {
    console.error(`${prefix} ${error.format()}`);
  } else if (error instanceof Error) {
    console.error(
      `${prefix} ${chalk.red("❌ Error:")} ${chalk.white(error.message)}`
    );
    if (error.stack) {
      console.error(chalk.gray("\nStack trace:"));
      console.error(chalk.gray(error.stack.split("\n").slice(1, 3).join("\n")));
    }
  } else {
    console.error(
      `${prefix} ${chalk.red("❌ Unknown error:")} ${chalk.white(String(error))}`
    );
  }
}

/**
 * Log a warning with consistent formatting
 */
export function logWarning(message: string, context?: string): void {
  const prefix = context ? chalk.gray(`[${context}]`) : "";
  console.warn(
    `${prefix} ${chalk.yellow("⚠️  Warning:")} ${chalk.white(message)}`
  );
}

/**
 * Log an info message with consistent formatting
 */
export function logInfo(message: string, context?: string): void {
  const prefix = context ? chalk.gray(`[${context}]`) : "";
  console.info(`${prefix} ${chalk.blue("ℹ️  Info:")} ${chalk.white(message)}`);
}

/**
 * Log success message with consistent formatting
 */
export function logSuccess(message: string, context?: string): void {
  const prefix = context ? chalk.gray(`[${context}]`) : "";
  console.log(
    `${prefix} ${chalk.green("✅ Success:")} ${chalk.white(message)}`
  );
}

/**
 * Wrap a function with error handling and logging
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      // Add context to existing AppError
      if (context) {
        error.context = { ...error.context, ...context };
      }
      logError(error, operation);
      throw error;
    }
    // Wrap unknown errors in AppError
    const appError = new AppError(
      error instanceof Error ? error.message : String(error),
      [],
      context
    );
    logError(appError, operation);
    throw appError;
  }
}

/**
 * Create a ValidationError for HTTP responses
 */
export function createValidationError(
  message: string,
  statusCode = 400,
  details?: unknown
): ValidationError {
  const suggestions = [
    "Check the request format",
    "Verify all required fields are present",
    "Refer to API documentation",
  ];
  const context = details ? { details } : undefined;
  return new ValidationError(message, statusCode, suggestions, context);
}

/**
 * Format error for HTTP response
 */
export function formatErrorResponse(error: unknown): {
  error: string;
  suggestions?: string[];
  context?: Record<string, unknown>;
} {
  if (error instanceof ValidationError) {
    return {
      error: error.message,
      suggestions: error.suggestions,
      context: error.context,
    };
  }
  if (error instanceof AppError) {
    return {
      error: error.message,
      suggestions: error.suggestions,
      context: error.context,
    };
  }
  if (error instanceof Error) {
    return { error: error.message };
  }
  return { error: String(error) };
}
