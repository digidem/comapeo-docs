/**
 * Job tracking system for Notion API server
 * Manages job state in memory with file-based persistence
 */

import {
  saveJob,
  loadAllJobs,
  deleteJob as deletePersistedJob,
  type PersistedJob,
} from "./job-persistence";
import type { FetchJobError, FetchJobWarning } from "./response-schemas";

export type JobType =
  | "fetch-ready"
  | "fetch-all"
  | "notion:fetch"
  | "notion:fetch-all"
  | "notion:count-pages"
  | "notion:translate"
  | "notion:status-translation"
  | "notion:status-draft"
  | "notion:status-publish"
  | "notion:status-publish-production";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface GitHubContext {
  owner: string;
  repo: string;
  sha: string;
  token: string;
  context?: string;
  targetUrl?: string;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: {
    current: number;
    total: number;
    message: string;
  };
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
    output?: string;
    commitHash?: string | null;
    failedPageIds?: string[];
    warnings?: FetchJobWarning[];
    counters?: {
      pagesProcessed?: number;
      pagesSkipped?: number;
      pagesTransitioned?: number;
    };
    errorEnvelope?: FetchJobError;
  };
  terminal?: {
    pagesProcessed?: number;
    pagesSkipped?: number;
    pagesTransitioned?: number;
    commitHash?: string | null;
    failedPageIds?: string[];
    warnings?: FetchJobWarning[];
    dryRun?: boolean;
    error?: FetchJobError;
  };
  github?: GitHubContext;
  githubStatusReported?: boolean;
}

function isFetchJobType(
  jobType: JobType
): jobType is "fetch-ready" | "fetch-all" {
  return jobType === "fetch-ready" || jobType === "fetch-all";
}

function createLostJobTerminal(type: JobType): Job["terminal"] {
  if (!isFetchJobType(type)) {
    return undefined;
  }
  return {
    pagesProcessed: 0,
    pagesSkipped: 0,
    commitHash: null,
    failedPageIds: [],
    warnings: [],
    error: {
      code: "UNKNOWN",
      message: "Job was in-flight when API server restarted",
    },
  };
}

class JobTracker {
  private jobs: Map<string, Job> = new Map();
  private processes: Map<string, { kill: () => void }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Load persisted jobs on initialization
    this.loadPersistedJobs();

