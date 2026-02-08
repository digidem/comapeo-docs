/**
 * Test utilities for deterministic test isolation
 * Provides per-test temporary directories and cleanup
 */

import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Test environment configuration for isolated persistence paths
 */
export interface TestEnvironment {
  /** Unique temporary directory for this test */
  tempDir: string;
  /** Path to jobs.json file */
  jobsFile: string;
  /** Path to jobs.log file */
  logsFile: string;
  /** Clean up the test environment */
  cleanup: () => void;
}

/**
 * Global state for persistence path overrides
 */
let originalDataDir: string | undefined;
let originalJobsFile: string | undefined;
let originalLogsFile: string | undefined;

/**
 * Set up a test environment with an isolated temporary directory
 * Creates a unique temp directory and overrides persistence paths
 *
 * @returns Test environment configuration with cleanup function
 */
export function setupTestEnvironment(): TestEnvironment {
  // Create unique temp directory for this test
  const testId = randomBytes(8).toString("hex");
  const tempDir = join(tmpdir(), `comapeo-test-${testId}`);

  mkdirSync(tempDir, { recursive: true });

  const jobsFile = join(tempDir, "jobs.json");
  const logsFile = join(tempDir, "jobs.log");

  // Override global DATA_DIR, JOBS_FILE, and LOGS_FILE
  // This is done by setting environment variables that the persistence module reads
  process.env.JOBS_DATA_DIR = tempDir;
  process.env.JOBS_DATA_FILE = jobsFile;
  process.env.JOBS_LOG_FILE = logsFile;

  return {
    tempDir,
    jobsFile,
    logsFile,
    cleanup: () => {
      // Remove the temp directory
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }

      // Clear environment overrides
      delete process.env.JOBS_DATA_DIR;
      delete process.env.JOBS_DATA_FILE;
      delete process.env.JOBS_LOG_FILE;
    },
  };
}

/**
 * Legacy cleanup function for backward compatibility
 * @deprecated Use setupTestEnvironment() instead
 */
export function cleanupTestData(): void {
  const dataDir =
    process.env.JOBS_DATA_DIR || join(process.cwd(), ".jobs-data");
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/**
 * Wait for all pending microtasks to complete
 * Useful for ensuring async operations have settled
 */
export async function settleAsync(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(() => {
      setImmediate(resolve);
    });
  });
}

/**
 * Run a function with an isolated test environment
 * Automatically cleans up after the function completes
 *
 * @param fn - Function to run with isolated environment
 * @returns Result of the function
 */
export async function withTestEnvironment<T>(
  fn: (env: TestEnvironment) => T | Promise<T>
): Promise<T> {
  const env = setupTestEnvironment();
  try {
    return await fn(env);
  } finally {
    env.cleanup();
  }
}
