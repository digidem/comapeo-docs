/**
 * Job executor for Notion jobs
 * Executes various Notion-related jobs and reports progress
 */

import { spawn, ChildProcess } from "node:child_process";
import type { JobType, JobStatus, GitHubContext } from "./job-tracker";
import { getJobTracker } from "./job-tracker";
import { createJobLogger, type JobLogger } from "./job-persistence";
import { reportJobCompletion } from "./github-status";

/**
 * Whitelist of environment variables that child processes are allowed to access.
 * Only variables necessary for Notion scripts and runtime resolution are included.
 * Sensitive vars like API_KEY_*, GITHUB_TOKEN are explicitly excluded.
 */
const CHILD_ENV_WHITELIST = [
  // Notion API configuration
  "NOTION_API_KEY",
  "DATABASE_ID",
  "NOTION_DATABASE_ID",
  "DATA_SOURCE_ID",
  // OpenAI configuration (for translations)
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  // Application configuration
  "DEFAULT_DOCS_PAGE",
  "NODE_ENV",
  // Runtime resolution (required for bun/node to work correctly)
  "PATH",
  "HOME",
  "BUN_INSTALL",
  // Locale configuration
  "LANG",
  "LC_ALL",
] as const;

/**
 * Build a filtered environment object for child processes.
 * Only includes whitelisted variables from the parent process.env.
 * This prevents sensitive variables (API_KEY_*, GITHUB_TOKEN, etc.) from being passed to children.
 */
function buildChildEnv(): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};

  for (const key of CHILD_ENV_WHITELIST) {
    // eslint-disable-next-line security/detect-object-injection
    const value = process.env[key];
    if (value !== undefined) {
      // eslint-disable-next-line security/detect-object-injection
      childEnv[key] = value;
    }
  }

  return childEnv;
}

export interface JobExecutionContext {
  jobId: string;
  onProgress: (current: number, total: number, message: string) => void;
  onComplete: (success: boolean, data?: unknown, error?: string) => void;
  github?: GitHubContext;
  startTime?: number;
}

export interface JobOptions {
  maxPages?: number;
  statusFilter?: string;
  force?: boolean;
  dryRun?: boolean;
  includeRemoved?: boolean;
}

/**
 * Default timeout for jobs (5 minutes) in milliseconds
 */
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Time to wait after SIGTERM before sending SIGKILL (5 seconds)
 */
const SIGKILL_DELAY_MS = 5000;

/**
 * Parse and validate JOB_TIMEOUT_MS environment variable override.
 * Returns a finite positive integer, or the fallback value if invalid.
 *
 * @param envValue - The value from process.env.JOB_TIMEOUT_MS
 * @param fallback - The default timeout to use if env value is invalid
 * @returns A valid timeout in milliseconds
 */
function parseTimeoutOverride(
  envValue: string | undefined,
  fallback: number
): number {
  // If no override, use fallback
  if (envValue === undefined) {
    return fallback;
  }

  // Parse as integer (base 10)
  const parsed = parseInt(envValue, 10);

  // Validate: must be finite, positive integer
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `Invalid JOB_TIMEOUT_MS value: "${envValue}". ` +
        `Must be a positive integer. Using fallback: ${fallback}ms`
    );
    return fallback;
  }

  return parsed;
}

/**
 * Map of job types to their Bun script commands and timeout configuration
 */
export const JOB_COMMANDS: Record<
  JobType,
  {
    script: string;
    args: string[];
    buildArgs?: (options: JobOptions) => string[];
    timeoutMs: number;
  }
