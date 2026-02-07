/**
 * Request Audit Logging Module
 *
 * Provides comprehensive audit logging for API requests including:
 * - Request metadata (method, path, headers, body)
 * - Authentication results
 * - Response status and timing
 * - Client information (IP, user agent)
 */

import { join } from "node:path";
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import type { ApiKeyMeta } from "./auth";

/**
 * Audit log entry structure
 */
export interface AuditEntry {
  /** Unique ID for this audit entry */
  id: string;
  /** Timestamp of the request */
  timestamp: string;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Query string (if any) */
  query?: string;
  /** Client IP address */
  clientIp: string;
  /** User agent */
  userAgent?: string;
  /** Authentication result */
  auth: {
    /** Whether authentication was successful */
    success: boolean;
    /** API key name if authenticated */
    keyName?: string;
    /** Error message if authentication failed */
    error?: string;
  };
  /** Request ID for correlation */
  requestId?: string;
  /** Job ID if relevant */
  jobId?: string;
  /** HTTP status code of response */
  statusCode?: number;
  /** Response time in milliseconds */
  responseTime?: number;
  /** Error message if request failed */
  errorMessage?: string;
}

/**
 * Audit logger configuration
 */
export interface AuditConfig {
  /** Directory to store audit logs */
  logDir: string;
  /** Base name for audit log files */
  logFile: string;
  /** Whether to log request bodies (may contain sensitive data) */
  logBodies: boolean;
  /** Whether to log full headers (may contain sensitive data) */
  logHeaders: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AuditConfig = {
  logDir: ".audit-data",
  logFile: "audit.log",
  logBodies: false, // Don't log bodies by default (security)
  logHeaders: false, // Don't log full headers by default (security)
};

/**
 * Request Audit Logger class
 *
 * Manages audit log entries with file-based persistence.
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private config: AuditConfig;
  private logPath: string;
  private entryCounter = 0;

  public constructor(config: Partial<AuditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logPath = join(this.config.logDir, this.config.logFile);
    this.ensureLogDirectory();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<AuditConfig>): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger(config);
    }
    return AuditLogger.instance;
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * Generate a unique audit entry ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const counter = (this.entryCounter++ % 1000).toString(36).padStart(3, "0");
    return `audit_${timestamp}_${counter}`;
  }

  /**
   * Extract client IP from request headers
   */
  private extractClientIp(headers: Headers): string {
    // Check common proxy headers
    const forwardedFor = headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }

    const realIp = headers.get("x-real-ip");
    if (realIp) {
      return realIp;
    }

    const cfConnectingIp = headers.get("cf-connecting-ip");
    if (cfConnectingIp) {
      return cfConnectingIp;
    }

