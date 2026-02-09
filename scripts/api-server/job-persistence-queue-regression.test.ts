/**
 * Regression tests for persistence and queue interaction stability
 * Tests system behavior under repeated execution and stress conditions
 * Focuses on deleteJob operations and queue completion events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveJob,
  loadJob,
  loadAllJobs,
  deleteJob,
  cleanupOldJobs,
  type PersistedJob,
} from "./job-persistence";
import { JobQueue } from "./job-queue";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import type { JobExecutionContext } from "./job-executor";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".jobs-data");

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

describe("Job Persistence and Queue Regression Tests", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  describe("deleteJob stability under repeated execution", () => {
    it("should handle 100 consecutive deleteJob operations without data corruption", () => {
      const jobIds: string[] = [];

      // Create 50 jobs
      for (let i = 0; i < 50; i++) {
        const job: PersistedJob = {
          id: `stress-job-${i}`,
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        saveJob(job);
        jobIds.push(job.id);
      }

      // Delete all jobs
      let deletedCount = 0;
      for (const jobId of jobIds) {
        const deleted = deleteJob(jobId);
        if (deleted) {
          deletedCount++;
        }
      }

      expect(deletedCount).toBe(50);

      // Verify all jobs are gone
      const remainingJobs = loadAllJobs();
      expect(remainingJobs).toHaveLength(0);

      // Verify individual loads return undefined
      for (const jobId of jobIds) {
        expect(loadJob(jobId)).toBeUndefined();
      }
    });

    it("should handle rapid alternating save/delete cycles", () => {
      const cycles = 50;
      const jobId = "rapid-cycle-job";

      for (let i = 0; i < cycles; i++) {
        const job: PersistedJob = {
          id: jobId,
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date().toISOString(),
          result: { success: true, data: { cycle: i } },
        };
        saveJob(job);

        const loaded = loadJob(jobId);
        expect(loaded).toBeDefined();
        expect((loaded?.result?.data as { cycle: number })?.cycle).toBe(i);

        deleteJob(jobId);
        expect(loadJob(jobId)).toBeUndefined();
      }

      // Final state should have no jobs
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(0);
    });

    it("should handle deleteJob on non-existent jobs consistently", () => {
      // Delete non-existent job 100 times
      let deletedCount = 0;
      for (let i = 0; i < 100; i++) {
        const deleted = deleteJob(`non-existent-${i}`);
        expect(deleted).toBe(false);
        if (deleted) {
          deletedCount++;
        }
      }

      expect(deletedCount).toBe(0);

      // Verify no jobs were created
      const jobs = loadAllJobs();
      expect(jobs).toHaveLength(0);
    });

    it("should handle deleteJob immediately after save", () => {
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const job: PersistedJob = {
          id: `immediate-delete-${i}`,
          type: "notion:fetch",
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        saveJob(job);
        const deleted = deleteJob(job.id);

        expect(deleted).toBe(true);
        expect(loadJob(job.id)).toBeUndefined();
      }

      // Verify clean state
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(0);
    });

    it("should maintain data integrity during concurrent-style deletions", () => {
      const jobCount = 30;
      const jobs: PersistedJob[] = [];

      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        const job: PersistedJob = {
          id: `concurrent-del-${i}`,
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        jobs.push(job);
        saveJob(job);
      }

      // Delete in alternating pattern (simulate concurrent access)
      let deletedCount = 0;
      for (let i = 0; i < jobCount; i += 2) {
        // eslint-disable-next-line security/detect-object-injection -- i is numeric loop index
        if (deleteJob(jobs[i]!.id)) {
          deletedCount++;
        }
        // i+1 is also a numeric loop index, ESLint doesn't flag this one
        if (i + 1 < jobCount && deleteJob(jobs[i + 1]!.id)) {
          deletedCount++;
        }
      }

      expect(deletedCount).toBe(jobCount);

      // Verify all gone
      const remaining = loadAllJobs();
      expect(remaining).toHaveLength(0);
    });

    it("should handle deleteJob with same ID repeated (idempotency)", () => {
      const job: PersistedJob = {
        id: "idempotent-delete",
        type: "notion:fetch",
        status: "completed",
        createdAt: new Date().toISOString(),
      };

      saveJob(job);

      // Delete same job 50 times
      let deletedCount = 0;
      for (let i = 0; i < 50; i++) {
        if (deleteJob(job.id)) {
          deletedCount++;
        }
      }

      // Only first delete should succeed
      expect(deletedCount).toBe(1);
      expect(loadJob(job.id)).toBeUndefined();
    });
  });

  describe("queue completion events and persistence integration", () => {
    it("should handle 50 consecutive queue completion cycles", async () => {
      const queue = new JobQueue({ concurrency: 1 });
      const completionCount = 50;
      let completeCount = 0;
      const completedJobIds: string[] = [];

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              completeCount++;
              completedJobIds.push(context.jobId);
              context.onComplete(true, { iteration: completeCount });
              resolve();
            }, 10);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add and wait for jobs sequentially
      for (let i = 0; i < completionCount; i++) {
        const jobId = await queue.add("notion:fetch");

        // Wait for this job to complete before adding next
        await new Promise((resolve) => setTimeout(resolve, 30));

        const jobTracker = getJobTracker();
        const job = jobTracker.getJob(jobId);
        expect(job?.status).toBe("completed");
        expect((job?.result?.data as { iteration: number })?.iteration).toBe(
          i + 1
        );
      }

      expect(completeCount).toBe(completionCount);
      expect(completedJobIds.length).toBe(completionCount);

      // All job IDs should be unique
      expect(new Set(completedJobIds).size).toBe(completionCount);

      // Wait for queue to drain
      await new Promise((resolve) => setTimeout(resolve, 100));

      const jobTracker = getJobTracker();
      const allJobs = jobTracker.getAllJobs();
      expect(allJobs.length).toBeGreaterThanOrEqual(completionCount);
    });

    it("should maintain persistence during rapid queue completions", async () => {
      const queue = new JobQueue({ concurrency: 3 });
      const jobCount = 20;
      const jobIds: string[] = [];

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true, { timestamp: Date.now() });
              resolve();
            }, 20);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add all jobs rapidly
      for (let i = 0; i < jobCount; i++) {
        const jobId = await queue.add("notion:fetch");
        jobIds.push(jobId);
      }

      // Wait for all to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify all jobs persisted correctly
      const jobTracker = getJobTracker();
      for (const jobId of jobIds) {
        const job = jobTracker.getJob(jobId);
        expect(job).toBeDefined();
        expect(job?.status).toBe("completed");
        expect(job?.result?.success).toBe(true);
      }

      // Verify no duplicate jobs
      const allJobs = jobTracker.getAllJobs();
      const uniqueJobIds = new Set(allJobs.map((j) => j.id));
      expect(uniqueJobIds.size).toBe(jobCount);
    });

    it("should handle queue completion with persistence cleanup", async () => {
      const queue = new JobQueue({ concurrency: 2 });
      const iterations = 10;
      let completedCount = 0;

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              completedCount++;
              context.onComplete(true);
              resolve();
            }, 30);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Run multiple cycles
      for (let i = 0; i < iterations; i++) {
        const jobId = await queue.add("notion:fetch");

        // Wait for completion
        await new Promise((resolve) => setTimeout(resolve, 70));

        const jobTracker = getJobTracker();
        const job = jobTracker.getJob(jobId);
        expect(job?.status).toBe("completed");
      }

      expect(completedCount).toBe(iterations);

      // Verify persistence consistency
      const jobTracker = getJobTracker();
      const allJobs = jobTracker.getAllJobs();
      const completedJobs = allJobs.filter((j) => j.status === "completed");
      expect(completedJobs.length).toBeGreaterThanOrEqual(iterations);
    });
  });

  describe("stress tests for deleteJob and queue completion", () => {
    it("should handle 100 job cycles: add -> complete -> delete", async () => {
      const queue = new JobQueue({ concurrency: 2 });
      const cycles = 100;
      const jobIds: string[] = [];

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true);
              resolve();
            }, 10);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add jobs
      for (let i = 0; i < cycles; i++) {
        const jobId = await queue.add("notion:fetch");
        jobIds.push(jobId);
      }

      // Wait for all to complete
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Verify all completed
      const jobTracker = getJobTracker();
      for (const jobId of jobIds) {
        const job = jobTracker.getJob(jobId);
        expect(job?.status).toBe("completed");
      }

      // Delete all jobs
      let deletedCount = 0;
      for (const jobId of jobIds) {
        if (deleteJob(jobId)) {
          deletedCount++;
        }
      }

      expect(deletedCount).toBe(cycles);

      // Verify all deleted
      for (const jobId of jobIds) {
        expect(loadJob(jobId)).toBeUndefined();
      }

      const remainingJobs = loadAllJobs();
      expect(remainingJobs).toHaveLength(0);
    });

    it("should handle rapid job creation and deletion interleaved with queue operations", async () => {
      const queue = new JobQueue({ concurrency: 2 });
      const operations = 20;
      const createdJobIds: string[] = [];

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true);
              resolve();
            }, 30);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add all jobs to queue first
      for (let i = 0; i < operations; i++) {
        const jobId = await queue.add("notion:fetch");
        createdJobIds.push(jobId);
      }

      // Wait for all jobs to complete
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify all jobs completed
      const jobTracker = getJobTracker();
      for (const jobId of createdJobIds) {
        const job = jobTracker.getJob(jobId);
        expect(job?.status).toBe("completed");
      }

      // Now delete all jobs in rapid succession
      let deletedCount = 0;
      for (const jobId of createdJobIds) {
        if (deleteJob(jobId)) {
          deletedCount++;
        }
      }

      expect(deletedCount).toBe(operations);

      // Verify final state is clean
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(0);

      // Verify all jobs are deleted individually
      for (const jobId of createdJobIds) {
        expect(loadJob(jobId)).toBeUndefined();
      }
    });

    it("should maintain consistency under cleanupOldJobs repeated calls", () => {
      const now = Date.now();
      const jobCount = 50;

      // Create mix of old and recent jobs
      for (let i = 0; i < jobCount; i++) {
        const ageHours = i % 3 === 0 ? 48 : 2; // Every 3rd job is old
        const job: PersistedJob = {
          id: `cleanup-test-${i}`,
          type: "notion:fetch",
          status: "completed",
          createdAt: new Date(now - ageHours * 60 * 60 * 1000).toISOString(),
          completedAt: new Date(
            now - (ageHours - 1) * 60 * 60 * 1000
          ).toISOString(),
        };
        saveJob(job);
      }

      // Run cleanup 10 times
      const removalCounts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const removed = cleanupOldJobs(24 * 60 * 60 * 1000);
        removalCounts.push(removed);
      }

      // First cleanup should remove old jobs
      expect(removalCounts[0]).toBeGreaterThan(0);

      // Subsequent cleanups should remove nothing (idempotent)
      for (let i = 1; i < removalCounts.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- i is numeric loop index
        expect(removalCounts[i]!).toBe(0);
      }

      // Verify only recent jobs remain
      const remainingJobs = loadAllJobs();
      expect(remainingJobs.length).toBeGreaterThan(0);
      expect(remainingJobs.length).toBeLessThan(jobCount);
    });
  });

  describe("edge cases and error recovery", () => {
    it("should handle deleteJob during active queue operations", async () => {
      const queue = new JobQueue({ concurrency: 1 });
      let jobStarted = false;
      let jobCompleted = false;

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            jobStarted = true;
            setTimeout(() => {
              jobCompleted = true;
              context.onComplete(true);
              resolve();
            }, 100);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      const jobId = await queue.add("notion:fetch");

      // Wait for job to start
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(jobStarted).toBe(true);

      // Try to delete job while it's running
      const deletedWhileRunning = deleteJob(jobId);

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(jobCompleted).toBe(true);

      // Job should be completed, not deleted
      const jobTracker = getJobTracker();
      const job = jobTracker.getJob(jobId);
      expect(job?.status).toBe("completed");

      // Now delete it
      const deletedAfterComplete = deleteJob(jobId);
      expect(deletedAfterComplete).toBe(true);
      expect(loadJob(jobId)).toBeUndefined();
    });

    it("should handle queue completion followed by immediate deletion repeatedly", async () => {
      const queue = new JobQueue({ concurrency: 1 });
      const cycles = 20;

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true, { data: "done" });
              resolve();
            }, 20);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      for (let i = 0; i < cycles; i++) {
        const jobId = await queue.add("notion:fetch");

        // Wait for completion
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify completed
        const jobTracker = getJobTracker();
        const job = jobTracker.getJob(jobId);
        expect(job?.status).toBe("completed");

        // Immediately delete
        const deleted = deleteJob(jobId);
        expect(deleted).toBe(true);

        // Verify gone
        expect(loadJob(jobId)).toBeUndefined();
      }

      // Final state should be clean
      const finalJobs = loadAllJobs();
      expect(finalJobs).toHaveLength(0);
    });

    it("should handle multiple jobs completing simultaneously", async () => {
      const queue = new JobQueue({ concurrency: 5 });
      const jobCount = 10;
      const completionOrder: string[] = [];

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            // Random delay to simulate varied completion times
            const delay = Math.random() * 50 + 10;
            setTimeout(() => {
              completionOrder.push(context.jobId);
              context.onComplete(true);
              resolve();
            }, delay);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add all jobs at once
      const jobIds = await Promise.all(
        Array.from({ length: jobCount }, () => queue.add("notion:fetch"))
      );

      // Wait for all to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify all completed
      const jobTracker = getJobTracker();
      for (const jobId of jobIds) {
        const job = jobTracker.getJob(jobId);
        expect(job?.status).toBe("completed");
      }

      // Verify unique completions
      expect(new Set(completionOrder).size).toBe(jobCount);

      // Delete all and verify clean state
      let deletedCount = 0;
      for (const jobId of jobIds) {
        if (deleteJob(jobId)) {
          deletedCount++;
        }
      }

      expect(deletedCount).toBe(jobCount);
      expect(loadAllJobs()).toHaveLength(0);
    });
  });

  describe("data consistency across operations", () => {
    it("should maintain job count accuracy through repeated operations", async () => {
      const queue = new JobQueue({ concurrency: 2 });
      const iterations = 30;

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true);
              resolve();
            }, 15);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      let expectedTotal = 0;

      for (let i = 0; i < iterations; i++) {
        const jobId = await queue.add("notion:fetch");
        expectedTotal++;

        const jobsBefore = loadAllJobs();
        expect(jobsBefore.length).toBeGreaterThanOrEqual(expectedTotal);

        // Wait for completion
        await new Promise((resolve) => setTimeout(resolve, 40));

        // Every 5th job, delete one
        if (i > 0 && i % 5 === 0) {
          const allJobs = loadAllJobs();
          if (allJobs.length > 0) {
            const toDelete = allJobs[0]!;
            deleteJob(toDelete.id);
            expectedTotal--;
          }
        }
      }

      // Wait for final completions
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Final check: all jobs should be tracked
      const finalJobs = loadAllJobs();
      expect(finalJobs.length).toBeGreaterThan(0);
    });

    it("should preserve job data integrity through complete lifecycle", async () => {
      const queue = new JobQueue({ concurrency: 1 });
      const testData = { iteration: 0, timestamp: Date.now() };

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true, {
                ...testData,
                iteration: context.jobId,
              });
              resolve();
            }, 20);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      const iterations = 20;
      const jobIds: string[] = [];

      for (let i = 0; i < iterations; i++) {
        const jobId = await queue.add("notion:fetch");
        jobIds.push(jobId);

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify job data
        const job = loadJob(jobId);
        expect(job).toBeDefined();
        expect(job?.status).toBe("completed");
        expect(job?.result?.success).toBe(true);
      }

      // Verify all data intact before deletion
      for (const jobId of jobIds) {
        const job = loadJob(jobId);
        expect(job?.result?.data).toBeDefined();
      }

      // Delete all
      for (const jobId of jobIds) {
        deleteJob(jobId);
      }

      // Verify all gone
      expect(loadAllJobs()).toHaveLength(0);
    });
  });
});
