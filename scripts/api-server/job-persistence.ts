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
 * Ensure data directory exists with retry logic for race conditions
 */
function ensureDataDir(): void {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (existsSync(DATA_DIR)) {
      return;
    }
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Ignore EEXIST (created by another process) or retry on ENOENT (race condition)
      if (err.code === "EEXIST") {
        return;
      }
      if (err.code === "ENOENT" && attempt < maxRetries - 1) {
        // Brief delay before retry
        const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait for very short delays
        }
        continue;
      }
      throw error;
    }
  }
}

/**
 * Load jobs from file with retry logic for concurrent access
 */
function loadJobs(): JobStorage {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      ensureDataDir();

      if (!existsSync(JOBS_FILE)) {
        return { jobs: [] };
      }

      const data = readFileSync(JOBS_FILE, "utf-8");
      return JSON.parse(data) as JobStorage;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Retry on ENOENT (race condition), EBUSY (file locked), or parse errors
      if (
        (err.code === "ENOENT" ||
          err.code === "EBUSY" ||
          err.code === "EACCES" ||
          err instanceof SyntaxError) &&
        attempt < maxRetries - 1
      ) {
        const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms, 80ms
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait for very short delays
        }
        continue;
      }
      // On final attempt or unrecoverable error, return empty storage
      if (err instanceof SyntaxError) {
        // File corrupted, return empty
        return { jobs: [] };
      }
      if (err.code === "ENOENT") {
        // File doesn't exist yet
        return { jobs: [] };
      }
      throw error;
    }
  }
  return { jobs: [] };
}

/**
 * Save jobs to file with retry logic for concurrent access
 */
function saveJobs(storage: JobStorage): void {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      ensureDataDir();
      writeFileSync(JOBS_FILE, JSON.stringify(storage, null, 2), "utf-8");
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Retry on ENOENT (directory disappeared) or EBUSY (file locked)
      if (
        (err.code === "ENOENT" ||
          err.code === "EBUSY" ||
          err.code === "EACCES") &&
        attempt < maxRetries - 1
      ) {
        const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms, 80ms
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait for very short delays
        }
        continue;
      }
      throw error;
    }
  }
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
 * Append a log entry to the log file with retry logic for concurrent access
 */
export function appendLog(entry: JobLogEntry): void {
  const maxRetries = 5;
  const logLine = JSON.stringify(entry) + "\n";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      ensureDataDir();
      appendFileSync(LOGS_FILE, logLine, "utf-8");
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Retry on ENOENT (directory disappeared) or EBUSY (file locked)
      if (
        (err.code === "ENOENT" ||
          err.code === "EBUSY" ||
          err.code === "EACCES") &&
        attempt < maxRetries - 1
      ) {
        const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms, 80ms
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait for very short delays
        }
        continue;
      }
      throw error;
    }
  }
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
 * Get logs for a specific job with retry logic for concurrent access
 */
export function getJobLogs(jobId: string): JobLogEntry[] {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      ensureDataDir();

      if (!existsSync(LOGS_FILE)) {
        return [];
      }

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
          (entry): entry is JobLogEntry =>
            entry !== null && entry.jobId === jobId
        );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Retry on ENOENT, EBUSY, or EACCES
      if (
        (err.code === "ENOENT" ||
          err.code === "EBUSY" ||
          err.code === "EACCES") &&
        attempt < maxRetries - 1
      ) {
        const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms, 80ms
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait for very short delays
        }
        continue;
      }
      // On final attempt or unrecoverable error, return empty array
      return [];
    }
  }
  return [];
}

/**
 * Get recent logs (all jobs) with retry logic for concurrent access
 */
export function getRecentLogs(limit = 100): JobLogEntry[] {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      ensureDataDir();

      if (!existsSync(LOGS_FILE)) {
        return [];
      }

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
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      // Retry on ENOENT, EBUSY, or EACCES
      if (
        (err.code === "ENOENT" ||
          err.code === "EBUSY" ||
          err.code === "EACCES") &&
        attempt < maxRetries - 1
      ) {
        const delay = Math.pow(2, attempt) * 10; // 10ms, 20ms, 40ms, 80ms
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait for very short delays
        }
        continue;
      }
      // On final attempt or unrecoverable error, return empty array
      return [];
    }
  }
  return [];
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
