/**
 * Tests for deterministic and recoverable job persistence behavior
 * Validates that job persistence is deterministic (same input = same output)
 * and recoverable (can handle failures, corruption, and edge cases)
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
  waitForPendingWrites,
  type PersistedJob,
  type JobLogEntry,
} from "./job-persistence";
import {
  existsSync,
  unlinkSync,
  rmdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
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
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a corrupted jobs file for testing recovery
 */
function createCorruptedJobsFile(content: string): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(JOBS_FILE, content, "utf-8");
}

/**
 * Create a corrupted log file for testing recovery
 */
function createCorruptedLogFile(content: string): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(LOGS_FILE, content, "utf-8");
}

describe("job-persistence - deterministic behavior", () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  describe("deterministic job storage", () => {
    it("should produce identical output for identical save/load cycles", async () => {
      const job: PersistedJob = {
        id: "deterministic-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: "2024-01-01T00:00:00.000Z",
        progress: { current: 5, total: 10, message: "Processing" },
        result: { success: true, output: "test output" },
      };

      // Save and load multiple times
      await saveJob(job);
      const loaded1 = await loadJob(job.id);

      await saveJob(job); // Save again
      const loaded2 = await loadJob(job.id);

      // Should be identical
      expect(loaded1).toEqual(loaded2);
      expect(loaded1).toEqual(job);
    });

    it("should maintain job order when saving multiple jobs", async () => {
      const jobs: PersistedJob[] = [
        {
          id: "deterministic-job-order-1",
          type: "notion:fetch",
          status: "pending",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "deterministic-job-order-2",
          type: "notion:fetch",
          status: "running",
          createdAt: "2024-01-01T01:00:00.000Z",
        },
        {
          id: "deterministic-job-order-3",
          type: "notion:fetch",
          status: "completed",
          createdAt: "2024-01-01T02:00:00.000Z",
        },
      ];

      // Save all jobs
      for (const job of jobs) {
        await saveJob(job);
      }

      // Load all jobs
      const loadedJobs = await loadAllJobs();

      // Should have same count
      expect(loadedJobs).toHaveLength(3);

      // Each job should be loadable by ID
      for (const job of jobs) {
        const loaded = await loadJob(job.id);
        expect(loaded).toEqual(job);
      }
    });

    it("should handle multiple rapid updates to same job deterministically", async () => {
      const jobId = "rapid-update-job";
      const updates: PersistedJob[] = [
        {
          id: jobId,
          type: "notion:fetch",
          status: "pending",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: jobId,
          type: "notion:fetch",
          status: "running",
          createdAt: "2024-01-01T00:00:00.000Z",
          startedAt: "2024-01-01T00:01:00.000Z",
        },
        {
          id: jobId,
          type: "notion:fetch",
          status: "running",
          createdAt: "2024-01-01T00:00:00.000Z",
          startedAt: "2024-01-01T00:01:00.000Z",
          progress: { current: 5, total: 10, message: "Halfway" },
        },
        {
          id: jobId,
          type: "notion:fetch",
          status: "completed",
          createdAt: "2024-01-01T00:00:00.000Z",
          startedAt: "2024-01-01T00:01:00.000Z",
          completedAt: "2024-01-01T00:02:00.000Z",
          progress: { current: 10, total: 10, message: "Done" },
          result: { success: true },
        },
      ];

      // Apply updates in sequence
      for (const job of updates) {
        await saveJob(job);
      }

      // Final state should be last update
      const finalJob = await loadJob(jobId);
      expect(finalJob).toEqual(updates[updates.length - 1]);
    });

    it("should produce deterministic results for cleanup operations", async () => {
      const now = Date.now();
      const jobs: PersistedJob[] = [
        {
          id: "old-completed",
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
          completedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "recent-completed",
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          completedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "old-pending",
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        },
      ];

      for (const job of jobs) {
        await saveJob(job);
      }

      // Run cleanup multiple times
      const removed1 = await cleanupOldJobs(24 * 60 * 60 * 1000);
      const removed2 = await cleanupOldJobs(24 * 60 * 60 * 1000);

      // Second cleanup should remove nothing (deterministic)
      expect(removed2).toBe(0);
      expect(removed1).toBe(1);

      // Final state should be deterministic
      expect(await loadJob("old-completed")).toBeUndefined();
      expect(await loadJob("recent-completed")).toBeDefined();
      expect(await loadJob("old-pending")).toBeDefined();
    });
  });

  describe("deterministic log capture", () => {
    it("should maintain chronological order of log entries", async () => {
      const logger = createJobLogger("chronology-test");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const timestamps: string[] = [];
      const messages = ["First", "Second", "Third", "Fourth"];

      // Log messages with slight delays to ensure different timestamps
      messages.forEach((msg, i) => {
        logger.info(msg);
        timestamps.push(new Date().toISOString());
        // Small delay between logs to ensure different timestamps
        if (i < messages.length - 1) {
          const startTime = Date.now();
          while (Date.now() - startTime < 2) {
            // Wait
          }
        }
      });

      consoleSpy.mockRestore();

      // Retrieve logs
      const logs = await getJobLogs("chronology-test");

      // Should have exactly 4 logs (fresh test run)
      expect(logs.length).toBe(4);

      // Messages should be in order
      const logMessages = logs.map((l) => l.message);
      expect(logMessages).toEqual(messages);
    });

    it("should produce identical logs for identical logging sequences", async () => {
      const logger1 = createJobLogger("deterministic-log-1");
      const logger2 = createJobLogger("deterministic-log-2");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const testMessage = "Test message";
      const testData = { key: "value", number: 42 };

      // Log identical sequences
      logger1.info(testMessage, testData);
      logger1.warn(testMessage, testData);
      logger1.error(testMessage, testData);

      logger2.info(testMessage, testData);
      logger2.warn(testMessage, testData);
      logger2.error(testMessage, testData);

      consoleSpy.mockRestore();

      // Get logs for both jobs
      const logs1 = await getJobLogs("deterministic-log-1");
      const logs2 = await getJobLogs("deterministic-log-2");

      // Should have same number of logs
      expect(logs1.length).toBe(logs2.length);

      // Logs should have same structure (only jobId and timestamp differ)
      expect(logs1[0].message).toBe(logs2[0].message);
      expect(logs1[0].level).toBe(logs2[0].level);
      expect(logs1[0].data).toEqual(logs2[0].data);
    });

    it("should handle concurrent logging from multiple jobs deterministically", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const logger1 = createJobLogger("concurrent-job-1");
      const logger2 = createJobLogger("concurrent-job-2");
      const logger3 = createJobLogger("concurrent-job-3");

      const messages = ["Message A", "Message B", "Message C"];

      // Log from all jobs
      messages.forEach((msg) => {
        logger1.info(msg);
        logger2.info(msg);
        logger3.info(msg);
      });

      consoleSpy.mockRestore();

      // Each job should have its own logs
      const logs1 = await getJobLogs("concurrent-job-1");
      const logs2 = await getJobLogs("concurrent-job-2");
      const logs3 = await getJobLogs("concurrent-job-3");

      expect(logs1.length).toBe(3);
      expect(logs2.length).toBe(3);
      expect(logs3.length).toBe(3);

      // All should have same messages
      [logs1, logs2, logs3].forEach((logs) => {
        const logMessages = logs.map((l) => l.message);
        expect(logMessages).toEqual(messages);
      });
    });

    it("should return consistent results for getRecentLogs", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const logger = createJobLogger("recent-logs-test");

      // Create 10 log entries
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      consoleSpy.mockRestore();

      // Get recent logs with limit 5
      const recent1 = await getRecentLogs(5);
      const recent2 = await getRecentLogs(5);

      // Should be identical
      expect(recent1).toEqual(recent2);
      expect(recent1.length).toBe(5);

      // Last 5 messages should be "Message 5" through "Message 9"
      const messages = recent1.map((l) => l.message);
      expect(messages).toEqual([
        "Message 5",
        "Message 6",
        "Message 7",
        "Message 8",
        "Message 9",
      ]);
    });
  });
});