> = {
  "notion:fetch": {
    script: "bun",
    args: ["scripts/notion-fetch/index.ts"],
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  "notion:fetch-all": {
    script: "bun",
    args: ["scripts/notion-fetch-all"],
    buildArgs: (options) => {
      const args: string[] = [];
      if (options.maxPages) args.push(`--max-pages`, String(options.maxPages));
      if (options.statusFilter)
        args.push(`--status-filter`, options.statusFilter);
      if (options.force) args.push("--force");
      if (options.dryRun) args.push("--dry-run");
      if (options.includeRemoved) args.push("--include-removed");
      return args;
    },
    timeoutMs: 60 * 60 * 1000, // 60 minutes
  },
  "notion:count-pages": {
    script: "bun",
    args: ["scripts/notion-count-pages/index.ts"],
    buildArgs: (options) => {
      const args: string[] = [];
      if (options.includeRemoved) args.push("--include-removed");
      if (options.statusFilter)
        args.push("--status-filter", options.statusFilter);
      return args;
    },
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  "notion:translate": {
    script: "bun",
    args: ["scripts/notion-translate"],
    timeoutMs: 30 * 60 * 1000, // 30 minutes
  },
  "notion:status-translation": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "translation"],
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  "notion:status-draft": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "draft"],
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  "notion:status-publish": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish"],
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
  "notion:status-publish-production": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish-production"],
    timeoutMs: 5 * 60 * 1000, // 5 minutes
  },
};

/**
 * Execute a Notion job
 */
export async function executeJob(
  jobType: JobType,
  context: JobExecutionContext,
  options: JobOptions = {}
): Promise<void> {
  const {
    jobId,
    onProgress,
    onComplete,
    github,
    startTime = Date.now(),
  } = context;
  const jobTracker = getJobTracker();
  const logger = createJobLogger(jobId);

  // Update job status to running
  jobTracker.updateJobStatus(jobId, "running");

  // eslint-disable-next-line security/detect-object-injection
  const jobConfig = JOB_COMMANDS[jobType];
  if (!jobConfig) {
    const availableTypes = Object.keys(JOB_COMMANDS).join(", ");
    const errorMsg = `Unknown job type: ${jobType}. Available types: ${availableTypes}`;
    logger.error("Unknown job type", { jobType, availableTypes });
    onComplete(false, undefined, errorMsg);
    jobTracker.updateJobStatus(jobId, "failed", {
      success: false,
      error: `Unknown job type: ${jobType}`,
    });
    return;
  }

  // Build command arguments
  const args = [...jobConfig.args, ...(jobConfig.buildArgs?.(options) || [])];

  logger.info("Executing job", { script: jobConfig.script, args });

  let childProcess: ChildProcess | null = null;
  let stdout = "";
  let stderr = "";
  let timeoutHandle: NodeJS.Timeout | null = null;
  let timedOut = false;
  let processExited = false;

  try {
    childProcess = spawn(jobConfig.script, args, {
      env: buildChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Register the process so it can be killed on cancellation
    jobTracker.registerProcess(jobId, {
      kill: () => childProcess?.kill("SIGTERM"),
    });

    // Determine timeout: use env var override or job-specific timeout
    const timeoutMs = parseTimeoutOverride(
      process.env.JOB_TIMEOUT_MS,
      jobConfig.timeoutMs
    );

    logger.info("Starting job with timeout", {
      timeoutMs,
      timeoutSeconds: Math.floor(timeoutMs / 1000),
    });

    // Set up timeout handler
    timeoutHandle = setTimeout(async () => {
      if (!childProcess || childProcess.killed) {
        return;
      }

      timedOut = true;
      const timeoutSeconds = Math.floor(timeoutMs / 1000);
      logger.warn("Job execution timed out, sending SIGTERM", {
        timeoutSeconds,
        pid: childProcess.pid,
      });

      // Send SIGTERM
      childProcess.kill("SIGTERM");

      // Wait for graceful shutdown, then force kill if needed
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          // Check if process has actually exited, not just if kill() was called
          if (childProcess && !processExited) {
            logger.error(
              "Job did not terminate after SIGTERM, sending SIGKILL",
              {
                pid: childProcess.pid,
              }
            );
            childProcess.kill("SIGKILL");
          }
          resolve();
        }, SIGKILL_DELAY_MS);
      });
    }, timeoutMs);

    // Collect stdout and stderr
    childProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      logger.debug("stdout", { output: text.trim() });

      // Parse progress from output (for jobs that output progress)
      parseProgressFromOutput(text, onProgress);
    });

    childProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      logger.warn("stderr", { output: text.trim() });
    });

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      childProcess?.on("close", (code) => {
        processExited = true;
        if (timedOut) {
          const timeoutSeconds = Math.floor(timeoutMs / 1000);
          logger.error("Job timed out", { timeoutSeconds });
          reject(
            new Error(`Job execution timed out after ${timeoutSeconds} seconds`)
          );
        } else if (code === 0) {
          logger.info("Job completed successfully", { exitCode: code });
          resolve();
        } else {
          logger.error("Job failed with non-zero exit code", {
            exitCode: code,
          });
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      childProcess?.on("error", (err) => {
        processExited = true;
        logger.error("Job process error", { error: err.message });
        reject(err);
      });
    });

    // Clear timeout if job completed before timeout
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }

    // Job completed successfully
    jobTracker.unregisterProcess(jobId);
    onComplete(true, { output: stdout });
    jobTracker.updateJobStatus(jobId, "completed", {
      success: true,
      output: stdout,
    });
  } catch (error) {
    // Clear timeout if still active
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }

    jobTracker.unregisterProcess(jobId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorOutput = stderr || errorMessage;

    logger.error("Job failed", { error: errorOutput, timedOut });
    onComplete(false, undefined, errorOutput);
    jobTracker.updateJobStatus(jobId, "failed", {
      success: false,
      error: errorOutput,
    });
  }
}

