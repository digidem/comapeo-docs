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
  waitForPendingWrites,
  type PersistedJob,
  type JobLogEntry,
} from "./job-persistence";
import { setupTestEnvironment } from "./test-helpers";

// Run tests sequentially to avoid file system race conditions
describe("job-persistence", () => {
  let testEnv: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    // Set up isolated test environment
    testEnv = setupTestEnvironment();
  });

  afterEach(async () => {
    // Wait for pending writes to complete before cleanup
    await waitForPendingWrites().catch(() => {
      // Ignore timeout errors during cleanup
    });
    // Clean up test environment
    testEnv.cleanup();
  });

  describe("saveJob and loadJob", () => {
    it("should save and load a job", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);
      expect(loaded).toEqual(job);
    });

    it("should update an existing job", async () => {
      const job: PersistedJob = {
        id: "test-job-2",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);
      await waitForPendingWrites();

      // Update the job
      const updatedJob: PersistedJob = {
        ...job,
        status: "completed",
        completedAt: new Date().toISOString(),
        result: { success: true, output: "test output" },
      };

      saveJob(updatedJob);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);
      expect(loaded).toEqual(updatedJob);
      expect(loaded?.status).toBe("completed");
      expect(loaded?.result?.success).toBe(true);
    });

    it("should return undefined for non-existent job", async () => {
      const loaded = await loadJob("non-existent-job");
      expect(loaded).toBeUndefined();
    });

    it("should save multiple jobs", async () => {
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
      await waitForPendingWrites();

      const loaded1 = await loadJob(job1.id);
      const loaded2 = await loadJob(job2.id);

      expect(loaded1).toEqual(job1);
      expect(loaded2).toEqual(job2);

      const all = await loadAllJobs();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(job1);
      expect(all).toContainEqual(job2);
    });
  });

  describe("deleteJob", () => {
    it("should delete a job", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);
      await waitForPendingWrites();

      const deleted = await deleteJob(job.id);

      expect(deleted).toBe(true);
      expect(await loadJob(job.id)).toBeUndefined();
    });

    it("should return false when deleting non-existent job", async () => {
      const deleted = await deleteJob("non-existent-job");

      expect(deleted).toBe(false);
    });

    it("should handle multiple deletes", async () => {
      const job1: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const job2: PersistedJob = {
        id: "test-job-2",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      saveJob(job1);
      saveJob(job2);
      await waitForPendingWrites();

      await deleteJob(job1.id);
      await waitForPendingWrites();

      expect(await loadAllJobs()).toEqual([job2]);

      await deleteJob(job2.id);
      await waitForPendingWrites();

      expect(await loadAllJobs()).toEqual([]);
    });
  });

  describe("appendLog and getJobLogs", () => {
    it("should append and retrieve logs for a job", async () => {
      const jobId = "test-job-1";
      const logger = createJobLogger(jobId);

      logger.info("Job started");
      logger.warn("Warning message");
      logger.error("Error message");

      const logs = await getJobLogs(jobId);

      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe("Job started");
      expect(logs[0].level).toBe("info");
      expect(logs[1].message).toBe("Warning message");
      expect(logs[1].level).toBe("warn");
      expect(logs[2].message).toBe("Error message");
      expect(logs[2].level).toBe("error");
    });

    it("should filter logs by job ID", async () => {
      const logger1 = createJobLogger("job-1");
      const logger2 = createJobLogger("job-2");

      logger1.info("Job 1 message");
      logger2.info("Job 2 message");
      logger1.warn("Job 1 warning");

      const job1Logs = await getJobLogs("job-1");
      const job2Logs = await getJobLogs("job-2");

      expect(job1Logs).toHaveLength(2);
      expect(job1Logs[0].message).toBe("Job 1 message");
      expect(job1Logs[1].message).toBe("Job 1 warning");

      expect(job2Logs).toHaveLength(1);
      expect(job2Logs[0].message).toBe("Job 2 message");
    });

    it("should return empty logs for non-existent job", async () => {
      const logs = await getJobLogs("non-existent-job");
      expect(logs).toEqual([]);
    });

    it("should handle logs with data", async () => {
      const jobId = "test-job-1";
      const logger = createJobLogger(jobId);

      logger.info("Processing", { count: 42, status: "running" });

      const logs = await getJobLogs(jobId);

      expect(logs).toHaveLength(1);
      expect(logs[0].data).toEqual({ count: 42, status: "running" });
    });
  });

  describe("getRecentLogs", () => {
    it("should retrieve recent logs across all jobs", async () => {
      const logger1 = createJobLogger("job-1");
      const logger2 = createJobLogger("job-2");

      logger1.info("Job 1 log 1");
      logger2.info("Job 2 log 1");
      logger1.info("Job 1 log 2");
      logger2.info("Job 2 log 2");

      const recentLogs = await getRecentLogs();

      expect(recentLogs).toHaveLength(4);
      expect(recentLogs[0].jobId).toBe("job-1");
      expect(recentLogs[0].message).toBe("Job 1 log 1");
      expect(recentLogs[3].jobId).toBe("job-2");
      expect(recentLogs[3].message).toBe("Job 2 log 2");
    });

    it("should respect limit parameter", async () => {
      const logger = createJobLogger("job-1");

      for (let i = 0; i < 50; i++) {
        logger.info(`Log ${i}`);
      }

      const recentLogs = await getRecentLogs(10);

      expect(recentLogs).toHaveLength(10);
      expect(recentLogs[0].message).toBe("Log 40");
      expect(recentLogs[9].message).toBe("Log 49");
    });

    it("should return empty array when no logs exist", async () => {
      const recentLogs = await getRecentLogs();
      expect(recentLogs).toEqual([]);
    });
  });

  describe("job result storage", () => {
    it("should store job result with data", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: {
          success: true,
          data: { pages: 42, content: "test content" },
        },
      };

      saveJob(job);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);

      expect(loaded?.result?.success).toBe(true);
      expect(loaded?.result?.data).toEqual({
        pages: 42,
        content: "test content",
      });
    });

    it("should store job result with error", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "failed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: {
          success: false,
          error: "Network error",
        },
      };

      saveJob(job);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);

      expect(loaded?.result?.success).toBe(false);
      expect(loaded?.result?.error).toBe("Network error");
    });
  });

  describe("job progress", () => {
    it("should update job progress", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "running",
        createdAt: new Date().toISOString(),
        progress: {
          current: 0,
          total: 100,
          message: "Starting",
        },
      };

      saveJob(job);
      await waitForPendingWrites();

      // Update progress
      const updatedJob = {
        ...job,
        progress: { current: 50, total: 100, message: "Halfway" },
      };
      saveJob(updatedJob);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);

      expect(loaded?.progress?.current).toBe(50);
      expect(loaded?.progress?.message).toBe("Halfway");
    });
  });

  describe("GitHub status", () => {
    it("should store GitHub context and status", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
        github: {
          owner: "test-owner",
          repo: "test-repo",
          sha: "abc123",
          token: "token",
        },
        githubStatusReported: false,
      };

      saveJob(job);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);

      expect(loaded?.github?.owner).toBe("test-owner");
      expect(loaded?.github?.repo).toBe("test-repo");
      expect(loaded?.githubStatusReported).toBe(false);
    });

    it("should update GitHub status reported", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        github: {
          owner: "test-owner",
          repo: "test-repo",
          sha: "abc123",
          token: "token",
        },
        githubStatusReported: false,
      };

      saveJob(job);
      await waitForPendingWrites();

      const updated = { ...job, githubStatusReported: true };
      saveJob(updated);
      await waitForPendingWrites();

      const loaded = await loadJob(job.id);

      expect(loaded?.githubStatusReported).toBe(true);
    });
  });

  describe("cleanupOldJobs", () => {
    it("should not remove recently completed jobs", async () => {
      const job: PersistedJob = {
        id: "test-job-1",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      saveJob(job);
      await waitForPendingWrites();

      const removedCount = await cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
      expect(await loadJob("test-job-1")).toBeDefined();
    });

    it("should keep pending jobs regardless of age", async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const job: PersistedJob = {
        id: "old-pending-job",
        type: "notion:fetch",
        status: "pending",
        createdAt: oldDate,
      };

      saveJob(job);
      await waitForPendingWrites();

      const removedCount = await cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
      expect(await loadJob("old-pending-job")).toBeDefined();
    });

    it("should keep running jobs regardless of age", async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const job: PersistedJob = {
        id: "old-running-job",
        type: "notion:fetch",
        status: "running",
        createdAt: oldDate,
        startedAt: oldDate,
      };

      saveJob(job);
      await waitForPendingWrites();

      const removedCount = await cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(0);
      expect(await loadJob("old-running-job")).toBeDefined();
    });

    it("should remove old failed jobs", async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const job: PersistedJob = {
        id: "old-failed-job",
        type: "notion:fetch",
        status: "failed",
        createdAt: oldDate,
        completedAt: oldDate,
      };

      saveJob(job);
      await waitForPendingWrites();

      await waitForPendingWrites();
      const removedCount = await cleanupOldJobs(24 * 60 * 60 * 1000);

      expect(removedCount).toBe(1);
      expect(await loadJob("old-failed-job")).toBeUndefined();
    });

    it("should enforce max stored jobs limit", async () => {
      const maxJobs = 5;
      process.env.MAX_STORED_JOBS = maxJobs.toString();

      // Save 10 completed jobs
      for (let i = 0; i < 10; i++) {
        const job: PersistedJob = {
          id: `test-job-${i}`,
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          completedAt: new Date(Date.now() - i * 1000).toISOString(),
        };
        saveJob(job);
      }
      await waitForPendingWrites();

      // 5 pending jobs that should be preserved
      for (let i = 0; i < 5; i++) {
        const job: PersistedJob = {
          id: `pending-job-${i}`,
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        saveJob(job);
      }
      await waitForPendingWrites();
      await waitForPendingWrites();

      const removedCount = await cleanupOldJobs();
      await waitForPendingWrites();

      expect(await loadAllJobs()).toHaveLength(5);
      expect(removedCount).toBe(10);

      // Cleanup
      delete process.env.MAX_STORED_JOBS;
    });

    it("should keep pending/running jobs when enforcing max jobs", async () => {
      const maxJobs = 3;
      process.env.MAX_STORED_JOBS = maxJobs.toString();

      // Save 2 pending jobs
      saveJob({
        id: "pending-1",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      saveJob({
        id: "pending-2",
        type: "notion:fetch",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      await waitForPendingWrites();

      // Save 5 completed jobs
      for (let i = 0; i < 5; i++) {
        saveJob({
          id: `completed-${i}`,
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date(Date.now() - i * 1000).toISOString(),
          completedAt: new Date(Date.now() - i * 1000).toISOString(),
        });
      }
      await waitForPendingWrites();
      await waitForPendingWrites();

      const removedCount = await cleanupOldJobs();
      await waitForPendingWrites();

      // Should keep 2 pending + 1 newest completed = 3 total
      expect(await loadAllJobs()).toHaveLength(3);
      expect(removedCount).toBe(4);

      // Verify pending jobs are preserved
      expect(await loadJob("pending-1")).toBeDefined();
      expect(await loadJob("pending-2")).toBeDefined();

      // Cleanup
      delete process.env.MAX_STORED_JOBS;
    });
  });
});
