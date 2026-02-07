/**
 * Job persistence and log capture for observability
 * Provides simple file-based persistence for job status and logs
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";

export interface JobLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  jobId: string;
  message: string;
  data?: unknown;
}

export interface GitHubContext {
  owner: string;
  repo: string;
  sha: string;
  token: string;
  context?: string;
  targetUrl?: string;
}

export interface PersistedJob {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
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
  github?: GitHubContext;
  githubStatusReported?: boolean;
}

export interface JobStorage {
  jobs: PersistedJob[];
}

const DATA_DIR = join(process.cwd(), ".jobs-data");
const JOBS_FILE = join(DATA_DIR, "jobs.json");
const LOGS_FILE = join(DATA_DIR, "jobs.log");

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch (error) {
      // Ignore error if directory was created by another process
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}

/**
 * Load jobs from file
 */
function loadJobs(): JobStorage {
  ensureDataDir();

  if (!existsSync(JOBS_FILE)) {
    return { jobs: [] };
  }

  try {
    const data = readFileSync(JOBS_FILE, "utf-8");
    return JSON.parse(data) as JobStorage;
  } catch {
    return { jobs: [] };
  }
}

/**
 * Save jobs to file
 */
function saveJobs(storage: JobStorage): void {
  ensureDataDir();
  writeFileSync(JOBS_FILE, JSON.stringify(storage, null, 2), "utf-8");
}

/**
 * Save a job to persistent storage
 */
export function saveJob(job: PersistedJob): void {
  const storage = loadJobs();

  const existingIndex = storage.jobs.findIndex((j) => j.id === job.id);
  if (existingIndex !== -1) {
    // eslint-disable-next-line security/detect-object-injection -- existingIndex is from findIndex, not user input
    storage.jobs[existingIndex] = job;
  } else {
    storage.jobs.push(job);
  }

  saveJobs(storage);
}

/**
 * Load a job from persistent storage
 */
export function loadJob(id: string): PersistedJob | undefined {
  const storage = loadJobs();
  return storage.jobs.find((j) => j.id === id);
}

/**
 * Load all jobs from persistent storage
 */
export function loadAllJobs(): PersistedJob[] {
  const storage = loadJobs();
  return storage.jobs;
}

/**
 * Delete a job from persistent storage
 */
export function deleteJob(id: string): boolean {
  const storage = loadJobs();
  const index = storage.jobs.findIndex((j) => j.id === id);

  if (index === -1) {
    return false;
  }

  storage.jobs.splice(index, 1);
  saveJobs(storage);
  return true;
}

/**
 * Append a log entry to the log file
 */
export function appendLog(entry: JobLogEntry): void {
  ensureDataDir();
  const logLine = JSON.stringify(entry) + "\n";
  appendFileSync(LOGS_FILE, logLine, "utf-8");
}

/**
 * Create a logger for a specific job
 */
export interface JobLogger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
}

export function createJobLogger(jobId: string): JobLogger {
  return {
    info: (message: string, data?: unknown) => {
      const entry: JobLogEntry = {
        timestamp: new Date().toISOString(),
        level: "info",
        jobId,
        message,
        data,
      };
      appendLog(entry);
      console.log(`[Job ${jobId}] ${message}`, data ?? "");
    },
    warn: (message: string, data?: unknown) => {
      const entry: JobLogEntry = {
        timestamp: new Date().toISOString(),
        level: "warn",
        jobId,
        message,
        data,
      };
      appendLog(entry);
      console.warn(`[Job ${jobId}] ${message}`, data ?? "");
    },
    error: (message: string, data?: unknown) => {
      const entry: JobLogEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        jobId,
        message,
        data,
      };
      appendLog(entry);
      console.error(`[Job ${jobId}] ${message}`, data ?? "");
    },
    debug: (message: string, data?: unknown) => {
      const entry: JobLogEntry = {
        timestamp: new Date().toISOString(),
        level: "debug",
        jobId,
        message,
        data,
      };
      appendLog(entry);
      if (process.env.DEBUG) {
        console.debug(`[Job ${jobId}] ${message}`, data ?? "");
      }
    },
  };
}

/**
 * Get logs for a specific job
 */
export function getJobLogs(jobId: string): JobLogEntry[] {
  ensureDataDir();

  if (!existsSync(LOGS_FILE)) {
    return [];
  }

  try {
    const logContent = readFileSync(LOGS_FILE, "utf-8");
    const lines = logContent.trim().split("\n");

    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as JobLogEntry;
        } catch {
          return null;
        }
      })
      .filter(
        (entry): entry is JobLogEntry => entry !== null && entry.jobId === jobId
      );
  } catch {
    return [];
  }
}

/**
 * Get recent logs (all jobs)
 */
export function getRecentLogs(limit = 100): JobLogEntry[] {
  ensureDataDir();

  if (!existsSync(LOGS_FILE)) {
    return [];
  }

  try {
    const logContent = readFileSync(LOGS_FILE, "utf-8");
    const lines = logContent.trim().split("\n");

    const entries: JobLogEntry[] = lines
      .map((line) => {
        try {
          return JSON.parse(line) as JobLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is JobLogEntry => entry !== null);

    // Return last `limit` entries
    return entries.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Clean up old completed/failed jobs from storage
 */
export function cleanupOldJobs(maxAge = 24 * 60 * 60 * 1000): number {
  const storage = loadJobs();
  const now = Date.now();
  const initialCount = storage.jobs.length;

  storage.jobs = storage.jobs.filter((job) => {
    // Keep pending or running jobs
    if (job.status === "pending" || job.status === "running") {
      return true;
    }

    // Keep recently completed/failed jobs
    if (job.completedAt) {
      const completedTime = new Date(job.completedAt).getTime();
      return now - completedTime < maxAge;
    }

    return true;
  });

  const removedCount = initialCount - storage.jobs.length;

  if (removedCount > 0) {
    saveJobs(storage);
  }

  return removedCount;
}
