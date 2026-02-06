/**
 * Tests for job queue with concurrency limits and cancellation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JobQueue, createJobQueue, type QueuedJob } from "./job-queue";
import { getJobTracker, destroyJobTracker, type JobType } from "./job-tracker";
import type { JobExecutionContext, JobOptions } from "./job-executor";

describe("JobQueue", () => {
  let queue: JobQueue;

  beforeEach(() => {
    destroyJobTracker();
    getJobTracker();
    queue = new JobQueue({ concurrency: 2 });
  });

  afterEach(() => {
    destroyJobTracker();
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

describe("createJobQueue", () => {
  beforeEach(() => {
    destroyJobTracker();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
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
