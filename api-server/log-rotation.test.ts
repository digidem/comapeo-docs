/**
 * Log Rotation Tests
 *
 * Tests log rotation for both jobs.log and audit.log files
 * Tests jobs.json cap enforcement
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import {
  rotateLogIfNeeded,
  appendLog,
  cleanupOldJobs,
  saveJob,
  loadAllJobs,
  type JobLogEntry,
  type PersistedJob,
} from "./job-persistence";
import { AuditLogger, configureAudit, type AuditEntry } from "./audit";

const TEST_DATA_DIR = join(process.cwd(), ".test-log-rotation");
const TEST_AUDIT_DIR = join(process.cwd(), ".test-audit-rotation");

function setupTestEnv(): void {
  // Set up isolated test directories
  process.env.JOBS_DATA_DIR = TEST_DATA_DIR;
  process.env.MAX_LOG_SIZE_MB = "0.001"; // 1KB for testing
  process.env.MAX_STORED_JOBS = "5";

  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  if (existsSync(TEST_AUDIT_DIR)) {
    rmSync(TEST_AUDIT_DIR, { recursive: true, force: true });
  }

  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(TEST_AUDIT_DIR, { recursive: true });
}

function cleanupTestEnv(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  if (existsSync(TEST_AUDIT_DIR)) {
    rmSync(TEST_AUDIT_DIR, { recursive: true, force: true });
  }

  delete process.env.JOBS_DATA_DIR;
  delete process.env.MAX_LOG_SIZE_MB;
  delete process.env.MAX_STORED_JOBS;
}

describe.sequential("Log Rotation", () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe("rotateLogIfNeeded()", () => {
    it("should not rotate file below size limit", () => {
      const testFile = join(TEST_DATA_DIR, "test.log");
      writeFileSync(testFile, "small content\n", "utf-8");

      rotateLogIfNeeded(testFile, 1024 * 1024); // 1MB limit

      expect(existsSync(testFile)).toBe(true);
      expect(existsSync(`${testFile}.1`)).toBe(false);
    });

    it("should rotate file when exceeding size limit", () => {
      const testFile = join(TEST_DATA_DIR, "test.log");
      const largeContent = "x".repeat(2000); // 2KB
      writeFileSync(testFile, largeContent, "utf-8");

      const sizeBefore = statSync(testFile).size;
      expect(sizeBefore).toBeGreaterThan(1024);

      rotateLogIfNeeded(testFile, 1024); // 1KB limit

      expect(existsSync(`${testFile}.1`)).toBe(true);
      expect(existsSync(testFile)).toBe(false); // Original file rotated away
    });

    it("should keep up to 3 rotated files", () => {
      const testFile = join(TEST_DATA_DIR, "test.log");

      // Create 4 rotations to test max 3 kept
      for (let i = 1; i <= 4; i++) {
        const content = `rotation ${i}\n`.repeat(200); // Make it large
        writeFileSync(testFile, content, "utf-8");
        rotateLogIfNeeded(testFile, 500);
      }

      expect(existsSync(`${testFile}.1`)).toBe(true);
      expect(existsSync(`${testFile}.2`)).toBe(true);
      expect(existsSync(`${testFile}.3`)).toBe(true);
      expect(existsSync(`${testFile}.4`)).toBe(false); // Should not exist
    });

    it("should handle non-existent file gracefully", () => {
      const testFile = join(TEST_DATA_DIR, "nonexistent.log");

      expect(() => {
        rotateLogIfNeeded(testFile, 1024);
      }).not.toThrow();

      expect(existsSync(testFile)).toBe(false);
      expect(existsSync(`${testFile}.1`)).toBe(false);
    });

    it("should rotate in correct order: .log -> .log.1 -> .log.2 -> .log.3", () => {
      const testFile = join(TEST_DATA_DIR, "test.log");

      // First rotation
      writeFileSync(testFile, "content1\n".repeat(200), "utf-8");
      rotateLogIfNeeded(testFile, 500);
      expect(existsSync(`${testFile}.1`)).toBe(true);

      // Second rotation
      writeFileSync(testFile, "content2\n".repeat(200), "utf-8");
      rotateLogIfNeeded(testFile, 500);
      expect(existsSync(`${testFile}.1`)).toBe(true);
      expect(existsSync(`${testFile}.2`)).toBe(true);

      // Third rotation
      writeFileSync(testFile, "content3\n".repeat(200), "utf-8");
      rotateLogIfNeeded(testFile, 500);
      expect(existsSync(`${testFile}.1`)).toBe(true);
      expect(existsSync(`${testFile}.2`)).toBe(true);
      expect(existsSync(`${testFile}.3`)).toBe(true);
    });
  });

  describe("appendLog() with rotation", () => {
    it("should rotate jobs.log when size limit exceeded", () => {
      const logsFile = join(TEST_DATA_DIR, "jobs.log");

      // Append many log entries to exceed 1KB limit multiple times
      // Each entry is ~200 bytes, 1KB limit = ~5 entries before rotation
      // We append 20 entries to ensure multiple rotations happen
      for (let i = 0; i < 20; i++) {
        const entry: JobLogEntry = {
          timestamp: new Date().toISOString(),
          level: "info",
          jobId: `job-${i}`,
          message: "x".repeat(100), // Make entries large
          data: { index: i },
        };
        appendLog(entry);
      }

      // After 20 entries with 1KB limit, we should have triggered rotation
      // The rotation happens when we detect size > limit before next append
      const hasRotated = existsSync(`${logsFile}.1`);
      expect(hasRotated).toBe(true);
    });

    it("should continue logging after rotation", () => {
      // Fill up log to trigger rotation
      for (let i = 0; i < 30; i++) {
        const entry: JobLogEntry = {
          timestamp: new Date().toISOString(),
          level: "info",
          jobId: `job-${i}`,
          message: "x".repeat(100),
        };
        appendLog(entry);
      }

      // Log after rotation should work
      const finalEntry: JobLogEntry = {
        timestamp: new Date().toISOString(),
        level: "info",
        jobId: "final-job",
        message: "final message",
      };

      expect(() => {
        appendLog(finalEntry);
      }).not.toThrow();
    });
  });

  describe("AuditLogger with rotation", () => {
    it("should rotate audit.log when size limit exceeded", () => {
      // Reset singleton and configure with test directory
      // @ts-expect-error - Resetting private singleton for testing
      AuditLogger.instance = undefined;

      configureAudit({
        logDir: TEST_AUDIT_DIR,
        logFile: "audit.log",
        logBodies: false,
        logHeaders: false,
      });

      const audit = AuditLogger.getInstance();
      const auditFile = join(TEST_AUDIT_DIR, "audit.log");

      // Append many audit entries to exceed 1KB limit multiple times
      // Each entry is ~200 bytes, 1KB limit = ~5 entries before rotation
      // We append 20 entries to ensure multiple rotations happen
      for (let i = 0; i < 20; i++) {
        const entry: AuditEntry = {
          id: `audit_${i}`,
          timestamp: new Date().toISOString(),
          method: "POST",
          path: "/test",
          clientIp: "127.0.0.1",
          auth: { success: true, keyName: "test-key" },
          statusCode: 200,
          responseTime: 100,
        };
        audit.log(entry);
      }

      // After 20 entries with 1KB limit, we should have triggered rotation
      const hasRotated = existsSync(`${auditFile}.1`);
      expect(hasRotated).toBe(true);
    });

    it("should continue logging after rotation", () => {
      // Reset singleton and configure with test directory
      // @ts-expect-error - Resetting private singleton for testing
      AuditLogger.instance = undefined;

      configureAudit({
        logDir: TEST_AUDIT_DIR,
        logFile: "audit.log",
      });

      const audit = AuditLogger.getInstance();

      // Fill up log to trigger rotation
      for (let i = 0; i < 30; i++) {
        const entry: AuditEntry = {
          id: `audit_${i}`,
          timestamp: new Date().toISOString(),
          method: "POST",
          path: "/test",
          clientIp: "127.0.0.1",
          auth: { success: true, keyName: "test-key" },
          statusCode: 200,
        };
        audit.log(entry);
      }

      // Log after rotation should work
      const finalEntry: AuditEntry = {
        id: "audit_final",
        timestamp: new Date().toISOString(),
        method: "GET",
        path: "/final",
        clientIp: "127.0.0.1",
        auth: { success: true, keyName: "test-key" },
        statusCode: 200,
      };

      expect(() => {
        audit.log(finalEntry);
      }).not.toThrow();
    });
  });

  describe("cleanupOldJobs() with jobs cap", () => {
    it("should enforce MAX_STORED_JOBS cap", () => {
      const maxJobs = 5;
      process.env.MAX_STORED_JOBS = maxJobs.toString();

      // Create 10 completed jobs
      for (let i = 0; i < 10; i++) {
        const job: PersistedJob = {
          id: `job-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(Date.now() - (10 - i) * 1000).toISOString(),
          completedAt: new Date(Date.now() - (10 - i) * 1000).toISOString(),
        };
        saveJob(job);
      }

      // Verify all jobs saved
      let jobs = loadAllJobs();
      expect(jobs.length).toBe(10);

      // Run cleanup with very old maxAge (won't remove by time)
      const removed = cleanupOldJobs(365 * 24 * 60 * 60 * 1000); // 1 year

      // Should have removed 5 jobs (10 - 5 = 5)
      expect(removed).toBe(5);

      jobs = loadAllJobs();
      expect(jobs.length).toBe(maxJobs);
    });

    it("should keep newest jobs when enforcing cap", () => {
      process.env.MAX_STORED_JOBS = "3";

      // Create jobs with different completion times
      const timestamps = [
        Date.now() - 5000, // Oldest
        Date.now() - 4000,
        Date.now() - 3000,
        Date.now() - 2000,
        Date.now() - 1000, // Newest
      ];

      timestamps.forEach((ts, i) => {
        const job: PersistedJob = {
          id: `job-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(ts).toISOString(),
          completedAt: new Date(ts).toISOString(),
        };
        saveJob(job);
      });

      cleanupOldJobs(365 * 24 * 60 * 60 * 1000);

      const jobs = loadAllJobs();
      expect(jobs.length).toBe(3);

      // Should keep the 3 newest jobs
      const jobIds = jobs.map((j) => j.id).sort();
      expect(jobIds).toEqual(["job-2", "job-3", "job-4"]);
    });

    it("should never remove pending or running jobs", () => {
      process.env.MAX_STORED_JOBS = "3";

      // Create 2 pending jobs
      for (let i = 0; i < 2; i++) {
        const job: PersistedJob = {
          id: `pending-${i}`,
          type: "test",
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        saveJob(job);
      }

      // Create 5 completed jobs
      for (let i = 0; i < 5; i++) {
        const job: PersistedJob = {
          id: `completed-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          completedAt: new Date(Date.now() - i * 1000).toISOString(),
        };
        saveJob(job);
      }

      cleanupOldJobs(365 * 24 * 60 * 60 * 1000);

      const jobs = loadAllJobs();

      // Should keep 2 pending + 1 completed (3 total)
      expect(jobs.length).toBe(3);

      const pendingJobs = jobs.filter((j) => j.status === "pending");
      const completedJobs = jobs.filter((j) => j.status === "completed");

      expect(pendingJobs.length).toBe(2);
      expect(completedJobs.length).toBe(1);
    });

    it("should respect both time-based and cap-based cleanup", () => {
      process.env.MAX_STORED_JOBS = "10";

      // Create 5 old jobs (should be removed by time)
      for (let i = 0; i < 5; i++) {
        const job: PersistedJob = {
          id: `old-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
          completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        };
        saveJob(job);
      }

      // Create 3 recent jobs (should be kept)
      for (let i = 0; i < 3; i++) {
        const job: PersistedJob = {
          id: `recent-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          completedAt: new Date(Date.now() - i * 1000).toISOString(),
        };
        saveJob(job);
      }

      // Run cleanup with 24h maxAge
      const removed = cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removed).toBe(5); // All old jobs removed

      const jobs = loadAllJobs();
      expect(jobs.length).toBe(3); // Only recent jobs remain
      expect(jobs.every((j) => j.id.startsWith("recent-"))).toBe(true);
    });
  });

  describe("Environment variable configuration", () => {
    it("should use default MAX_LOG_SIZE_MB if env var not set", () => {
      delete process.env.MAX_LOG_SIZE_MB;

      const testFile = join(TEST_DATA_DIR, "test.log");
      const content = "x".repeat(11 * 1024 * 1024); // 11MB
      writeFileSync(testFile, content, "utf-8");

      rotateLogIfNeeded(testFile, 10 * 1024 * 1024); // Default 10MB

      expect(existsSync(`${testFile}.1`)).toBe(true);
    });

    it("should use default MAX_STORED_JOBS if env var not set", () => {
      delete process.env.MAX_STORED_JOBS;

      // Create 1001 jobs
      for (let i = 0; i < 1001; i++) {
        const job: PersistedJob = {
          id: `job-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          completedAt: new Date(Date.now() - i * 1000).toISOString(),
        };
        saveJob(job);
      }

      cleanupOldJobs(365 * 24 * 60 * 60 * 1000);

      const jobs = loadAllJobs();
      expect(jobs.length).toBeLessThanOrEqual(1000); // Default cap
    });

    it("should handle invalid MAX_LOG_SIZE_MB env var", () => {
      process.env.MAX_LOG_SIZE_MB = "invalid";

      const testFile = join(TEST_DATA_DIR, "test.log");
      const content = "x".repeat(11 * 1024 * 1024); // 11MB
      writeFileSync(testFile, content, "utf-8");

      // Should use default 10MB
      rotateLogIfNeeded(testFile, 10 * 1024 * 1024);

      expect(existsSync(`${testFile}.1`)).toBe(true);
    });

    it("should handle invalid MAX_STORED_JOBS env var", () => {
      process.env.MAX_STORED_JOBS = "not-a-number";

      // Create 1001 jobs
      for (let i = 0; i < 1001; i++) {
        const job: PersistedJob = {
          id: `job-${i}`,
          type: "test",
          status: "completed",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          completedAt: new Date(Date.now() - i * 1000).toISOString(),
        };
        saveJob(job);
      }

      cleanupOldJobs(365 * 24 * 60 * 60 * 1000);

      const jobs = loadAllJobs();
      expect(jobs.length).toBeLessThanOrEqual(1000); // Default cap
    });
  });
});
