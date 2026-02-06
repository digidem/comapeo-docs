/**
 * Audit Logging Module Tests
 *
 * Tests for request audit logging functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AuditLogger, getAudit, configureAudit } from "./audit";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    it("should log successful requests", () => {
      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });

      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };
      const entry = audit.createEntry(req, authResult);

      audit.logSuccess(entry, 200, 45);

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

    it("should log failed requests", () => {
      const req = new Request("http://localhost:3001/jobs", {
        method: "POST",
      });

      const authResult = {
        success: true,
        meta: { name: "test-key", active: true, createdAt: new Date() },
      };
      const entry = audit.createEntry(req, authResult);

      audit.logFailure(entry, 400, "Invalid job type");

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.statusCode).toBe(400);
      expect(logEntry.errorMessage).toBe("Invalid job type");
    });

    it("should log authentication failures", () => {
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

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const logEntry = JSON.parse(logContents.trim());

      expect(logEntry.auth.success).toBe(false);
      expect(logEntry.statusCode).toBe(401);
      expect(logEntry.auth.error).toBe("Invalid API key");
    });

    it("should append multiple log entries", () => {
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

      const logPath = audit.getLogPath();
      const logContents = readFileSync(logPath, "utf-8");
      const lines = logContents.trim().split("\n");

      expect(lines).toHaveLength(2);

      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      expect(entry1.path).toBe("/health");
      expect(entry2.path).toBe("/jobs");
    });

    it("should clear logs", () => {
      const req = new Request("http://localhost:3001/health", {
        method: "GET",
      });
      const authResult = {
        success: true,
        meta: { name: "public", active: true, createdAt: new Date() },
      };

      audit.logSuccess(audit.createEntry(req, authResult), 200, 10);

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

    it("should handle log write errors gracefully", () => {
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
});
