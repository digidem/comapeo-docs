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