/**
 * Parse progress information from job output
 */
export function parseProgressFromOutput(
  output: string,
  onProgress: (current: number, total: number, message: string) => void
): void {
  // Look for patterns like "Progress: 5/10 pages" or "Processing 5 of 10"
  const progressPatterns = [
    /Progress:\s*(\d+)\/(\d+)/i,
    /Processing\s+(\d+)\s+of\s+(\d+)/i,
    /(\d+)\/(\d+)\s+pages?/i,
  ];

  for (const pattern of progressPatterns) {
    const match = output.match(pattern);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      onProgress(current, total, `Processing ${current} of ${total}`);
      return;
    }
  }
}

/**
 * Execute a job asynchronously (non-blocking)
 */
export function executeJobAsync(
  jobType: JobType,
  jobId: string,
  options: JobOptions = {},
  github?: GitHubContext
): void {
  const jobTracker = getJobTracker();
  const job = jobTracker.getJob(jobId);
  const startTime = Date.now();

  const context: JobExecutionContext = {
    jobId,
    github,
    startTime,
    onProgress: (current, total, message) => {
      jobTracker.updateJobProgress(jobId, current, total, message);
    },
    onComplete: async (success, data, error) => {
      const duration = Date.now() - startTime;
      jobTracker.updateJobStatus(jobId, success ? "completed" : "failed", {
        success,
        data,
        error,
      });

      // Report completion to GitHub if context is available and not already reported
      // Use double-checked locking pattern for idempotency
      if (github && !jobTracker.isGitHubStatusReported(jobId)) {
        const result = await reportJobCompletion(
          {
            owner: github.owner,
            repo: github.repo,
            sha: github.sha,
            token: github.token,
            context: github.context,
            targetUrl: github.targetUrl,
          },
          success,
          jobType,
          {
            duration,
            error,
            output: data as string | undefined,
          }
        );

        // Mark as reported only if the API call succeeded
        if (result !== null) {
          jobTracker.markGitHubStatusReported(jobId);
        }
      }
    },
  };

  // Execute in background without awaiting
  executeJob(jobType, context, options).catch((err) => {
    console.error(`[Job ${jobId}] Unexpected error:`, err);
  });
}
