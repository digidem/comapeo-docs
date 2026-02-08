/**
 * Tests for job persistence and log capture
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveJob,
  loadJob,
  loadAllJobs,
  deleteJob,
  createJobLogger,
  getJobLogs,
  getRecentLogs,
  cleanupOldJobs,
  type PersistedJob,
  type JobLogEntry,
} from "./job-persistence";
import {
  existsSync,
  unlinkSync,
  rmdirSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".jobs-data");
const JOBS_FILE = join(DATA_DIR, "jobs.json");
const LOGS_FILE = join(DATA_DIR, "jobs.log");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    try {
      // Use rmSync with recursive option if available (Node.js v14.14+)
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Fallback to manual removal
      if (existsSync(LOGS_FILE)) {
        unlinkSync(LOGS_FILE);
      }
      if (existsSync(JOBS_FILE)) {
        unlinkSync(JOBS_FILE);
      }
      try {
        rmdirSync(DATA_DIR);
      } catch {
        // Ignore error if directory still has files
      }
    }
  }
}

// Run tests sequentially to avoid file system race conditions
describe("job-persistence", () => {
  beforeEach(() => {
    // Clean up before each test to ensure isolation
    cleanupTestData();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupTestData();
  });

  describe("saveJob and loadJob", () => {
    it("should save and load a job", () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);

      const loaded = loadJob(job.id);
      expect(loaded).toEqual(job);
    });

    it("should update an existing job", () => {
      const job: PersistedJob = {
        id: "test-job-2",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);

      // Update the job
      const updatedJob: PersistedJob = {
        ...job,
        status: "completed",
        completedAt: new Date().toISOString(),
        result: { success: true, output: "test output" },
      };

      saveJob(updatedJob);

      const loaded = loadJob(job.id);
      expect(loaded).toEqual(updatedJob);
      expect(loaded?.status).toBe("completed");
      expect(loaded?.result?.success).toBe(true);
    });

    it("should return undefined for non-existent job", () => {
      const loaded = loadJob("non-existent-job");
      expect(loaded).toBeUndefined();
    });

    it("should save multiple jobs", () => {
      const job1: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const job2: PersistedJob = {
        id: "test-job-2",
        type: "notion:fetch-all",
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: { success: true },
      };

      saveJob(job1);
      saveJob(job2);

      const loaded1 = loadJob(job1.id);
      const loaded2 = loadJob(job2.id);

      expect(loaded1).toEqual(job1);
      expect(loaded2).toEqual(job2);
    });
  });

  describe("loadAllJobs", () => {
    it("should return empty array when no jobs exist", () => {
      const jobs = loadAllJobs();
      expect(jobs).toEqual([]);
    });

    it("should return all saved jobs", () => {
      const job1: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const job2: PersistedJob = {
        id: "test-job-2",
        type: "notion:fetch-all",
        status: "completed",
        createdAt: new Date().toISOString(),
      };

      saveJob(job1);
      saveJob(job2);

      const jobs = loadAllJobs();
      expect(jobs).toHaveLength(2);
      expect(jobs).toContainEqual(job1);
      expect(jobs).toContainEqual(job2);
    });
  });

  describe("deleteJob", () => {
    it("should delete a job", () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);
      expect(loadJob(job.id)).toBeDefined();

      const deleted = deleteJob(job.id);
      expect(deleted).toBe(true);
      expect(loadJob(job.id)).toBeUndefined();
    });

    it("should return false when deleting non-existent job", () => {
      const deleted = deleteJob("non-existent-job");
      expect(deleted).toBe(false);
    });

    it("should only delete the specified job", () => {
      const job1: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const job2: PersistedJob = {
        id: "test-job-2",
        type: "notion:fetch-all",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job1);
      saveJob(job2);

      deleteJob(job1.id);

      expect(loadJob(job1.id)).toBeUndefined();
      expect(loadJob(job2.id)).toBeDefined();
    });
  });

  describe("createJobLogger", () => {
    it("should create a logger with all log methods", () => {
      const logger = createJobLogger("test-job-1");

      expect(logger).toHaveProperty("info");
      expect(logger).toHaveProperty("warn");
      expect(logger).toHaveProperty("error");
      expect(logger).toHaveProperty("debug");

      expect(typeof logger.info).toBe("function");
      expect(typeof logger.warn).toBe("function");
      expect(typeof logger.error).toBe("function");
      expect(typeof logger.debug).toBe("function");
    });

    it("should log info messages", () => {
      const logger = createJobLogger("test-job-1");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger.info("Test info message", { data: "test" });

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should log warn messages", () => {
      const logger = createJobLogger("test-job-1");
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      logger.warn("Test warn message");

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should log error messages", () => {
      const logger = createJobLogger("test-job-1");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      logger.error("Test error message", { error: "test error" });

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should not log debug messages when DEBUG is not set", () => {
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;

      const logger = createJobLogger("test-job-1");
      const consoleSpy = vi
        .spyOn(console, "debug")
        .mockImplementation(() => {});

      logger.debug("Test debug message");

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      if (originalDebug) {
        process.env.DEBUG = originalDebug;
      }
    });

    it("should log debug messages when DEBUG is set", () => {
      process.env.DEBUG = "1";

      const logger = createJobLogger("test-job-1");
      const consoleSpy = vi
        .spyOn(console, "debug")
        .mockImplementation(() => {});

      logger.debug("Test debug message");

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      delete process.env.DEBUG;
    });
  });

  describe("getJobLogs", () => {
    beforeEach(() => {
      // Create some test logs
      const logger = createJobLogger("test-job-1");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger.info("Test info message 1");
      logger.warn("Test warn message");
      logger.error("Test error message");

      consoleSpy.mockRestore();
    });

    it("should return logs for a specific job", () => {
      const logs = getJobLogs("test-job-1");

      expect(logs.length).toBeGreaterThanOrEqual(3);

      const infoLogs = logs.filter((log) => log.level === "info");
      const warnLogs = logs.filter((log) => log.level === "warn");
      const errorLogs = logs.filter((log) => log.level === "error");

      expect(infoLogs.length).toBeGreaterThanOrEqual(1);
      expect(warnLogs.length).toBeGreaterThanOrEqual(1);
      expect(errorLogs.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty array for job with no logs", () => {
      const logs = getJobLogs("non-existent-job");
      expect(logs).toEqual([]);
    });

    it("should include job ID in each log entry", () => {
      const logs = getJobLogs("test-job-1");

      logs.forEach((log) => {
        expect(log.jobId).toBe("test-job-1");
      });
    });

    it("should include timestamp in each log entry", () => {
      const logs = getJobLogs("test-job-1");

      logs.forEach((log) => {
        expect(log.timestamp).toBeTruthy();
        expect(new Date(log.timestamp).toISOString()).toBe(log.timestamp);
      });
    });
  });

  describe("getRecentLogs", () => {
    beforeEach(() => {
      // Create some test logs for multiple jobs
      const logger1 = createJobLogger("test-job-1");
      const logger2 = createJobLogger("test-job-2");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger1.info("Job 1 message 1");
      logger1.info("Job 1 message 2");
      logger2.info("Job 2 message 1");
      logger1.warn("Job 1 warning");

      consoleSpy.mockRestore();
    });

    it("should return recent logs up to the limit", () => {
      const logs = getRecentLogs(2);

      expect(logs.length).toBeLessThanOrEqual(2);
    });

    it("should return all logs when limit is higher than actual count", () => {
      const logs = getRecentLogs(100);

      expect(logs.length).toBeGreaterThanOrEqual(4);
    });

    it("should return logs from all jobs", () => {
      const logs = getRecentLogs(100);

      const job1Logs = logs.filter((log) => log.jobId === "test-job-1");
      const job2Logs = logs.filter((log) => log.jobId === "test-job-2");

      expect(job1Logs.length).toBeGreaterThan(0);
      expect(job2Logs.length).toBeGreaterThan(0);
    });

    it("should return most recent logs when limit is specified", () => {
      const logs = getRecentLogs(2);

      // Logs should be in chronological order, so the last 2 are the most recent
      expect(logs.length).toBe(2);
    });
  });

  describe("cleanupOldJobs", () => {
    it("should remove old completed jobs", () => {
      // Create an old completed job
      const oldJob: PersistedJob = {
        id: "old-job",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        result: { success: true },
      };

      // Create a recent completed job
      const recentJob: PersistedJob = {
        id: "recent-job",
        type: "notion:fetch-all",
        status: "completed",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        result: { success: true },
      };

      saveJob(oldJob);
      saveJob(recentJob);

      // Clean up jobs older than 24 hours
      const removedCount = cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(1);
      expect(loadJob("old-job")).toBeUndefined();
      expect(loadJob("recent-job")).toBeDefined();
    });

    it("should keep pending jobs regardless of age", () => {
      const oldPendingJob: PersistedJob = {
        id: "old-pending-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
      };

      saveJob(oldPendingJob);

      const removedCount = cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
      expect(loadJob("old-pending-job")).toBeDefined();
    });

    it("should keep running jobs regardless of age", () => {
      const oldRunningJob: PersistedJob = {
        id: "old-running-job",
        type: "notion:fetch",
        status: "running",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        startedAt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(), // 47 hours ago
      };

      saveJob(oldRunningJob);

      const removedCount = cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
      expect(loadJob("old-running-job")).toBeDefined();
    });

    it("should remove old failed jobs", () => {
      const oldFailedJob: PersistedJob = {
        id: "old-failed-job",
        type: "notion:fetch",
        status: "failed",
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        completedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        result: { success: false, error: "Test error" },
      };

      saveJob(oldFailedJob);

      const removedCount = cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(1);
      expect(loadJob("old-failed-job")).toBeUndefined();
    });

    it("should return 0 when no jobs to clean up", () => {
      const recentJob: PersistedJob = {
        id: "recent-job",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: { success: true },
      };

      saveJob(recentJob);

      const removedCount = cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
    });
  });
});