    // Clean up old jobs every hour
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldJobs();
      },
      60 * 60 * 1000
    );
  }

  /**
   * Load jobs from persistent storage into memory
   */
  private loadPersistedJobs(): void {
    const persistedJobs = loadAllJobs();
    for (const persistedJob of persistedJobs) {
      const wasInFlight =
        persistedJob.status === "pending" || persistedJob.status === "running";
      const job: Job = {
        id: persistedJob.id,
        type: persistedJob.type as JobType,
        status: wasInFlight ? "failed" : (persistedJob.status as JobStatus),
        createdAt: new Date(persistedJob.createdAt),
        startedAt: persistedJob.startedAt
          ? new Date(persistedJob.startedAt)
          : undefined,
        completedAt: persistedJob.completedAt
          ? new Date(persistedJob.completedAt)
          : undefined,
        progress: persistedJob.progress,
        result: persistedJob.result,
        terminal: persistedJob.terminal,
        github: persistedJob.github as GitHubContext | undefined,
        githubStatusReported: persistedJob.githubStatusReported,
      };

      if (wasInFlight) {
        job.completedAt = new Date();
        job.result = {
          ...(job.result ?? {}),
          success: false,
          error: "Job lost after API server restart",
          errorEnvelope: {
            code: "UNKNOWN",
            message: "Job was in-flight when API server restarted",
          },
        };
        if (isFetchJobType(job.type)) {
          job.terminal = {
            ...createLostJobTerminal(job.type),
            ...(job.terminal ?? {}),
            error: {
              code: "UNKNOWN",
              message: "Job was in-flight when API server restarted",
            },
          };
        }
      }

      this.jobs.set(job.id, job);
      if (wasInFlight) {
        this.persistJob(job);
      }
    }
  }

  /**
   * Create a new job
   */
  createJob(type: JobType, github?: GitHubContext): string {
    const id = this.generateJobId();
    const job: Job = {
      id,
      type,
      status: "pending",
      createdAt: new Date(),
      github,
    };

    this.jobs.set(id, job);
    this.persistJob(job);
    return id;
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * Update job status
   */
  updateJobStatus(id: string, status: JobStatus, result?: Job["result"]): void {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }

    // Prevent a completed/failed result from overwriting a cancelled job
    if (
      job.status === "failed" &&
      job.result?.error === "Job cancelled by user" &&
      (status === "completed" || status === "failed")
    ) {
      return;
    }

    job.status = status;

    if (status === "running" && !job.startedAt) {
      job.startedAt = new Date();
    }

    if (status === "completed" || status === "failed") {
      job.completedAt = new Date();
      if (result) {
        job.result = result;
      }
    }

    this.persistJob(job);
  }

  setTerminalState(id: string, terminal: Job["terminal"]): void {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }
    job.terminal = terminal;
    this.persistJob(job);
  }

  /**
   * Mark GitHub status as reported for a job
   */
  markGitHubStatusReported(id: string): void {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }
    job.githubStatusReported = true;
    this.persistJob(job);
  }

  /**
   * Check if GitHub status has been reported for a job
   */
  isGitHubStatusReported(id: string): boolean {
    const job = this.jobs.get(id);
    return job?.githubStatusReported === true;
  }

  /**
   * Clear the GitHub status reported flag (allows retry after failure)
   */
  clearGitHubStatusReported(id: string): void {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }
    job.githubStatusReported = false;
    this.persistJob(job);
  }

  /**
   * Update job progress
   */
  updateJobProgress(
    id: string,
    current: number,
    total: number,
    message: string
  ): void {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }

    job.progress = {
      current,
      total,
      message,
    };

    this.persistJob(job);
  }

  /**
   * Register a child process handle for a running job so it can be killed on cancellation
   */
  registerProcess(id: string, proc: { kill: () => void }): void {
    this.processes.set(id, proc);
  }

  /**
   * Unregister a child process handle (called when the process exits)
   */
  unregisterProcess(id: string): void {
    this.processes.delete(id);
  }

  /**
   * Cancel a running job: kill the process and mark as failed
   * Returns true if the job was cancelled, false if it could not be cancelled
   */
  cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

    if (job.status !== "pending" && job.status !== "running") {
      return false;
    }

    // Kill the spawned process if one is registered
    const proc = this.processes.get(id);
    if (proc) {
      proc.kill();
      this.processes.delete(id);
    }

    // Mark as failed with cancellation reason
    job.status = "failed";
    job.completedAt = new Date();
    job.result = {
      success: false,
      error: "Job cancelled by user",
    };
    this.persistJob(job);

    return true;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get jobs by type
   */
  getJobsByType(type: JobType): Job[] {
    return this.getAllJobs().filter((job) => job.type === type);
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): Job[] {
    return this.getAllJobs().filter((job) => job.status === status);
  }

  /**
   * Delete a job
   */
  deleteJob(id: string): boolean {
    const deleted = this.jobs.delete(id);
    if (deleted) {
      deletePersistedJob(id);
    }
    return deleted;
  }

  /**
   * Persist a job to storage
   */
  private persistJob(job: Job): void {
    const persistedJob: PersistedJob = {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      progress: job.progress,
      result: job.result,
      terminal: job.terminal,
      github: job.github,
      githubStatusReported: job.githubStatusReported,
    };
    saveJob(persistedJob);
  }

  /**
   * Clean up old completed/failed jobs older than 24 hours
   */
  private cleanupOldJobs(): void {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const [id, job] of this.jobs.entries()) {
      if (
        (job.status === "completed" || job.status === "failed") &&
        job.completedAt &&
        job.completedAt < twentyFourHoursAgo
      ) {
        this.jobs.delete(id);
        deletePersistedJob(id);
      }
    }
  }

  /**
   * Generate a unique job ID
   */
  private generateJobId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
let jobTrackerInstance: JobTracker | null = null;

export function getJobTracker(): JobTracker {
  if (!jobTrackerInstance) {
    jobTrackerInstance = new JobTracker();
  }
  return jobTrackerInstance;
}

export function destroyJobTracker(): void {
  if (jobTrackerInstance) {
    jobTrackerInstance.destroy();
    jobTrackerInstance = null;
  }
}
