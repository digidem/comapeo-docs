/**
 * Minimal job queue with concurrency limits and cancellation
 */

import type { JobType } from "./job-tracker";
import { getJobTracker } from "./job-tracker";
import {
  executeJob,
  type JobExecutionContext,
  type JobOptions,
} from "./job-executor";

export interface QueuedJob {
  id: string;
  type: JobType;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  abortController: AbortController;
}

export interface JobQueueOptions {
  concurrency: number;
}

type JobExecutor = (
  context: JobExecutionContext,
  signal: AbortSignal
) => Promise<void>;

/**
 * Minimal job queue with concurrency limits and cancellation support
 */
export class JobQueue {
  private queue: QueuedJob[] = [];
  private running: Map<string, QueuedJob> = new Map();
  private concurrency: number;
  private executors: Map<JobType, JobExecutor> = new Map();
  private pendingJobs: Set<Promise<void>> = new Set();

  constructor(options: JobQueueOptions) {
    this.concurrency = options.concurrency;
  }

  /**
   * Register an executor function for a job type
   */
  registerExecutor(jobType: JobType, executor: JobExecutor): void {
    this.executors.set(jobType, executor);
  }

  /**
   * Add a job to the queue
   */
  async add(jobType: JobType, options: JobOptions = {}): Promise<string> {
    const jobTracker = getJobTracker();
    const jobId = jobTracker.createJob(jobType);

    const abortController = new AbortController();
    const queuedJob: QueuedJob = {
      id: jobId,
      type: jobType,
      status: "queued",
      createdAt: new Date(),
      abortController,
    };

    this.queue.push(queuedJob);
    this.processQueue();

    return jobId;
  }

  /**
   * Cancel a job by ID
   */
  cancel(jobId: string): boolean {
    // Check if job is in queue
    const queueIndex = this.queue.findIndex((job) => job.id === jobId);
    if (queueIndex !== -1) {
      // eslint-disable-next-line security/detect-object-injection -- queueIndex is from findIndex, safe to use
      const job = this.queue[queueIndex];
      if (!job) {
        return false;
      }
      job.status = "cancelled";
      job.completedAt = new Date();
      this.queue.splice(queueIndex, 1);

      const jobTracker = getJobTracker();
      jobTracker.updateJobStatus(jobId, "failed", {
        success: false,
        error: "Job cancelled",
      });

      return true;
    }

    // Check if job is running
    const runningJob = this.running.get(jobId);
    if (runningJob) {
      runningJob.status = "cancelled";
      runningJob.completedAt = new Date();
      runningJob.abortController.abort();

      const jobTracker = getJobTracker();
      jobTracker.updateJobStatus(jobId, "failed", {
        success: false,
        error: "Job cancelled",
      });

      return true;
    }

    return false;
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queued: number;
    running: number;
    concurrency: number;
  } {
    return {
      queued: this.queue.length,
      running: this.running.size,
      concurrency: this.concurrency,
    };
  }

  /**
   * Get all queued jobs
   */
  getQueuedJobs(): QueuedJob[] {
    return [...this.queue];
  }

  /**
   * Get all running jobs
   */
  getRunningJobs(): QueuedJob[] {
    return Array.from(this.running.values());
  }

  /**
   * Process the queue, starting jobs up to concurrency limit
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.running.size < this.concurrency) {
      const queuedJob = this.queue.shift();
      if (!queuedJob) {
        break;
      }

      this.startJob(queuedJob);
    }
  }

  /**
   * Start a single job
   */
  private startJob(queuedJob: QueuedJob): void {
    const executor = this.executors.get(queuedJob.type);
    if (!executor) {
      queuedJob.status = "failed";
      queuedJob.completedAt = new Date();

      const jobTracker = getJobTracker();
      jobTracker.updateJobStatus(queuedJob.id, "failed", {
        success: false,
        error: `No executor registered for job type: ${queuedJob.type}`,
      });

      this.processQueue();
      return;
    }

    queuedJob.status = "running";
    queuedJob.startedAt = new Date();
    this.running.set(queuedJob.id, queuedJob);

    const jobTracker = getJobTracker();
    jobTracker.updateJobStatus(queuedJob.id, "running");

    const context: JobExecutionContext = {
      jobId: queuedJob.id,
      onProgress: (current, total, message) => {
        jobTracker.updateJobProgress(queuedJob.id, current, total, message);
      },
      onComplete: (success, data, error) => {
        this.finishJob(queuedJob, success, data, error);
      },
    };

    // Execute the job with abort signal
    const jobPromise = executor(context, queuedJob.abortController.signal)
      .then(() => {
        // If not cancelled or failed already, mark as completed
        if (queuedJob.status === "running") {
          this.finishJob(queuedJob, true);
        }
        return undefined;
      })
      .catch((error) => {
        // If not cancelled, mark as failed
        if (queuedJob.status === "running") {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.finishJob(queuedJob, false, undefined, errorMessage);
        }
      })
      .finally(() => {
        this.pendingJobs.delete(jobPromise);
        this.processQueue();
      });

    // Track the promise for teardown
    this.pendingJobs.add(jobPromise);
  }

  /**
   * Finish a job and remove from running set
   */
  private finishJob(
    queuedJob: QueuedJob,
    success: boolean,
    data?: unknown,
    error?: string
  ): void {
    if (queuedJob.status === "cancelled") {
      return;
    }

    queuedJob.status = success ? "completed" : "failed";
    queuedJob.completedAt = new Date();
    this.running.delete(queuedJob.id);

    const jobTracker = getJobTracker();
    jobTracker.updateJobStatus(queuedJob.id, success ? "completed" : "failed", {
      success,
      data,
      error,
    });
  }

  /**
   * Wait for all pending jobs to complete and clean up
   * Call this before destroying the queue to ensure proper cleanup
   */
  async awaitTeardown(): Promise<void> {
    // Wait for all pending jobs to complete
    const promises = Array.from(this.pendingJobs);
    await Promise.allSettled(promises);

    // Clear the pending jobs set
    this.pendingJobs.clear();

    // Cancel any remaining queued jobs
    for (const job of this.queue) {
      job.abortController.abort();
    }
    this.queue = [];

    // Cancel any remaining running jobs
    for (const job of this.running.values()) {
      job.abortController.abort();
    }
    this.running.clear();
  }
}

/**
 * Create a job queue with the default executor using the executeJob function
 */
export function createJobQueue(options: JobQueueOptions): JobQueue {
  const queue = new JobQueue(options);

  // Register executors for each job type
  const jobTypes: JobType[] = [
    "notion:fetch",
    "notion:fetch-all",
    "notion:count-pages",
    "notion:translate",
    "notion:status-translation",
    "notion:status-draft",
    "notion:status-publish",
    "notion:status-publish-production",
  ];

  for (const jobType of jobTypes) {
    queue.registerExecutor(jobType, async (context, signal) => {
      if (signal.aborted) {
        throw new Error("Job cancelled before starting");
      }

      const abortPromise = new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("Job cancelled"));
        });
      });

      await Promise.race([
        executeJob(jobType, context, {} as JobOptions),
        abortPromise,
      ]);
    });
  }

  return queue;
}
