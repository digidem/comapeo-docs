/**
 * Centralized error handling and retry logic for Notion fetch operations.
 *
 * Provides:
 * - Error classification (transient vs permanent)
 * - Retry decision with exponential backoff
 * - Error aggregation and reporting
 * - Context-rich error logging
 */

import chalk from "chalk";

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  /** Transient errors that may resolve with retry (network, rate limits) */
  TRANSIENT = "transient",
  /** Permanent errors that won't resolve with retry (404, invalid data) */
  PERMANENT = "permanent",
  /** Unknown errors - limited retry */
  UNKNOWN = "unknown",
}

/**
 * Recorded error with context
 */
export interface RecordedError {
  timestamp: string;
  operation: string;
  message: string;
  category: ErrorCategory;
  context?: Record<string, unknown>;
  retryCount?: number;
  resolved?: boolean;
}

/**
 * Error report summary
 */
export interface ErrorReport {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsByOperation: Record<string, number>;
  topErrors: Array<{ message: string; count: number; operation: string }>;
  errors: RecordedError[];
}

/**
 * Retry decision result
 */
export interface RetryDecision {
  /** Whether to retry the operation */
  retry: boolean;
  /** Delay before retry in milliseconds */
  delayMs: number;
  /** Reason for the decision */
  reason: string;
}

/**
 * Configuration for ErrorManager
 */
export interface ErrorManagerConfig {
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay for exponential backoff in ms (default: 30000) */
  maxDelayMs?: number;
  /** Whether to log errors to console (default: true) */
  logErrors?: boolean;
}

/**
 * Centralized error management for retry logic, classification, and reporting
 */
export class ErrorManager {
  private errors: RecordedError[] = [];
  private config: Required<ErrorManagerConfig>;

