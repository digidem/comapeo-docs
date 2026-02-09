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
  statSync,
  renameSync,
  unlinkSync,
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

/**
 * Get maximum log file size in bytes from environment or use default (10MB)
 */
function getMaxLogSize(): number {
  const envSize = process.env.MAX_LOG_SIZE_MB;
  if (envSize) {
    const parsed = parseFloat(envSize);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.round(parsed * 1024 * 1024); // Convert MB to bytes
    }
  }
  return 10 * 1024 * 1024; // Default: 10MB
}

/**
 * Get maximum number of stored jobs from environment or use default (1000)
 */
function getMaxStoredJobs(): number {
  const envMax = process.env.MAX_STORED_JOBS;
  if (envMax) {
    const parsed = parseInt(envMax, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 1000; // Default: 1000 jobs
}

/**
 * Get data directory from environment or use default
 * Allows tests to override with isolated temp directories
 */
function getDataDir(): string {
  return process.env.JOBS_DATA_DIR || join(process.cwd(), ".jobs-data");
}

/**
 * Get jobs file path from environment or use default
 */
function getJobsFile(): string {
  return process.env.JOBS_DATA_FILE || join(getDataDir(), "jobs.json");
}

/**
 * Get logs file path from environment or use default
 */
function getLogsFile(): string {
  return process.env.JOBS_LOG_FILE || join(getDataDir(), "jobs.log");
}

/**
 * Rotate log file if it exceeds the maximum size
 * Keeps up to 3 rotated files: file.log.1, file.log.2, file.log.3
 * Older files are deleted
 */
export function rotateLogIfNeeded(
  filePath: string,
  maxSizeBytes: number
): void {
  try {
    // Check if file exists and its size
    if (!existsSync(filePath)) {
      return; // Nothing to rotate
    }

    const stats = statSync(filePath);
    if (stats.size < maxSizeBytes) {
      return; // File is below size limit
    }

    // Rotate existing files: .log.2 -> .log.3, .log.1 -> .log.2
    for (let i = 3; i > 0; i--) {
      const rotatedFile = `${filePath}.${i}`;
      if (i === 3) {
        // Delete the oldest rotated file if it exists
        if (existsSync(rotatedFile)) {
          unlinkSync(rotatedFile);
        }
      } else {
        // Rename .log.{i} to .log.{i+1}
        if (existsSync(rotatedFile)) {
          renameSync(rotatedFile, `${filePath}.${i + 1}`);
        }
      }
    }

    // Rename current log to .log.1
    renameSync(filePath, `${filePath}.1`);
  } catch (error) {
    // Log error but don't crash - rotation is best-effort
    console.error(`Failed to rotate log file ${filePath}:`, error);
  }
}

/**
 * Ensure data directory exists with retry logic for race conditions
 */
function ensureDataDir(): void {
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (existsSync(getDataDir())) {
      return;
    }
    try {
      mkdirSync(getDataDir(), { recursive: true });
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

      if (!existsSync(getJobsFile())) {
        return { jobs: [] };
      }

      const data = readFileSync(getJobsFile(), "utf-8");
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
      writeFileSync(getJobsFile(), JSON.stringify(storage, null, 2), "utf-8");
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

      // Rotate log file if needed before appending
      const logsFile = getLogsFile();
      rotateLogIfNeeded(logsFile, getMaxLogSize());

      appendFileSync(logsFile, logLine, "utf-8");
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

      if (!existsSync(getLogsFile())) {
        return [];
      }

      const logContent = readFileSync(getLogsFile(), "utf-8");
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

      if (!existsSync(getLogsFile())) {
        return [];
      }

      const logContent = readFileSync(getLogsFile(), "utf-8");
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
 * First removes jobs older than maxAge, then enforces max jobs cap
 */
export function cleanupOldJobs(maxAge = 24 * 60 * 60 * 1000): number {
  const storage = loadJobs();
  const now = Date.now();
  const initialCount = storage.jobs.length;

  // Step 1: Remove jobs older than maxAge
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

  // Step 2: Enforce max jobs cap if still too many
  const maxStoredJobs = getMaxStoredJobs();
  if (storage.jobs.length > maxStoredJobs) {
    // Sort by completion time (oldest first)
    // Keep pending/running jobs, remove oldest completed/failed jobs
    const pendingOrRunning = storage.jobs.filter(
      (job) => job.status === "pending" || job.status === "running"
    );
    const completedOrFailed = storage.jobs
      .filter((job) => job.status !== "pending" && job.status !== "running")
      .sort((a, b) => {
        const timeA = a.completedAt
          ? new Date(a.completedAt).getTime()
          : a.createdAt
            ? new Date(a.createdAt).getTime()
            : 0;
        const timeB = b.completedAt
          ? new Date(b.completedAt).getTime()
          : b.createdAt
            ? new Date(b.createdAt).getTime()
            : 0;
        return timeB - timeA; // Sort newest first
      });

    // Keep only the newest jobs up to the limit
    const slotsAvailable = maxStoredJobs - pendingOrRunning.length;
    storage.jobs = [
      ...pendingOrRunning,
      ...completedOrFailed.slice(0, Math.max(0, slotsAvailable)),
    ];
  }

  const removedCount = initialCount - storage.jobs.length;

  if (removedCount > 0) {
    saveJobs(storage);
  }

  return removedCount;
}
