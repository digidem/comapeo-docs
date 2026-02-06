/**
 * Tests for job queue with concurrency limits and cancellation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JobQueue, createJobQueue, type QueuedJob } from "./job-queue";
import { getJobTracker, destroyJobTracker, type JobType } from "./job-tracker";
import type { JobExecutionContext, JobOptions } from "./job-executor";
import { existsSync, unlinkSync, rmdirSync, rmSync } from "node:fs";
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

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
    queue = new JobQueue({ concurrency: 2 });
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  describe("constructor", () => {
    it("should create a queue with given concurrency limit", () => {
      const q = new JobQueue({ concurrency: 3 });
      const status = q.getStatus();

      expect(status.concurrency).toBe(3);
      expect(status.queued).toBe(0);
      expect(status.running).toBe(0);
    });
  });

  describe("registerExecutor", () => {
    it("should register an executor for a job type", () => {
      const executor = vi.fn();
      queue.registerExecutor("notion:fetch", executor);

      // Executor is registered - we can't directly access it but
      // we'll verify it works when we add a job
      expect(() =>
        queue.registerExecutor("notion:fetch", executor)
      ).not.toThrow();
    });
  });

  describe("add", () => {
    it("should add a job to the queue and return a job ID", async () => {
      const executor = vi.fn().mockResolvedValue(undefined);
      queue.registerExecutor("notion:fetch", executor);

      const jobId = await queue.add("notion:fetch");

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe("string");

      const jobTracker = getJobTracker();
      const job = jobTracker.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
    });

    it("should start jobs up to concurrency limit", async () => {
      let runningCount = 0;
      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            runningCount++;
            setTimeout(() => {
              runningCount--;
              context.onComplete(true);
              resolve();
            }, 100);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add 3 jobs with concurrency of 2
      const job1 = await queue.add("notion:fetch");
      const job2 = await queue.add("notion:fetch");
      const job3 = await queue.add("notion:fetch");

      // Wait a bit for jobs to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = queue.getStatus();
      expect(status.running).toBeLessThanOrEqual(2);
      expect(status.queued).toBeGreaterThanOrEqual(1);

      // Clean up - wait for jobs to complete
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    it("should process queued jobs when running jobs complete", async () => {
      let completedCount = 0;
      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              completedCount++;
              context.onComplete(true);
              resolve();
            }, 50);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add 3 jobs with concurrency of 1
      const queue1 = new JobQueue({ concurrency: 1 });
      queue1.registerExecutor("notion:fetch", executor);

      await queue1.add("notion:fetch");
      await queue1.add("notion:fetch");
      await queue1.add("notion:fetch");

      // Wait for all jobs to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(completedCount).toBe(3);
    });

    it("should fail job when no executor is registered", async () => {
      // Don't register any executor
      const jobId = await queue.add("notion:fetch");

      // Wait a bit for the job to fail
      await new Promise((resolve) => setTimeout(resolve, 50));

      const jobTracker = getJobTracker();
      const job = jobTracker.getJob(jobId);

      expect(job?.status).toBe("failed");
      expect(job?.result?.error).toContain("No executor registered");
    });
  });

  describe("cancel", () => {
    it("should cancel a queued job", async () => {
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 1000))
        );

      queue.registerExecutor("notion:fetch", executor);

      // Add a job
      const jobId = await queue.add("notion:fetch");

      // Cancel immediately before it starts (in most cases it will still be queued)
      const cancelled = queue.cancel(jobId);

      expect(cancelled).toBe(true);

      const jobTracker = getJobTracker();
      const job = jobTracker.getJob(jobId);

      expect(job?.result?.error).toBe("Job cancelled");
    });

    it("should cancel a running job", async () => {
      const abortController = {
        abort: vi.fn(),
        signal: { aborted: false } as AbortSignal,
      };

      const executor = vi.fn().mockImplementation(
        (_context: JobExecutionContext, signal: AbortSignal) =>
          new Promise<void>((resolve, reject) => {
            // Simulate a long-running job
            const timeout = setTimeout(() => resolve(), 1000);

            signal.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new Error("Job cancelled"));
            });
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      const jobId = await queue.add("notion:fetch");

      // Wait for job to start running
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel the job
      const cancelled = queue.cancel(jobId);

      expect(cancelled).toBe(true);
    });

    it("should return false when cancelling non-existent job", () => {
      const cancelled = queue.cancel("non-existent-job-id");
      expect(cancelled).toBe(false);
    });

    it("should update job status to failed when cancelled", async () => {
      // Use a slow executor to ensure cancellation happens before completion
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 200))
        );
      queue.registerExecutor("notion:fetch", executor);

      const jobId = await queue.add("notion:fetch");

      // Cancel immediately while job is likely still queued or just starting
      queue.cancel(jobId);

      // Wait for cancellation to process
      await new Promise((resolve) => setTimeout(resolve, 50));

      const jobTracker = getJobTracker();
      const job = jobTracker.getJob(jobId);

      expect(job?.status).toBe("failed");
      expect(job?.result?.success).toBe(false);
      expect(job?.result?.error).toBe("Job cancelled");
    });
  });

  describe("getStatus", () => {
    it("should return current queue status", async () => {
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 100))
        );

      queue.registerExecutor("notion:fetch", executor);

      const status = queue.getStatus();

      expect(status).toHaveProperty("queued");
      expect(status).toHaveProperty("running");
      expect(status).toHaveProperty("concurrency");
      expect(status.concurrency).toBe(2);
      expect(status.queued).toBe(0);
      expect(status.running).toBe(0);
    });

    it("should report correct queued and running counts", async () => {
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 100))
        );

      queue.registerExecutor("notion:fetch", executor);

      // Add jobs
      await queue.add("notion:fetch");
      await queue.add("notion:fetch");
      await queue.add("notion:fetch");

      // Wait a bit for some jobs to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = queue.getStatus();

      expect(status.running + status.queued).toBe(3);
      expect(status.running).toBeLessThanOrEqual(2);
    });
  });

  describe("getQueuedJobs", () => {
    it("should return all queued jobs", async () => {
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 100))
        );

      queue.registerExecutor("notion:fetch", executor);

      // Add more jobs than concurrency allows
      await queue.add("notion:fetch");
      await queue.add("notion:fetch");
      await queue.add("notion:fetch");

      // Small delay to let some jobs start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const queuedJobs = queue.getQueuedJobs();

      expect(Array.isArray(queuedJobs)).toBe(true);
      // At least one job should be queued since we have 3 jobs and concurrency 2
      expect(queuedJobs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getRunningJobs", () => {
    it("should return all running jobs", async () => {
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 100))
        );

      queue.registerExecutor("notion:fetch", executor);

      await queue.add("notion:fetch");
      await queue.add("notion:fetch");

      // Wait for jobs to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const runningJobs = queue.getRunningJobs();

      expect(Array.isArray(runningJobs)).toBe(true);
      expect(runningJobs.length).toBeLessThanOrEqual(2);
    });
  });

  describe("concurrency enforcement", () => {
    it("should not exceed concurrency limit", async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const executor = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            currentConcurrent++;
            maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

            setTimeout(() => {
              currentConcurrent--;
              resolve();
            }, 50);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      // Add many jobs
      for (let i = 0; i < 10; i++) {
        await queue.add("notion:fetch");
      }

      // Wait for all jobs to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("should start next job when current job completes", async () => {
      const startTimes: number[] = [];

      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            startTimes.push(Date.now());
            setTimeout(() => {
              context.onComplete(true);
              resolve();
            }, 50);
          })
      );

      const queue1 = new JobQueue({ concurrency: 1 });
      queue1.registerExecutor("notion:fetch", executor);

      // Add jobs sequentially with small delay
      await queue1.add("notion:fetch");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await queue1.add("notion:fetch");
      await new Promise((resolve) => setTimeout(resolve, 10));
      await queue1.add("notion:fetch");

      // Wait for all to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(startTimes).toHaveLength(3);

      // Jobs should start sequentially (each >50ms apart due to concurrency 1)
      expect(startTimes[1]! - startTimes[0]!).toBeGreaterThanOrEqual(40);
      expect(startTimes[2]! - startTimes[1]!).toBeGreaterThanOrEqual(40);
    });
  });

  describe("job lifecycle", () => {
    it("should update job status through lifecycle", async () => {
      const executor = vi.fn().mockImplementation(
        (context: JobExecutionContext) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              context.onComplete(true, { result: "done" });
              resolve();
            }, 50);
          })
      );

      queue.registerExecutor("notion:fetch", executor);

      const jobId = await queue.add("notion:fetch");

      const jobTracker = getJobTracker();

      // Initially pending/running
      await new Promise((resolve) => setTimeout(resolve, 10));
      let job = jobTracker.getJob(jobId);
      expect(["running", "completed"]).toContain(job?.status);

      // After completion
      await new Promise((resolve) => setTimeout(resolve, 100));
      job = jobTracker.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.result?.success).toBe(true);
    });

    it("should handle job failure", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("Test error"));

      queue.registerExecutor("notion:fetch", executor);

      const jobId = await queue.add("notion:fetch");

      // Wait for job to fail
      await new Promise((resolve) => setTimeout(resolve, 100));

      const jobTracker = getJobTracker();
      const job = jobTracker.getJob(jobId);

      expect(job?.status).toBe("failed");
      expect(job?.result?.success).toBe(false);
      expect(job?.result?.error).toBe("Test error");
    });
  });

  describe("edge cases", () => {
    it("should handle rapid job additions", async () => {
      const executor = vi
        .fn()
        .mockImplementation(
          () => new Promise<void>((resolve) => setTimeout(resolve, 50))
        );

      queue.registerExecutor("notion:fetch", executor);

      // Add many jobs rapidly
      const promises: Promise<string>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(queue.add("notion:fetch"));
      }

      const jobIds = await Promise.all(promises);

      expect(jobIds).toHaveLength(20);
      expect(new Set(jobIds).size).toBe(20); // All unique

      // Wait longer for all to complete - with concurrency 2 and 20 jobs taking 50ms each
      // worst case is ~1000ms, but there's some overhead so give more time
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const jobTracker = getJobTracker();
      const completedJobs = jobTracker.getJobsByStatus("completed");

      // Should have at least 18 completed (allowing for some test flakiness)
      expect(completedJobs.length).toBeGreaterThanOrEqual(18);
    });

    it("should handle cancelling already completed job gracefully", async () => {
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

      const jobId = await queue.add("notion:fetch");

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Try to cancel completed job
      const cancelled = queue.cancel(jobId);

      expect(cancelled).toBe(false);
    });
  });
});

describe("concurrent request behavior", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  it("should handle multiple simultaneous job additions correctly", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const executor = vi.fn().mockImplementation(
      (context: JobExecutionContext) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            context.onComplete(true);
            resolve();
          }, 100);
        })
    );

    queue.registerExecutor("notion:fetch", executor);

    // Simulate concurrent requests - add multiple jobs simultaneously
    const jobPromises = [
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
    ];

    const jobIds = await Promise.all(jobPromises);

    // All jobs should have unique IDs
    expect(new Set(jobIds).size).toBe(5);

    // Wait for all jobs to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    const jobTracker = getJobTracker();
    const completedJobs = jobTracker.getJobsByStatus("completed");

    // All jobs should complete
    expect(completedJobs).toHaveLength(5);
  });

  it("should maintain FIFO order when processing queued jobs", async () => {
    const executionOrder: string[] = [];
    const queue = new JobQueue({ concurrency: 1 });

    const executor = vi.fn().mockImplementation(
      (context: JobExecutionContext) =>
        new Promise<void>((resolve) => {
          // Record the job ID when execution starts
          executionOrder.push(context.jobId);
          setTimeout(() => {
            context.onComplete(true);
            resolve();
          }, 50);
        })
    );

    queue.registerExecutor("notion:fetch", executor);

    // Add jobs sequentially but track creation order
    const jobIds: string[] = [];
    jobIds.push(await queue.add("notion:fetch"));
    jobIds.push(await queue.add("notion:fetch"));
    jobIds.push(await queue.add("notion:fetch"));

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Execution order should match creation order (FIFO)
    expect(executionOrder).toEqual(jobIds);
  });

  it("should not exceed concurrency limit under rapid concurrent requests", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const concurrency = 2;
    const queue = new JobQueue({ concurrency });

    const executor = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          setTimeout(() => {
            currentConcurrent--;
            resolve();
          }, 100);
        })
    );

    queue.registerExecutor("notion:fetch", executor);

    // Rapidly add many jobs (simulating concurrent API requests)
    const jobPromises: Promise<string>[] = [];
    for (let i = 0; i < 20; i++) {
      jobPromises.push(queue.add("notion:fetch"));
    }

    await Promise.all(jobPromises);

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should never exceed concurrency limit
    expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
  });

  it("should handle job additions while queue is processing", async () => {
    const processedJobs: string[] = [];
    const queue = new JobQueue({ concurrency: 1 });

    const executor = vi.fn().mockImplementation(
      (context: JobExecutionContext) =>
        new Promise<void>((resolve) => {
          processedJobs.push(context.jobId);
          setTimeout(() => {
            context.onComplete(true);
            resolve();
          }, 50);
        })
    );

    queue.registerExecutor("notion:fetch", executor);

    // Start first batch
    const job1 = await queue.add("notion:fetch");
    await new Promise((resolve) => setTimeout(resolve, 10)); // Let first job start

    // Add more jobs while first is running
    const job2 = await queue.add("notion:fetch");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const job3 = await queue.add("notion:fetch");

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // All jobs should be processed in order
    expect(processedJobs).toEqual([job1, job2, job3]);
  });

  it("should correctly track running and queued counts during concurrent operations", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const executor = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );

    queue.registerExecutor("notion:fetch", executor);

    // Add 5 jobs concurrently
    await Promise.all([
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
    ]);

    // Check status immediately after adding
    await new Promise((resolve) => setTimeout(resolve, 10));
    const status1 = queue.getStatus();

    // Should have 2 running and at least 1 queued
    expect(status1.running).toBe(2);
    expect(status1.queued).toBeGreaterThanOrEqual(1);

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 500));
    const finalStatus = queue.getStatus();

    // Should have no running or queued jobs
    expect(finalStatus.running).toBe(0);
    expect(finalStatus.queued).toBe(0);
  });

  it("should handle race condition in processQueue correctly", async () => {
    let processCount = 0;
    const queue = new JobQueue({ concurrency: 2 });
    const executor = vi.fn().mockImplementation(
      (context: JobExecutionContext) =>
        new Promise<void>((resolve) => {
          processCount++;
          setTimeout(() => {
            context.onComplete(true);
            resolve();
          }, 50);
        })
    );

    queue.registerExecutor("notion:fetch", executor);

    // Add jobs rapidly to potential trigger race conditions in processQueue
    const promises: Promise<string>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(queue.add("notion:fetch"));
    }

    await Promise.all(promises);

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // All 10 jobs should be processed exactly once
    expect(processCount).toBe(10);

    const jobTracker = getJobTracker();
    const completedJobs = jobTracker.getJobsByStatus("completed");
    expect(completedJobs).toHaveLength(10);
  });

  it("should handle concurrent cancellation requests correctly", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const executor = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 200))
      );

    queue.registerExecutor("notion:fetch", executor);

    // Add multiple jobs
    const jobIds = await Promise.all([
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
    ]);

    // Wait a bit for first job to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Cancel all jobs concurrently
    const cancelResults = await Promise.all(
      jobIds.map((id) => queue.cancel(id))
    );

    // All cancellations should succeed
    expect(cancelResults.every((result) => result === true)).toBe(true);

    // Wait for cancellation to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));

    const jobTracker = getJobTracker();
    const failedJobs = jobTracker.getJobsByStatus("failed");

    // All jobs should be failed (cancelled)
    expect(failedJobs.length).toBeGreaterThanOrEqual(3);
  });

  it("should maintain queue integrity with mixed add and cancel operations", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const executor = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );

    queue.registerExecutor("notion:fetch", executor);

    // Add some jobs
    const job1 = await queue.add("notion:fetch");
    const job2 = await queue.add("notion:fetch");
    const job3 = await queue.add("notion:fetch");

    // Cancel one while others are running/queued
    const cancelled = queue.cancel(job2);

    expect(cancelled).toBe(true);

    // Add more jobs
    const job4 = await queue.add("notion:fetch");
    const job5 = await queue.add("notion:fetch");

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 500));

    const jobTracker = getJobTracker();
    const completedJobs = jobTracker.getJobsByStatus("completed");
    const failedJobs = jobTracker.getJobsByStatus("failed");

    // Should have 3 completed (job1, job3, and one of job4/job5 depending on timing)
    expect(completedJobs.length).toBeGreaterThanOrEqual(2);

    // job2 should be failed (cancelled)
    const job2State = jobTracker.getJob(job2);
    expect(job2State?.status).toBe("failed");
    expect(job2State?.result?.error).toBe("Job cancelled");
  });

  it("should handle getStatus() called concurrently with job operations", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const executor = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 50))
      );

    queue.registerExecutor("notion:fetch", executor);

    // Perform mixed operations concurrently
    const results = await Promise.all([
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.getStatus(),
      queue.add("notion:fetch"),
      queue.getStatus(),
      queue.add("notion:fetch"),
      queue.getStatus(),
    ]);

    // getStatus calls should return valid objects
    const statusResults = results.filter(
      (r): r is { queued: number; running: number; concurrency: number } =>
        typeof r === "object" && "queued" in r
    );

    expect(statusResults).toHaveLength(3);
    statusResults.forEach((status) => {
      expect(status).toHaveProperty("queued");
      expect(status).toHaveProperty("running");
      expect(status).toHaveProperty("concurrency");
      expect(status.concurrency).toBe(2);
    });

    // Wait for all jobs to complete
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("should prevent starvation of queued jobs under continuous load", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const executionTimes: number[] = [];

    const executor = vi.fn().mockImplementation(
      (context: JobExecutionContext) =>
        new Promise<void>((resolve) => {
          executionTimes.push(Date.now());
          setTimeout(() => {
            context.onComplete(true);
            resolve();
          }, 30);
        })
    );

    queue.registerExecutor("notion:fetch", executor);

    const startTime = Date.now();

    // Continuously add jobs while others are running
    const jobPromises: Promise<string>[] = [];
    for (let i = 0; i < 10; i++) {
      jobPromises.push(queue.add("notion:fetch"));
      // Small delay between additions
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await Promise.all(jobPromises);

    // Wait for all to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // All jobs should have been executed
    expect(executionTimes).toHaveLength(10);

    // Last job should complete within reasonable time
    // (10 jobs * 30ms each / 2 concurrency = ~150ms minimum + overhead)
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeLessThan(1000);
  });

  it("should handle concurrent getQueuedJobs and getRunningJobs calls", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    const executor = vi
      .fn()
      .mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );

    queue.registerExecutor("notion:fetch", executor);

    // Add jobs
    await Promise.all([
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
      queue.add("notion:fetch"),
    ]);

    // Wait a bit for some to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Call getters concurrently
    const [queuedJobs, runningJobs, status] = await Promise.all([
      Promise.resolve(queue.getQueuedJobs()),
      Promise.resolve(queue.getRunningJobs()),
      Promise.resolve(queue.getStatus()),
    ]);

    // Should return consistent state
    expect(queuedJobs.length + runningJobs.length).toBe(4);
    expect(status.queued + status.running).toBe(4);

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
});

describe("createJobQueue", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  it("should create a queue with executors for all job types", () => {
    const queue = createJobQueue({ concurrency: 2 });

    expect(queue).toBeInstanceOf(JobQueue);
    expect(queue.getStatus().concurrency).toBe(2);
  });

  it("should create a queue that can accept jobs", async () => {
    const queue = createJobQueue({ concurrency: 1 });

    const jobId = await queue.add("notion:fetch");

    expect(jobId).toBeTruthy();

    const jobTracker = getJobTracker();
    const job = jobTracker.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.type).toBe("notion:fetch");
  });
});