    return "unknown";
  }

  /**
   * Create a new audit entry from a request
   */
  createEntry(
    req: Request,
    authResult: { success: boolean; meta?: ApiKeyMeta; error?: string }
  ): Omit<AuditEntry, "statusCode" | "responseTime" | "errorMessage"> {
    const url = new URL(req.url);
    const headers = req.headers;

    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      method: req.method,
      path: url.pathname,
      query: url.search || undefined,
      clientIp: this.extractClientIp(headers),
      userAgent: headers.get("user-agent") || undefined,
      auth: {
        success: authResult.success,
        keyName: authResult.meta?.name,
        error: authResult.error,
      },
    };

    return entry;
  }

  /**
   * Log an audit entry
   */
  log(entry: AuditEntry): void {
    const logLine = JSON.stringify(entry) + "\n";
    try {
      appendFileSync(this.logPath, logLine, "utf-8");
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  }

  /**
   * Log a successful request
   */
  logSuccess(
    entry: Omit<AuditEntry, "statusCode" | "responseTime">,
    statusCode: number,
    responseTime: number
  ): void {
    this.log({
      ...entry,
      statusCode,
      responseTime,
    });
  }

  /**
   * Log a failed request
   */
  logFailure(
    entry: Omit<AuditEntry, "statusCode" | "responseTime" | "errorMessage">,
    statusCode: number,
    errorMessage: string
  ): void {
    this.log({
      ...entry,
      statusCode,
      errorMessage,
    });
  }

  /**
   * Log an authentication failure
   */
  logAuthFailure(
    req: Request,
    authResult: { success: false; error?: string }
  ): void {
    const entry = this.createEntry(req, authResult);
    this.logFailure(entry, 401, authResult.error || "Authentication failed");
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Clear all audit logs (for testing purposes)
   */
  clearLogs(): void {
    try {
      writeFileSync(this.logPath, "", "utf-8");
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Create an audit middleware wrapper
 *
 * Wraps a request handler with audit logging
 */
export function withAudit<T extends Response>(
  handler: (
    req: Request,
    authResult: { success: boolean; meta?: ApiKeyMeta; error?: string }
  ) => T | Promise<T>
): (
  req: Request,
  authResult: { success: boolean; meta?: ApiKeyMeta; error?: string }
) => Promise<T> {
  return async (
    req: Request,
    authResult: { success: boolean; meta?: ApiKeyMeta; error?: string }
  ): Promise<T> => {
    const audit = AuditLogger.getInstance();
    const entry = audit.createEntry(req, authResult);
    const startTime = Date.now();

    try {
      const response = await handler(req, authResult);
      const responseTime = Date.now() - startTime;

      audit.logSuccess(entry, response.status, responseTime);

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      audit.logFailure(entry, 500, errorMessage);

      throw error;
    }
  };
}

/**
 * Get the singleton audit logger instance
 */
export function getAudit(): AuditLogger {
  return AuditLogger.getInstance();
}

/**
 * Configure the audit logger
 */
export function configureAudit(config: Partial<AuditConfig>): void {
  // @ts-expect-error - Intentionally replacing the singleton instance
  AuditLogger.instance = new AuditLogger(config);
}

/**
 * Validation result for audit entries
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors if any */
  errors: string[];
}

/**
 * Validate an audit entry structure
 *
 * Ensures all required fields are present and correctly typed.
 * This is used for runtime validation to catch data integrity issues.
 */
export function validateAuditEntry(entry: unknown): ValidationResult {
  const errors: string[] = [];

  // Must be an object
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return {
      valid: false,
      errors: ["Audit entry must be an object"],
    };
  }

  const e = entry as Record<string, unknown>;

  // Validate id
  if (typeof e.id !== "string" || !e.id.match(/^audit_[a-z0-9_]+$/)) {
    errors.push(`Invalid id: expected format 'audit_*', got '${String(e.id)}'`);
  }

  // Validate timestamp
  if (typeof e.timestamp !== "string") {
    errors.push(
      `Invalid timestamp: expected string, got ${typeof e.timestamp}`
    );
  } else {
    // Check if it's a valid ISO date
    const date = new Date(e.timestamp);
    if (isNaN(date.getTime())) {
      errors.push(`Invalid timestamp: not a valid ISO date string`);
    }
  }

  // Validate method
  if (typeof e.method !== "string" || e.method.length === 0) {
    errors.push(`Invalid method: expected non-empty string`);
  }

  // Validate path
  if (typeof e.path !== "string" || e.path.length === 0) {
    errors.push(`Invalid path: expected non-empty string`);
  }

  // Validate clientIp
  if (typeof e.clientIp !== "string") {
    errors.push(`Invalid clientIp: expected string, got ${typeof e.clientIp}`);
  }

  // Validate query (optional)
  if (e.query !== undefined && typeof e.query !== "string") {
    errors.push(
      `Invalid query: expected string or undefined, got ${typeof e.query}`
    );
  }

  // Validate userAgent (optional)
  if (e.userAgent !== undefined && typeof e.userAgent !== "string") {
    errors.push(
      `Invalid userAgent: expected string or undefined, got ${typeof e.userAgent}`
    );
  }

  // Validate auth object
  if (!e.auth || typeof e.auth !== "object" || Array.isArray(e.auth)) {
    errors.push(`Invalid auth: expected object`);
  } else {
    const auth = e.auth as Record<string, unknown>;
    if (typeof auth.success !== "boolean") {
      errors.push(
        `Invalid auth.success: expected boolean, got ${typeof auth.success}`
      );
    }
    // If auth failed, error should be present
    if (auth.success === false) {
      if (typeof auth.error !== "string" || auth.error.length === 0) {
        errors.push(
          `Invalid auth.error: expected non-empty string when auth.success is false`
        );
      }
    }
    // If auth succeeded, keyName should be present
    if (auth.success === true) {
      if (typeof auth.keyName !== "string" || auth.keyName.length === 0) {
        errors.push(
          `Invalid auth.keyName: expected non-empty string when auth.success is true`
        );
      }
    }
  }

  // Validate requestId (optional)
  if (e.requestId !== undefined && typeof e.requestId !== "string") {
    errors.push(
      `Invalid requestId: expected string or undefined, got ${typeof e.requestId}`
    );
  }

  // Validate jobId (optional)
  if (e.jobId !== undefined && typeof e.jobId !== "string") {
    errors.push(
      `Invalid jobId: expected string or undefined, got ${typeof e.jobId}`
    );
  }

  // Validate statusCode (optional)
  if (e.statusCode !== undefined) {
    if (
      typeof e.statusCode !== "number" ||
      e.statusCode < 100 ||
      e.statusCode > 599
    ) {
      errors.push(
        `Invalid statusCode: expected number between 100-599, got ${String(e.statusCode)}`
      );
    }
  }

  // Validate responseTime (optional)
  if (e.responseTime !== undefined) {
    if (typeof e.responseTime !== "number" || e.responseTime < 0) {
      errors.push(
        `Invalid responseTime: expected non-negative number, got ${String(e.responseTime)}`
      );
    }
  }

  // Validate errorMessage (optional)
  if (e.errorMessage !== undefined && typeof e.errorMessage !== "string") {
    errors.push(
      `Invalid errorMessage: expected string or undefined, got ${typeof e.errorMessage}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate auth result structure
 *
 * Ensures auth results are correctly structured.
 */
export function validateAuthResult(authResult: unknown): ValidationResult {
  const errors: string[] = [];

  // Must be an object
  if (
    !authResult ||
    typeof authResult !== "object" ||
    Array.isArray(authResult)
  ) {
    return {
      valid: false,
      errors: ["Auth result must be an object"],
    };
  }

  const a = authResult as Record<string, unknown>;

  // Validate success
  if (typeof a.success !== "boolean") {
    errors.push(`Invalid success: expected boolean, got ${typeof a.success}`);
  }

  // If auth succeeded, meta should be present and error should be absent
  if (a.success === true) {
    if (!a.meta || typeof a.meta !== "object" || Array.isArray(a.meta)) {
      errors.push(`Invalid meta: expected object when success is true`);
    } else {
      const meta = a.meta as Record<string, unknown>;
      if (typeof meta.name !== "string" || meta.name.length === 0) {
        errors.push(`Invalid meta.name: expected non-empty string`);
      }
      if (typeof meta.active !== "boolean") {
        errors.push(`Invalid meta.active: expected boolean`);
      }
      // createdAt can be either a Date object or an ISO string
      const createdAtValid =
        (meta.createdAt instanceof Date && !isNaN(meta.createdAt.getTime())) ||
        (typeof meta.createdAt === "string" &&
          !isNaN(new Date(meta.createdAt).getTime()));
      if (!createdAtValid) {
        errors.push(
          `Invalid meta.createdAt: expected valid Date or ISO date string`
        );
      }
    }
    if (a.error !== undefined) {
      errors.push(
        `Unexpected error field: should not be present when success is true`
      );
    }
  }

  // If auth failed, error should be present and meta should be absent
  if (a.success === false) {
    if (typeof a.error !== "string" || a.error.length === 0) {
      errors.push(
        `Invalid error: expected non-empty string when success is false`
      );
    }
    if (a.meta !== undefined) {
      errors.push(
        `Unexpected meta field: should not be present when success is false`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
