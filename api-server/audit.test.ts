/**
 * Audit Logging Module Tests
 *
 * Tests for request audit logging functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AuditLogger,
  getAudit,
  configureAudit,
  withAudit,
  validateAuditEntry,
  validateAuthResult,
  type ValidationResult,
} from "./audit";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireAuth, getAuth as getAuthModule } from "./auth";

describe("AuditLogger", () => {
  const logDir = join(process.cwd(), ".test-audit-data");
  let audit: AuditLogger;

  beforeEach(() => {
    // Clean up any existing test data
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }

    // Clear any existing instance and create fresh one with test config
    AuditLogger["instance"] = undefined;
    audit = new AuditLogger({
      logDir,
      logFile: "test-audit.log",
      logBodies: false,
      logHeaders: false,
    });
  });

  afterEach(() => {
    // Clean up test data
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  describe("Audit Entry Creation", () => {
    it("should create audit entry from request", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "test-client/1.0",
          "x-forwarded-for": "192.168.1.100",
        },
      });

      const authResult = {
        success: true,
        meta: {
          name: "test-key",
          description: "Test API key",
          active: true,
          createdAt: new Date(),
        },
      };

      const entry = audit.createEntry(req, authResult);

      expect(entry.id).toMatch(/^audit_[a-z0-9_]+$/);
      expect(entry.timestamp).toBeDefined();
      expect(entry.method).toBe("POST");
      expect(entry.path).toBe("/jobs");
      expect(entry.clientIp).toBe("192.168.1.100");
      expect(entry.userAgent).toBe("test-client/1.0");
      expect(entry.auth.success).toBe(true);
      expect(entry.auth.keyName).toBe("test-key");
    });

    it("should extract client IP from various headers", () => {
      const testCases = [
        {
          headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
          expected: "10.0.0.1",
        },
        {
          headers: { "x-real-ip": "10.0.0.3" },
          expected: "10.0.0.3",
        },
        {
          headers: { "cf-connecting-ip": "10.0.0.4" },
          expected: "10.0.0.4",
        },
        {
          headers: {},
          expected: "unknown",
        },
      ];

      for (const testCase of testCases) {
        const req = new Request("http://localhost:3001/health", {
          headers: testCase.headers,
        });

        const authResult = {
          success: true,
          meta: { name: "public", active: true, createdAt: new Date() },
        };
        const entry = audit.createEntry(req, authResult);

        expect(entry.clientIp).toBe(testCase.expected);
      }
    });

    it("should handle failed authentication", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "GET",
        headers: {
          authorization: "Bearer invalid-key",
        },
      });

      const authResult = {
        success: false,
        error: "Invalid API key",
      };

      const entry = audit.createEntry(req, authResult);

      expect(entry.auth.success).toBe(false);
      expect(entry.auth.error).toBe("Invalid API key");
      expect(entry.auth.keyName).toBeUndefined();
    });

    it("should capture query parameters", () => {
      const req = new Request(
        "http://localhost:3001/jobs?status=running&type=notion:fetch",
        {
          method: "GET",
        }
      );

      const authResult = {
        success: true,
        meta: { name: "test-key", active: true, createdAt: new Date() },
      };
      const entry = audit.createEntry(req, authResult);

      expect(entry.query).toBe("?status=running&type=notion:fetch");
    });
  });

  describe("Audit Logging", () => {
    it("should log successful requests", async () => {
      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });

      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };
      const entry = audit.createEntry(req, authResult);

      audit.logSuccess(entry, 200, 45);
      await audit.waitForPendingWrites();

      // Verify log file was created
      const logPath = audit.getLogPath();
      expect(existsSync(logPath)).toBe(true);

      // Read and verify log contents
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.id).toBe(entry.id);
      expect(logEntry.statusCode).toBe(200);
      expect(logEntry.responseTime).toBe(45);
    });

    it("should log failed requests", async () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
      });

      const authResult = {
        success: true,
        meta: { name: "test-key", active: true, createdAt: new Date() },
      };
      const entry = audit.createEntry(req, authResult);

      audit.logFailure(entry, 400, "Invalid job type");
      await audit.waitForPendingWrites();

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.statusCode).toBe(400);
      expect(logEntry.errorMessage).toBe("Invalid job type");
    });

    it("should log authentication failures", async () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "GET",
        headers: {
          authorization: "Bearer invalid-key",
        },
      });

      const authResult = {
        success: false as const,
        error: "Invalid API key",
      };

      audit.logAuthFailure(req, authResult);
      await audit.waitForPendingWrites();

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.statusCode).toBe(401);
      expect(logEntry.auth.error).toBe("Invalid API key");
    });

    it("should append multiple log entries", async () => {
      const req1 = new Request("http://localhost:3001/health", {
        method: "GET",
      });
      const authResult1 = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      const req2 = new Request("http://localhost:3001/jobs", {
        method: "GET",
      });
      const authResult2 = {
        success: true,
        meta: { name: "test-key", active: true, createdAt: new Date() },
      };

      audit.logSuccess(audit.createEntry(req1, authResult1), 200, 10);
      audit.logSuccess(audit.createEntry(req2, authResult2), 200, 15);
      await audit.waitForPendingWrites();

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const lines = logContents.trim().split("\n");

      expect(lines).toHaveLength(2);

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      expect(entry1.path).toBe("/health");
      expect(entry2.path).toBe("/jobs");
    });

    it("should clear logs", async () => {
      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });
      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      audit.logSuccess(audit.createEntry(req, authResult), 200, 10);
      await audit.waitForPendingWrites();

      let logContents = readFileSync(audit.getLogPath(), "utf-8");
      expect(logContents.trim()).toBeTruthy();

      audit.clearLogs();

      logContents = readFileSync(audit.getLogPath(), "utf-8");
      expect(logContents.trim()).toBe("");
    });
  });

  describe("Configuration", () => {
    it("should use custom log directory", () => {
      AuditLogger["instance"] = undefined;
      const customAudit = new AuditLogger({
        logDir: join(logDir, "custom"),
        logFile: "custom.log",
      });

      const logPath = customAudit.getLogPath();
      expect(logPath).toContain("custom");
      expect(logPath).toContain("custom.log");
    });

    it("should handle log write errors gracefully", async () => {
      // Test that logSuccess/logFailure don't throw errors
      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });
      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      // These should not throw even if there are fs issues
      expect(() => {
        audit.logSuccess(audit.createEntry(req, authResult), 200, 10);
        audit.logFailure(
          audit.createEntry(req, authResult),
          400,
          "Bad request"
        );
      }).not.toThrow();

      await audit.waitForPendingWrites();

      // Verify logs were created successfully
      const logPath = audit.getLogPath();
      expect(existsSync(logPath)).toBe(true);
    });
  });

  describe("Singleton", () => {
    it("should return the same instance", () => {
      const instance1 = getAudit();
      const instance2 = getAudit();

      expect(instance1).toBe(instance2);
    });

    it("should configure singleton", () => {
      configureAudit({
        logDir: join(logDir, "configured"),
        logFile: "configured.log",
      });

      const instance = getAudit();
      const logPath = instance.getLogPath();

      expect(logPath).toContain("configured");
      expect(logPath).toContain("configured.log");

      // Reset to default config
      configureAudit({
        logDir: ".audit-data",
        logFile: "audit.log",
      });
    });
  });

  describe("Entry ID Generation", () => {
    it("should generate unique IDs", () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const req = new Request("http://localhost:3001/health", {
          method: "GET",
        });
        const authResult = {
          success: true,
          meta: { name: "public", active: true, createdAt: new Date() },
        };
        const entry = audit.createEntry(req, authResult);
        ids.add(entry.id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });

    it("should generate valid ID format", () => {
      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });
      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };
      const entry = audit.createEntry(req, authResult);

      expect(entry.id).toMatch(/^audit_[a-z0-9_]+$/);
    });
  });

  describe("withAudit wrapper", () => {
    beforeEach(() => {
      // Clear singleton and clean up logs before each test
      AuditLogger["instance"] = undefined;
      // Configure with test settings
      configureAudit({
        logDir,
        logFile: "test-audit.log",
        logBodies: false,
        logHeaders: false,
      });
      // Ensure clean log file
      getAudit().clearLogs();
    });

    it("should log successful requests", async () => {
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: {
            success: boolean;
            meta?: { name: string; active: boolean; createdAt: Date };
          }
        ) => {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      );

      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });

      const authResult = {
        success: true,
        meta: { name: "test", active: true, createdAt: new Date() },
      };

      const response = await wrappedHandler(req, authResult);
      expect(response.status).toBe(200);
      await getAudit().waitForPendingWrites();

      // Verify audit log was written
      const logPath = getAudit().getLogPath();
      expect(existsSync(logPath)).toBe(true);

      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.method).toBe("GET");
      expect(logEntry.path).toBe("/health");
      expect(logEntry.statusCode).toBe(200);
      expect(logEntry.responseTime).toBeGreaterThanOrEqual(0);
    });

    it("should log failed requests", async () => {
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: {
            success: boolean;
            meta?: { name: string; active: boolean; createdAt: Date };
          }
        ) => {
          throw new Error("Handler error");
        }
      );

      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
      });

      const authResult = {
        success: true,
        meta: { name: "test", active: true, createdAt: new Date() },
      };

      await expect(wrappedHandler(req, authResult)).rejects.toThrow(
        "Handler error"
      );
      await getAudit().waitForPendingWrites();

      // Verify audit log was written with failure info
      const logPath = getAudit().getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.statusCode).toBe(500);
      expect(logEntry.errorMessage).toBe("Handler error");
    });

    it("should track response time", async () => {
      let handlerDelay = 0;
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: {
            success: boolean;
            meta?: { name: string; active: boolean; createdAt: Date };
          }
        ) => {
          // Simulate some processing time
          await new Promise((resolve) => setTimeout(resolve, 50));
          handlerDelay = 50;
          return new Response(JSON.stringify({ processed: true }), {
            status: 200,
          });
        }
      );

      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });

      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      const startTime = Date.now();
      await wrappedHandler(req, authResult);
      const endTime = Date.now();
      await getAudit().waitForPendingWrites();

      // Verify audit log contains response time
      const logPath = getAudit().getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.responseTime).toBeGreaterThanOrEqual(handlerDelay);
      expect(logEntry.responseTime).toBeLessThanOrEqual(
        endTime - startTime + 10 // Add small buffer for timing variations
      );
    });

    it("should create audit entry with correct auth info", async () => {
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: {
            success: boolean;
            meta?: { name: string; active: boolean; createdAt: Date };
          }
        ) => {
          return new Response(JSON.stringify({ authenticated: true }), {
            status: 200,
          });
        }
      );

      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          "x-forwarded-for": "10.0.0.1",
          "user-agent": "test-client/1.0",
        },
      });

      const authResult = {
        success: true,
        meta: {
          name: "api-key-1",
          active: true,
          createdAt: new Date(),
        },
      };

      await wrappedHandler(req, authResult);
      await getAudit().waitForPendingWrites();

      // Verify audit entry has correct auth info
      const logPath = getAudit().getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(true);
      expect(logEntry.auth.keyName).toBe("api-key-1");
      expect(logEntry.clientIp).toBe("10.0.0.1");
      expect(logEntry.userAgent).toBe("test-client/1.0");
    });

    it("should handle failed authentication in audit entry", async () => {
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: { success: boolean; error?: string }
        ) => {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
          });
        }
      );

      const req = new Request("http://localhost:3001/jobs", {
        method: "GET",
      });

      const authResult = {
        success: false,
        error: "Invalid API key",
      };

      await wrappedHandler(req, authResult);
      await getAudit().waitForPendingWrites();

      // Verify audit entry has auth failure info
      const logPath = getAudit().getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.auth.error).toBe("Invalid API key");
      expect(logEntry.auth.keyName).toBeUndefined();
    });

    it("should capture query parameters in audit entry", async () => {
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: {
            success: boolean;
            meta?: { name: string; active: boolean; createdAt: Date };
          }
        ) => {
          return new Response(JSON.stringify({ jobs: [] }), { status: 200 });
        }
      );

      const req = new Request(
        "http://localhost:3001/jobs?status=running&type=notion:fetch",
        { method: "GET" }
      );

      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      await wrappedHandler(req, authResult);
      await getAudit().waitForPendingWrites();

      // Verify query params are captured
      const logPath = getAudit().getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.query).toBe("?status=running&type=notion:fetch");
    });

    it("should append multiple entries for multiple requests", async () => {
      const wrappedHandler = withAudit(
        async (
          req: Request,
          authResult: {
            success: boolean;
            meta?: { name: string; active: boolean; createdAt: Date };
          }
        ) => {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      );

      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      // Make multiple requests
      await wrappedHandler(
        new Request("http://localhost:3001/health", { method: "GET" }),
        authResult
      );
      await wrappedHandler(
        new Request("http://localhost:3001/jobs", { method: "GET" }),
        authResult
      );
      await wrappedHandler(
        new Request("http://localhost:3001/jobs/types", { method: "GET" }),
        authResult
      );
      await getAudit().waitForPendingWrites();

      // Verify multiple log entries
      const logPath = getAudit().getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const lines = logContents.trim().split("\n");

      expect(lines).toHaveLength(3);

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);
      const entry3 = JSON.parse(lines[2]);

      expect(entry1.path).toBe("/health");
      expect(entry2.path).toBe("/jobs");
      expect(entry3.path).toBe("/jobs/types");
    });
  });

  describe("validateAuditEntry", () => {
    it("should validate a correct audit entry with successful auth", () => {
      const validEntry = {
        id: "audit_abc123_def",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        query: undefined,
        clientIp: "127.0.0.1",
        userAgent: "test-agent",
        auth: {
          success: true,
          keyName: "test-key",
          error: undefined,
        },
        requestId: "req_xyz",
        statusCode: 200,
        responseTime: 45,
      };

      const result = validateAuditEntry(validEntry);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate a correct audit entry with failed auth", () => {
      const validEntry = {
        id: "audit_abc123_ghi",
        timestamp: new Date().toISOString(),
        method: "POST",
        path: "/jobs",
        clientIp: "192.168.1.1",
        userAgent: undefined,
        auth: {
          success: false,
          error: "Invalid API key",
        },
        statusCode: 401,
        errorMessage: "Authentication failed",
      };

      const result = validateAuditEntry(validEntry);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject entry with invalid id format", () => {
      const invalidEntry = {
        id: "not-an-audit-id",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: true, keyName: "test" },
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid id: expected format 'audit_*'")
      );
    });

    it("should reject entry with invalid timestamp", () => {
      const invalidEntry = {
        id: "audit_abc123_def",
        timestamp: "not-a-date",
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: true, keyName: "test" },
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Invalid timestamp: not a valid ISO date string"
        )
      );
    });

    it("should reject entry with failed auth but no error message", () => {
      const invalidEntry = {
        id: "audit_abc123_def",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: false },
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid auth.error: expected non-empty string")
      );
    });

    it("should reject entry with successful auth but no keyName", () => {
      const invalidEntry = {
        id: "audit_abc123_def",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: true },
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Invalid auth.keyName: expected non-empty string"
        )
      );
    });

    it("should reject entry with invalid statusCode", () => {
      const invalidEntry = {
        id: "audit_abc123_def",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: true, keyName: "test" },
        statusCode: 999,
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Invalid statusCode: expected number between 100-599"
        )
      );
    });

    it("should reject entry with negative responseTime", () => {
      const invalidEntry = {
        id: "audit_abc123_def",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: true, keyName: "test" },
        responseTime: -10,
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Invalid responseTime: expected non-negative number"
        )
      );
    });

    it("should reject non-object entry", () => {
      const result = validateAuditEntry(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual("Audit entry must be an object");
    });

    it("should reject entry with invalid query type", () => {
      const invalidEntry = {
        id: "audit_abc123_def",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/health",
        clientIp: "127.0.0.1",
        auth: { success: true, keyName: "test" },
        query: 123, // Should be string or undefined
      };

      const result = validateAuditEntry(invalidEntry);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid query: expected string or undefined")
      );
    });

    it("should validate entry created from actual request", () => {
      const req = new Request("http://localhost:3001/jobs?type=fetch", {
        method: "GET",
        headers: {
          "user-agent": "test-client/1.0",
          "x-forwarded-for": "10.0.0.1",
        },
      });

      const authResult = {
        success: true,
        meta: { name: "test-key", active: true, createdAt: new Date() },
      };

      const entry = audit.createEntry(req, authResult);
      const result = validateAuditEntry(entry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate entry created from failed auth request", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
        headers: {
          authorization: "Bearer invalid-key",
        },
      });

      const authResult = {
        success: false as const,
        error: "Invalid API key",
      };

      const entry = audit.createEntry(req, authResult);
      const result = validateAuditEntry(entry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("validateAuthResult", () => {
    it("should validate a successful auth result", () => {
      const validAuthResult = {
        success: true,
        meta: {
          name: "test-key",
          description: "Test API key",
          active: true,
          createdAt: new Date().toISOString(),
        },
      };

      const result = validateAuthResult(validAuthResult);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate a failed auth result", () => {
      const validAuthResult = {
        success: false,
        error: "Missing Authorization header",
      };

      const result = validateAuthResult(validAuthResult);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject failed auth with empty error message", () => {
      const invalidAuthResult = {
        success: false,
        error: "",
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid error: expected non-empty string")
      );
    });

    it("should reject failed auth with missing error field", () => {
      const invalidAuthResult = {
        success: false,
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid error: expected non-empty string")
      );
    });

    it("should reject successful auth with missing meta", () => {
      const invalidAuthResult = {
        success: true,
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Invalid meta: expected object when success is true"
        )
      );
    });

    it("should reject successful auth with invalid meta.name", () => {
      const invalidAuthResult = {
        success: true,
        meta: {
          name: "",
          active: true,
          createdAt: new Date().toISOString(),
        },
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid meta.name: expected non-empty string")
      );
    });

    it("should reject successful auth with invalid meta.active", () => {
      const invalidAuthResult = {
        success: true,
        meta: {
          name: "test",
          active: "true" as unknown as boolean,
          createdAt: new Date().toISOString(),
        },
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Invalid meta.active: expected boolean")
      );
    });

    it("should reject successful auth with invalid meta.createdAt", () => {
      const invalidAuthResult = {
        success: true,
        meta: {
          name: "test",
          active: true,
          createdAt: "not-a-date",
        },
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Invalid meta.createdAt: expected valid Date or ISO date string"
        )
      );
    });

    it("should reject successful auth that has error field", () => {
      const invalidAuthResult = {
        success: true,
        error: "Should not have error when successful",
        meta: {
          name: "test",
          active: true,
          createdAt: new Date().toISOString(),
        },
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Unexpected error field: should not be present when success is true"
        )
      );
    });

    it("should reject failed auth that has meta field", () => {
      const invalidAuthResult = {
        success: false,
        error: "Invalid credentials",
        meta: {
          name: "test",
          active: true,
          createdAt: new Date().toISOString(),
        },
      };

      const result = validateAuthResult(invalidAuthResult);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining(
          "Unexpected meta field: should not be present when success is false"
        )
      );
    });

    it("should reject non-object auth result", () => {
      const result = validateAuthResult(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual("Auth result must be an object");
    });

    it("should validate actual auth result from requireAuth", () => {
      // Setup test key
      const auth = getAuthModule();
      auth.clearKeys();
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
        createdAt: new Date(),
      });

      const authResult = requireAuth("Bearer valid-key-123456789012");
      const validationResult = validateAuthResult(authResult);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);

      // Clean up
      auth.clearKeys();
    });

    it("should validate actual failed auth result from requireAuth", () => {
      // Setup test key
      const auth = getAuthModule();
      auth.clearKeys();
      auth.addKey("test", "valid-key-123456789012", {
        name: "test",
        active: true,
        createdAt: new Date(),
      });

      const authResult = requireAuth("Bearer invalid-key");
      const validationResult = validateAuthResult(authResult);

      expect(validationResult.valid).toBe(true);
      expect(validationResult.errors).toHaveLength(0);
      expect(authResult.success).toBe(false);
      expect(authResult.error).toBeDefined();

      // Clean up
      auth.clearKeys();
    });
  });
});