  constructor(config: ErrorManagerConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 30000,
      logErrors: config.logErrors ?? true,
    };
  }

  /**
   * Record an error with context
   */
  recordError(
    operation: string,
    error: Error | unknown,
    context?: Record<string, unknown>
  ): void {
    const errorMessage =
      error instanceof Error ? error.message : String(error ?? "Unknown error");
    const category = this.classifyError(error);

    const recordedError: RecordedError = {
      timestamp: new Date().toISOString(),
      operation,
      message: errorMessage,
      category,
      context,
      retryCount: (context?.retryCount as number) ?? 0,
      resolved: false,
    };

    this.errors.push(recordedError);

    if (this.config.logErrors) {
      const categoryColor =
        category === ErrorCategory.TRANSIENT
          ? chalk.yellow
          : category === ErrorCategory.PERMANENT
            ? chalk.red
            : chalk.gray;
      console.error(
        categoryColor(
          `[${category.toUpperCase()}] ${operation}: ${errorMessage}`
        )
      );
    }
  }

  /**
   * Mark an error as resolved (e.g., after successful retry)
   */
  markResolved(operation: string): void {
    const error = this.errors
      .filter((e) => e.operation === operation && !e.resolved)
      .pop();
    if (error) {
      error.resolved = true;
    }
  }

  /**
   * Classify an error as transient, permanent, or unknown
   */
  classifyError(error: Error | unknown): ErrorCategory {
    if (!(error instanceof Error)) {
      return ErrorCategory.UNKNOWN;
    }

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Transient errors (retry-able)
    const transientPatterns = [
      // Network errors
      "econnreset",
      "econnrefused",
      "etimedout",
      "socket hang up",
      "network",
      "timeout",
      // Rate limiting
      "429",
      "rate limit",
      "too many requests",
      // Temporary server errors
      "502",
      "503",
      "504",
      "bad gateway",
      "service unavailable",
      "gateway timeout",
      // Temporary failures
      "temporarily unavailable",
      "try again",
      "retry",
    ];

    // Permanent errors (don't retry)
    const permanentPatterns = [
      // Client errors
      "400",
      "401",
      "403",
      "404",
      "405",
      "invalid",
      "not found",
      "unauthorized",
      "forbidden",
      "bad request",
      // Data errors
      "parse error",
      "syntax error",
      "invalid json",
      "malformed",
      // Resource errors
      "does not exist",
      "no such",
      "missing required",
    ];

    // Check transient patterns first
    for (const pattern of transientPatterns) {
      if (message.includes(pattern) || name.includes(pattern)) {
        return ErrorCategory.TRANSIENT;
      }
    }

    // Check permanent patterns
    for (const pattern of permanentPatterns) {
      if (message.includes(pattern) || name.includes(pattern)) {
        return ErrorCategory.PERMANENT;
      }
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine if and how to retry an operation
   */
  shouldRetry(
    operation: string,
    error: Error | unknown,
    currentAttempt: number
  ): RetryDecision {
    const category = this.classifyError(error);

    // Never retry permanent errors
    if (category === ErrorCategory.PERMANENT) {
      return {
        retry: false,
        delayMs: 0,
        reason: `Permanent error - won't resolve with retry`,
      };
    }

    // Check attempt count
    if (currentAttempt >= this.config.maxRetries) {
      return {
        retry: false,
        delayMs: 0,
        reason: `Max retries (${this.config.maxRetries}) exceeded`,
      };
    }

    // Calculate exponential backoff delay
    const delayMs = Math.min(
      this.config.baseDelayMs * Math.pow(2, currentAttempt),
      this.config.maxDelayMs
    );

    // Unknown errors get limited retries
    if (category === ErrorCategory.UNKNOWN) {
      const unknownMaxRetries = Math.min(2, this.config.maxRetries);
      if (currentAttempt >= unknownMaxRetries) {
        return {
          retry: false,
          delayMs: 0,
          reason: `Unknown error - limited retries (${unknownMaxRetries}) exceeded`,
        };
      }
    }

    return {
      retry: true,
      delayMs,
      reason: `Transient error - retrying after ${delayMs}ms`,
    };
  }

  /**
   * Execute an operation with automatic retry handling
   */
  async withRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await fn();
        if (attempt > 0) {
          this.markResolved(operation);
        }
        return result;
      } catch (error) {
        lastError = error;

        // Record the error
        this.recordError(operation, error, {
          ...context,
          retryCount: attempt,
        });

        // Check if we should retry
        const decision = this.shouldRetry(operation, error, attempt);
        if (!decision.retry) {
          break;
        }

        // Wait before retrying
        if (decision.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate an error report summary
   */
  getReport(): ErrorReport {
    const errorsByCategory: Record<ErrorCategory, number> = {
      [ErrorCategory.TRANSIENT]: 0,
      [ErrorCategory.PERMANENT]: 0,
      [ErrorCategory.UNKNOWN]: 0,
    };

    const errorsByOperation: Record<string, number> = {};
    const errorCounts: Record<string, { count: number; operation: string }> =
      {};

    for (const error of this.errors) {
      // Count by category
      errorsByCategory[error.category]++;

      // Count by operation
      errorsByOperation[error.operation] =
        (errorsByOperation[error.operation] || 0) + 1;

      // Count by message (for top errors)
      const key = `${error.operation}:${error.message}`;
      if (!errorCounts[key]) {
        errorCounts[key] = { count: 0, operation: error.operation };
      }
      errorCounts[key].count++;
    }

    // Get top errors
    const topErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([key, value]) => ({
        message: key.split(":").slice(1).join(":"),
        count: value.count,
        operation: value.operation,
      }));

    return {
      totalErrors: this.errors.length,
      errorsByCategory,
      errorsByOperation,
      topErrors,
      errors: this.errors,
    };
  }

  /**
   * Print error summary to console
   */
  printSummary(): void {
    const report = this.getReport();

    if (report.totalErrors === 0) {
      console.log(chalk.green("✅ No errors recorded"));
      return;
    }

    console.log(
      chalk.red(`\n📊 Error Summary: ${report.totalErrors} total errors`)
    );

    // By category
    console.log(chalk.gray("  By category:"));
    if (report.errorsByCategory[ErrorCategory.TRANSIENT] > 0) {
      console.log(
        chalk.yellow(
          `    - Transient: ${report.errorsByCategory[ErrorCategory.TRANSIENT]}`
        )
      );
    }
    if (report.errorsByCategory[ErrorCategory.PERMANENT] > 0) {
      console.log(
        chalk.red(
          `    - Permanent: ${report.errorsByCategory[ErrorCategory.PERMANENT]}`
        )
      );
    }
    if (report.errorsByCategory[ErrorCategory.UNKNOWN] > 0) {
      console.log(
        chalk.gray(
          `    - Unknown: ${report.errorsByCategory[ErrorCategory.UNKNOWN]}`
        )
      );
    }

    // Top errors
    if (report.topErrors.length > 0) {
      console.log(chalk.gray("  Top errors:"));
      for (const error of report.topErrors.slice(0, 5)) {
        console.log(
          chalk.gray(
            `    - [${error.operation}] ${error.message} (×${error.count})`
          )
        );
      }
    }
  }

  /**
   * Clear all recorded errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Get unresolved error count
   */
  getUnresolvedCount(): number {
    return this.errors.filter((e) => !e.resolved).length;
  }
}

// Global error manager instance
let globalErrorManager: ErrorManager | null = null;

/**
 * Get the global ErrorManager instance
 */
export function getErrorManager(): ErrorManager {
  if (!globalErrorManager) {
    globalErrorManager = new ErrorManager();
  }
  return globalErrorManager;
}

/**
 * Reset the global ErrorManager (useful for testing)
 */
export function resetErrorManager(): void {
  globalErrorManager = null;
}
