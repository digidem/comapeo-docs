/**
 * Job tracking system for Notion API server
 * Manages job state in memory with file-based persistence
 */

import {
  saveJob,
  loadJob,
  loadAllJobs,
  deleteJob as deletePersistedJob,
} from "./job-persistence";

export type JobType =
  | "notion:fetch"
  | "notion:fetch-all"
  | "notion:translate"
  | "notion:status-translation"
  | "notion:status-draft"
  | "notion:status-publish"
  | "notion:status-publish-production";

export type JobStatus = "pending" | "running" | "completed" | "failed";

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
  };
}

class JobTracker {
  private jobs: Map<string, Job> = new Map();
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
      const job: Job = {
        id: persistedJob.id,
        type: persistedJob.type as JobType,
        status: persistedJob.status as JobStatus,
        createdAt: new Date(persistedJob.createdAt),
        startedAt: persistedJob.startedAt
          ? new Date(persistedJob.startedAt)
          : undefined,
        completedAt: persistedJob.completedAt
          ? new Date(persistedJob.completedAt)
          : undefined,
        progress: persistedJob.progress,
        result: persistedJob.result,
      };
      this.jobs.set(job.id, job);
    }
  }

  /**
   * Create a new job
   */
  createJob(type: JobType): string {
    const id = this.generateJobId();
    const job: Job = {
      id,
      type,
      status: "pending",
      createdAt: new Date(),
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
    const persistedJob = {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      progress: job.progress,
      result: job.result,
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