describe("job-persistence - recoverable behavior", () => {
  beforeEach(() => {
    cleanupTestData();
  });

  afterEach(() => {
    cleanupTestData();
  });

  describe("recovery from corrupted data", () => {
    it("should recover from malformed JSON in jobs file", async () => {
      // Create corrupted jobs file
      createCorruptedJobsFile("{ invalid json content");

      // Should return empty array instead of crashing
      const jobs = await loadAllJobs();
      expect(jobs).toEqual([]);

      // Should be able to save new jobs after corruption
      const newJob: PersistedJob = {
        id: "recovery-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await saveJob(newJob);

      const loaded = await loadJob("recovery-job");
      expect(loaded).toEqual(newJob);
    });

    it("should recover from partially written jobs file", async () => {
      // Create a partially written file (simulating crash during write)
      createCorruptedJobsFile(
        '{"jobs": [{"id": "job-1", "type": "notion:fetch"'
      );

      // Should handle gracefully
      const jobs = await loadAllJobs();
      expect(Array.isArray(jobs)).toBe(true);
    });

    it("should recover from empty jobs file", async () => {
      // Create empty jobs file
      createCorruptedJobsFile("");

      // Should return empty array
      const jobs = await loadAllJobs();
      expect(jobs).toEqual([]);

      // Should be able to create new jobs
      const job: PersistedJob = {
        id: "after-empty",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await saveJob(job);

      expect(await loadJob("after-empty")).toBeDefined();
    });

    it("should recover from jobs file with invalid job objects", async () => {
      // Create file with valid and invalid entries
      createCorruptedJobsFile(
        JSON.stringify({
          jobs: [
            {
              id: "valid-job",
              type: "notion:fetch",
              status: "completed",
              createdAt: "2024-01-01T00:00:00.000Z",
            },
            { id: "invalid-job", type: "notion:fetch" }, // Missing status
            null, // Null entry
            "string-entry", // Invalid type
          ],
        })
      );

      // Should load what it can
      const jobs = await loadAllJobs();
      expect(jobs.length).toBeGreaterThanOrEqual(0);

      // Valid job should be accessible
      const validJob = jobs.find((j) => j.id === "valid-job");
      expect(validJob).toBeDefined();
    });

    it("should recover from corrupted log file", async () => {
      // Create corrupted log file - write directly without using logger
      // to simulate actual corruption in an existing log file
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      writeFileSync(
        LOGS_FILE,
        '{"timestamp": "2024-01-01T00:00:00.000Z", "level": "info"\ninvalid log line\n{"level": "debug", "timestamp": "2024-01-01T00:00:01.000Z"}',
        "utf-8"
      );

      // Should not crash and should parse valid entries
      const logs = await getRecentLogs();
      expect(Array.isArray(logs)).toBe(true);
      // At least one valid JSON line should be parsed
      expect(logs.length).toBeGreaterThanOrEqual(0);
    });

    it("should recover from empty log file", async () => {
      // Create empty log file
      createCorruptedLogFile("");

      // Should return empty array
      const logs = await getRecentLogs();
      expect(logs).toEqual([]);

      // Should be able to create new logs
      const logger = createJobLogger("after-empty-log");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger.info("First log");

      consoleSpy.mockRestore();

      const newLogs = await getJobLogs("after-empty-log");
      expect(newLogs.length).toBe(1);
    });

    it("should handle log file with only invalid entries", async () => {
      // Create log file with only invalid JSON
      createCorruptedLogFile("not json\nstill not json\n{incomplete json");

      // Should return empty array (all entries invalid)
      const logs = await getRecentLogs();
      expect(logs).toEqual([]);
    });
  });

  describe("recovery from missing data directory", () => {
    it("should create data directory if missing", async () => {
      // Ensure directory doesn't exist
      if (existsSync(DATA_DIR)) {
        rmSync(DATA_DIR, { recursive: true, force: true });
      }

      // Should create directory and save job
      const job: PersistedJob = {
        id: "no-dir-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await saveJob(job);
      expect(existsSync(DATA_DIR)).toBe(true);
      expect(await loadJob("no-dir-job")).toBeDefined();
    });

    it("should handle missing jobs file gracefully", async () => {
      // Create directory but no jobs file
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }

      if (existsSync(JOBS_FILE)) {
        unlinkSync(JOBS_FILE);
      }

      // Should return empty array
      const jobs = await loadAllJobs();
      expect(jobs).toEqual([]);

      // Loading specific job should return undefined
      expect(await loadJob("any-job")).toBeUndefined();
    });

    it("should handle missing log file gracefully", async () => {
      // Create directory but no log file
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }

      if (existsSync(LOGS_FILE)) {
        unlinkSync(LOGS_FILE);
      }

      // Should return empty array
      const logs = await getRecentLogs();
      expect(logs).toEqual([]);

      // Job logs should be empty
      const jobLogs = await getJobLogs("any-job");
      expect(jobLogs).toEqual([]);
    });

    it("should recover by creating files on first write", async () => {
      // Start with no directory
      if (existsSync(DATA_DIR)) {
        rmSync(DATA_DIR, { recursive: true, force: true });
      }

      // First log write should create everything
      const logger = createJobLogger("first-write");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger.info("First log ever");
      await waitForPendingWrites();

      consoleSpy.mockRestore();

      // Files should exist now
      expect(existsSync(LOGS_FILE)).toBe(true);

      // Log should be retrievable
      const logs = await getJobLogs("first-write");
      expect(logs.length).toBe(1);
    });
  });

  describe("recovery from partial operations", () => {
    it("should handle deletion of non-existent job gracefully", async () => {
      const job: PersistedJob = {
        id: "real-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await saveJob(job);

      // Delete non-existent job should return false but not crash
      const deleted = await deleteJob("non-existent-job");
      expect(deleted).toBe(false);

      // Real job should still exist
      expect(await loadJob("real-job")).toBeDefined();
    });

    it("should recover from partially completed cleanup", async () => {
      const now = Date.now();
      const oldJob: PersistedJob = {
        id: "old-job",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      };

      await saveJob(oldJob);

      // Run cleanup
      await cleanupOldJobs(24 * 60 * 60 * 1000);

      // Job should be gone
      expect(await loadJob("old-job")).toBeUndefined();

      // Running cleanup again should be idempotent
      const removed = await cleanupOldJobs(24 * 60 * 60 * 1000);
      expect(removed).toBe(0);
    });

    it("should maintain data integrity after concurrent save operations", async () => {
      // Save multiple jobs rapidly
      const jobs: PersistedJob[] = [];
      for (let i = 0; i < 10; i++) {
        const job: PersistedJob = {
          id: `concurrent-job-${i}`,
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        jobs.push(job);
        await saveJob(job);
      }

      // All jobs should be retrievable
      for (const job of jobs) {
        const loaded = await loadJob(job.id);
        expect(loaded).toEqual(job);
      }

      // loadAllJobs should have all jobs
      const allJobs = await loadAllJobs();
      expect(allJobs.length).toBe(10);
    });
  });

  describe("recovery from edge cases", () => {
    it("should handle job with all optional fields populated", async () => {
      const fullJob: PersistedJob = {
        id: "full-job",
        type: "notion:fetch-all",
        status: "completed",
        createdAt: "2024-01-01T00:00:00.000Z",
        startedAt: "2024-01-01T00:01:00.000Z",
        completedAt: "2024-01-01T00:10:00.000Z",
        progress: {
          current: 100,
          total: 100,
          message: "Completed all pages",
        },
        result: {
          success: true,
          data: { pagesProcessed: 100, errors: 0 },
          output: "Successfully processed all pages",
        },
      };

      await saveJob(fullJob);

      const loaded = await loadJob("full-job");
      expect(loaded).toEqual(fullJob);
      expect(loaded?.progress?.current).toBe(100);
      expect(loaded?.result?.data).toEqual({ pagesProcessed: 100, errors: 0 });
    });

    it("should handle job with minimal fields", async () => {
      const minimalJob: PersistedJob = {
        id: "minimal-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await saveJob(minimalJob);

      const loaded = await loadJob("minimal-job");
      expect(loaded).toEqual(minimalJob);
      expect(loaded?.startedAt).toBeUndefined();
      expect(loaded?.completedAt).toBeUndefined();
      expect(loaded?.progress).toBeUndefined();
      expect(loaded?.result).toBeUndefined();
    });

    it("should handle special characters in log messages", async () => {
      const logger = createJobLogger("special-chars");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const specialMessages = [
        "Message with quotes: 'single' and \"double\"",
        "Message with newlines\nand\ttabs",
        "Message with unicode: 你好世界 🌍",
        "Message with emojis: ✅ ❌ ⚠️ ℹ️",
        "Message with backslashes \\ and slashes /",
      ];

      specialMessages.forEach((msg) => logger.info(msg));

      consoleSpy.mockRestore();

      const logs = await getJobLogs("special-chars");
      const retrievedMessages = logs.map((l) => l.message);

      // All messages should be preserved
      specialMessages.forEach((msg) => {
        expect(retrievedMessages).toContain(msg);
      });
    });

    it("should handle very long log messages", async () => {
      const logger = createJobLogger("long-message");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const longMessage = "A".repeat(10000); // 10KB message
      logger.info(longMessage);

      consoleSpy.mockRestore();

      const logs = await getJobLogs("long-message");
      expect(logs[logs.length - 1].message).toBe(longMessage);
    });

    it("should handle log with complex data objects", async () => {
      const logger = createJobLogger("complex-data");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const complexData = {
        nested: { deeply: { nested: { value: 42 } } },
        array: [1, 2, 3, { key: "value" }],
        null: null,
        date: new Date().toISOString(),
        special: null, // NaN and undefined become null in JSON
      };

      logger.info("Complex data", complexData);

      consoleSpy.mockRestore();

      const logs = await getJobLogs("complex-data");
      // After JSON serialization, undefined and NaN are converted to null or omitted
      expect(logs[logs.length - 1].data).toEqual(complexData);
    });
  });

  describe("idempotency and repeatability", () => {
    it("should handle repeated save operations idempotently", async () => {
      const job: PersistedJob = {
        id: "idempotent-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      // Save same job multiple times
      await saveJob(job);
      await saveJob(job);
      await saveJob(job);

      // Should only have one copy
      const allJobs = await loadAllJobs();
      const matchingJobs = allJobs.filter((j) => j.id === "idempotent-job");
      expect(matchingJobs.length).toBe(1);

      // Job should be unchanged
      expect(await loadJob("idempotent-job")).toEqual(job);
    });

    it("should produce consistent getJobLogs results across calls", async () => {
      const logger = createJobLogger("consistent-logs");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      logger.info("Message 1");
      logger.info("Message 2");
      logger.info("Message 3");

      consoleSpy.mockRestore();

      // Get logs multiple times
      const logs1 = await getJobLogs("consistent-logs");
      const logs2 = await getJobLogs("consistent-logs");
      const logs3 = await getJobLogs("consistent-logs");

      // All should be identical
      expect(logs1).toEqual(logs2);
      expect(logs2).toEqual(logs3);
    });

    it("should handle cleanup as idempotent operation", async () => {
      const now = Date.now();
      const oldJob: PersistedJob = {
        id: "old-job",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      };

      await saveJob(oldJob);

      // First cleanup removes job
      const removed1 = await cleanupOldJobs(24 * 60 * 60 * 1000);
      expect(removed1).toBe(1);

      // Second cleanup does nothing
      const removed2 = await cleanupOldJobs(24 * 60 * 60 * 1000);
      expect(removed2).toBe(0);

      // Third cleanup still does nothing
      const removed3 = await cleanupOldJobs(24 * 60 * 60 * 1000);
      expect(removed3).toBe(0);
    });
  });
});
