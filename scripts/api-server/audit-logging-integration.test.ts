/**
 * Audit Logging Integration Tests
 *
 * Tests for verifying that audit records are written for:
 * - Authenticated requests
 * - Failed requests
 * - Authentication failures
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAuth, requireAuth, type ApiKeyAuth } from "./auth";
import { AuditLogger, getAudit, configureAudit } from "./audit";
import { destroyJobTracker } from "./job-tracker";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_API_KEY = "test-audit-key-12345678";
const AUDIT_LOG_DIR = join(process.cwd(), ".test-audit-integration");
const AUDIT_LOG_FILE = "audit-integration.log";

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(AUDIT_LOG_DIR)) {
    try {
      rmSync(AUDIT_LOG_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }
}

describe("Audit Logging Integration", () => {
  let auth: ApiKeyAuth;
  let audit: AuditLogger;

  beforeEach(() => {
    // Clean up test data
    cleanupTestData();

    // Reset job tracker
    destroyJobTracker();

    // Reset audit logger singleton and configure with test settings
    AuditLogger["instance"] = undefined;
    configureAudit({
      logDir: AUDIT_LOG_DIR,
      logFile: AUDIT_LOG_FILE,
      logBodies: false,
      logHeaders: false,
    });

    // Get fresh audit instance
    audit = getAudit();
    audit.clearLogs();

    // Get auth instance and clear any existing keys
    auth = getAuth();
    auth.clearKeys();

    // Add test API key
    auth.addKey("test", TEST_API_KEY, {
      name: "test",
      description: "Test API key for audit integration tests",
      active: true,
    });
  });

  afterEach(() => {
    // Clean up
    auth.clearKeys();
    destroyJobTracker();
    audit.clearLogs();
    cleanupTestData();
  });

  describe("Audit Records for Authenticated Requests", () => {
    it("should write audit record for successful authenticated request", () => {
      // Create a mock request with valid authentication
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TEST_API_KEY}`,
          "x-forwarded-for": "192.168.1.100",
        },
        body: JSON.stringify({ type: "notion:fetch" }),
      });

      // Authenticate request
      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(true);

      // Create and log audit entry
      const entry = audit.createEntry(req, authResult);
      audit.logSuccess(entry, 201, 15);

      // Verify audit log file was created
      const logPath = audit.getLogPath();
      expect(existsSync(logPath)).toBe(true);

      // Read and verify log contents
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(true);
      expect(logEntry.auth.keyName).toBe("test");
      expect(logEntry.method).toBe("POST");
      expect(logEntry.path).toBe("/jobs");
      expect(logEntry.clientIp).toBe("192.168.1.100");
      expect(logEntry.statusCode).toBe(201);
      expect(logEntry.responseTime).toBe(15);
      expect(logEntry.id).toMatch(/^audit_[a-z0-9_]+$/);
      expect(logEntry.timestamp).toBeDefined();
    });

    it("should write audit record for GET request with authentication", () => {
      const req = new Request("http://localhost:3001/jobs?type=fetch", {
        method: "GET",
        headers: {
          authorization: `Bearer ${TEST_API_KEY}`,
          "user-agent": "test-client/1.0",
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(true);

      const entry = audit.createEntry(req, authResult);
      audit.logSuccess(entry, 200, 8);

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(true);
      expect(logEntry.auth.keyName).toBe("test");
      expect(logEntry.method).toBe("GET");
      expect(logEntry.path).toBe("/jobs");
      expect(logEntry.query).toBe("?type=fetch");
      expect(logEntry.userAgent).toBe("test-client/1.0");
      expect(logEntry.statusCode).toBe(200);
      expect(logEntry.responseTime).toBe(8);
    });

    it("should write audit record for DELETE request with authentication", () => {
      const req = new Request("http://localhost:3001/jobs/job-123", {
        method: "DELETE",
        headers: {
          authorization: `Api-Key ${TEST_API_KEY}`,
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(true);

      const entry = audit.createEntry(req, authResult);
      audit.logSuccess(entry, 200, 25);

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(true);
      expect(logEntry.method).toBe("DELETE");
      expect(logEntry.path).toBe("/jobs/job-123");
      expect(logEntry.statusCode).toBe(200);
    });

    it("should write multiple audit records for multiple authenticated requests", () => {
      const PUBLIC_ENDPOINTS = ["/health", "/jobs/types", "/docs"];

      function isPublicEndpoint(path: string): boolean {
        return PUBLIC_ENDPOINTS.some((endpoint) => path === endpoint);
      }

      const requests = [
        new Request("http://localhost:3001/health", { method: "GET" }),
        new Request("http://localhost:3001/jobs", {
          method: "GET",
          headers: { authorization: `Bearer ${TEST_API_KEY}` },
        }),
        new Request("http://localhost:3001/jobs/job-1", {
          method: "GET",
          headers: { authorization: `Bearer ${TEST_API_KEY}` },
        }),
      ];

      requests.forEach((req) => {
        const url = new URL(req.url);
        const isPublic = isPublicEndpoint(url.pathname);

        // For public endpoints, use a successful auth result
        // For protected endpoints, use actual auth
        const authHeader = req.headers.get("authorization");
        let authResult;
        if (isPublic) {
          authResult = {
            success: true,
            meta: { name: "public", active: true, createdAt: new Date() },
          };
        } else {
          authResult = requireAuth(authHeader);
        }

        const entry = audit.createEntry(req, authResult as any);
        audit.logSuccess(entry, 200, 10);
      });

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const lines = logContents.trim().split("\n");

      expect(lines).toHaveLength(3);

      const entries = lines.map((line) => JSON.parse(line));
      expect(entries[0].path).toBe("/health");
      expect(entries[1].path).toBe("/jobs");
      expect(entries[2].path).toBe("/jobs/job-1");

      // Verify all have successful auth (health is public with "public" keyName)
      entries.forEach((entry) => {
        expect(entry.auth.success).toBe(true);
      });

      // Verify protected endpoints have the test key name
      expect(entries[1].auth.keyName).toBe("test");
      expect(entries[2].auth.keyName).toBe("test");

      // Verify public endpoint has public key name
      expect(entries[0].auth.keyName).toBe("public");
    });
  });

  describe("Audit Records for Failed Requests", () => {
    it("should write audit record for failed authenticated request", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TEST_API_KEY}`,
        },
        body: JSON.stringify({ type: "invalid:job:type" }),
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(true);

      // Create entry for authenticated request that fails validation
      const entry = audit.createEntry(req, authResult);
      audit.logFailure(entry, 400, "Invalid job type");

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(true);
      expect(logEntry.auth.keyName).toBe("test");
      expect(logEntry.statusCode).toBe(400);
      expect(logEntry.errorMessage).toBe("Invalid job type");
      expect(logEntry.method).toBe("POST");
      expect(logEntry.path).toBe("/jobs");
    });

    it("should write audit record for internal server error", () => {
      const req = new Request("http://localhost:3001/jobs/job-123", {
        method: "GET",
        headers: {
          authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(true);

      const entry = audit.createEntry(req, authResult);
      audit.logFailure(entry, 500, "Database connection failed");

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(true);
      expect(logEntry.statusCode).toBe(500);
      expect(logEntry.errorMessage).toBe("Database connection failed");
    });

    it("should write audit record for request timeout", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(true);

      const entry = audit.createEntry(req, authResult);
      audit.logFailure(entry, 504, "Request timeout after 30s");

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.statusCode).toBe(504);
      expect(logEntry.errorMessage).toBe("Request timeout after 30s");
      expect(logEntry.auth.success).toBe(true);
    });
  });

  describe("Audit Records for Authentication Failures", () => {
    it("should write audit record for missing authorization header", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "10.0.0.50",
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Missing Authorization header");

      // Log auth failure
      audit.logAuthFailure(
        req,
        authResult as { success: false; error?: string }
      );

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.auth.error).toContain("Missing Authorization header");
      expect(logEntry.auth.keyName).toBeUndefined();
      expect(logEntry.statusCode).toBe(401);
      expect(logEntry.method).toBe("POST");
      expect(logEntry.path).toBe("/jobs");
      expect(logEntry.clientIp).toBe("10.0.0.50");
    });

    it("should write audit record for invalid API key", () => {
      const req = new Request("http://localhost:3001/jobs/job-123", {
        method: "GET",
        headers: {
          authorization: "Bearer invalid-key-12345678",
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid API key");

      audit.logAuthFailure(
        req,
        authResult as { success: false; error?: string }
      );

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.auth.error).toContain("Invalid API key");
      expect(logEntry.statusCode).toBe(401);
      expect(logEntry.path).toBe("/jobs/job-123");
    });

    it("should write audit record for malformed authorization header", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "GET",
        headers: {
          authorization: "InvalidFormat",
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("Invalid Authorization header format");

      audit.logAuthFailure(
        req,
        authResult as { success: false; error?: string }
      );

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.auth.error).toContain(
        "Invalid Authorization header format"
      );
      expect(logEntry.statusCode).toBe(401);
    });

    it("should write audit record for inactive API key", () => {
      // Add inactive key
      const inactiveKey = "inactive-key-123456789";
      auth.addKey("inactive", inactiveKey, {
        name: "inactive",
        active: false,
      });

      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${inactiveKey}`,
        },
      });

      const authHeader = req.headers.get("authorization");
      const authResult = requireAuth(authHeader);

      expect(authResult.success).toBe(false);
      expect(authResult.error).toContain("inactive");

      audit.logAuthFailure(
        req,
        authResult as { success: false; error?: string }
      );

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.auth.error).toContain("inactive");
      expect(logEntry.statusCode).toBe(401);
    });
  });

  describe("Mixed Success and Failure Scenarios", () => {
    it("should write audit records for mix of successful and failed requests", () => {
      const scenarios = [
        {
          req: new Request("http://localhost:3001/health", { method: "GET" }),
          authResult: {
            success: true,
            meta: { name: "public", active: true, createdAt: new Date() },
          },
          statusCode: 200,
          responseTime: 5,
        },
        {
          req: new Request("http://localhost:3001/jobs", {
            method: "POST",
            headers: { authorization: "Bearer invalid-key" },
          }),
          authResult: { success: false, error: "Invalid API key" },
          statusCode: 401,
        },
        {
          req: new Request("http://localhost:3001/jobs", {
            method: "GET",
            headers: { authorization: `Bearer ${TEST_API_KEY}` },
          }),
          authResult: {
            success: true,
            meta: { name: "test", active: true, createdAt: new Date() },
          },
          statusCode: 200,
          responseTime: 12,
        },
        {
          req: new Request("http://localhost:3001/jobs", {
            method: "POST",
            headers: { authorization: `Bearer ${TEST_API_KEY}` },
          }),
          authResult: {
            success: true,
            meta: { name: "test", active: true, createdAt: new Date() },
          },
          statusCode: 400,
          errorMessage: "Invalid job type",
        },
      ];

      scenarios.forEach((scenario) => {
        const entry = audit.createEntry(
          scenario.req as Request,
          scenario.authResult as any
        );
        if (scenario.statusCode >= 400) {
          audit.logFailure(
            entry,
            scenario.statusCode,
            scenario.errorMessage || "Request failed"
          );
        } else {
          audit.logSuccess(
            entry,
            scenario.statusCode,
            scenario.responseTime || 0
          );
        }
      });

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const lines = logContents.trim().split("\n");

      expect(lines).toHaveLength(4);

      const entries = lines.map((line) => JSON.parse(line));

      // Verify health check (public, success)
      expect(entries[0].path).toBe("/health");
      expect(entries[0].auth.success).toBe(true);
      expect(entries[0].statusCode).toBe(200);

      // Verify auth failure
      expect(entries[1].path).toBe("/jobs");
      expect(entries[1].auth.success).toBe(false);
      expect(entries[1].auth.error).toContain("Invalid API key");
      expect(entries[1].statusCode).toBe(401);

      // Verify successful authenticated request
      expect(entries[2].path).toBe("/jobs");
      expect(entries[2].auth.success).toBe(true);
      expect(entries[2].auth.keyName).toBe("test");
      expect(entries[2].statusCode).toBe(200);

      // Verify authenticated request that failed validation
      expect(entries[3].path).toBe("/jobs");
      expect(entries[3].auth.success).toBe(true);
      expect(entries[3].auth.keyName).toBe("test");
      expect(entries[3].statusCode).toBe(400);
      expect(entries[3].errorMessage).toBe("Invalid job type");
    });
  });
});
