/**
 * Job executor for Notion jobs
 * Executes various Notion-related jobs and reports progress
 */

import { spawn, ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JobType, GitHubContext } from "./job-tracker";
import { getJobTracker } from "./job-tracker";
import { createJobLogger } from "./job-persistence";
import { reportJobCompletion } from "./github-status";
import { isContentMutatingJob, runContentTask } from "./content-repo";
import { releaseFetchJobLock } from "./fetch-job-lock";
import { runFetchJob } from "./fetch-job-runner";

/**
 * Whitelist of environment variables that child processes are allowed to access.
 * Only variables necessary for Notion scripts and runtime resolution are included.
 * Sensitive vars like API_KEY_*, GITHUB_TOKEN are explicitly excluded.
 *
 * Audit rationale:
 * - NOTION_API_KEY: Required by all Notion scripts for API authentication
 * - DATABASE_ID: Database ID for Notion API (legacy v4)
 * - NOTION_DATABASE_ID: Alternative database ID (backward compatibility)
 * - DATA_SOURCE_ID: Data source ID for Notion API v5
 * - OPENAI_API_KEY: Required for translation scripts
 * - OPENAI_MODEL: Optional OpenAI model override (has default)
 * - DEFAULT_DOCS_PAGE: Application configuration for default docs page
 * - BASE_URL: Base URL path for emoji and asset URLs in production (e.g., "/comapeo-docs/")
 * - NODE_ENV: Environment mode (test/production/development)
 * - DEBUG: Optional debug logging for notion-fetch scripts
 * - NOTION_PERF_LOG: Optional performance telemetry logging flag
 * - NOTION_PERF_OUTPUT: Optional performance telemetry output path
 * - PATH: Required for runtime resolution (bun/node executables)
 * - HOME: Required for runtime resolution (user home directory)
 * - BUN_INSTALL: Required for bun runtime to locate installation
 * - CONTENT_PATH: Override docs output directory (for Docker volume persistence)
 * - IMAGES_PATH: Override images output directory (for Docker volume persistence)
 * - I18N_PATH: Override i18n output directory (for Docker volume persistence)
 * - LANG: Locale configuration for text processing
 * - LC_ALL: Locale configuration for collation and character handling
 */
export const CHILD_ENV_WHITELIST = [
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
  "BASE_URL",
  "NODE_ENV",
  // Content output paths (override defaults for Docker volume persistence)
  "CONTENT_PATH",
  "IMAGES_PATH",
  "I18N_PATH",
  // Debug and performance telemetry (optional but used by production workflows)
  "DEBUG",
  "NOTION_PERF_LOG",
  "NOTION_PERF_OUTPUT",
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
export function buildChildEnv(): NodeJS.ProcessEnv {
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
const DEFAULT_FETCH_JOB_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Time to wait after SIGTERM before sending SIGKILL (5 seconds)
 */
const SIGKILL_DELAY_MS = 5000;

/**
 * Fail-safe delay after SIGKILL before force-failing unresponsive process (1 second)
 */
const SIGKILL_FAILSAFE_MS = 1000;

/**
 * Maximum allowed timeout override (2 hours) in milliseconds
 */
const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours max

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

  const trimmed = envValue.trim();

  // Strict positive integer validation (reject decimals, scientific notation, signs, text)
  if (!/^\d+$/.test(trimmed)) {
    console.warn(
      `Invalid JOB_TIMEOUT_MS: "${envValue}" - must be positive integer`
    );
    return fallback;
  }

  const parsed = parseInt(trimmed, 10);

  // Validate: must be finite, positive integer
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `Invalid JOB_TIMEOUT_MS: "${envValue}" - must be positive integer`
    );
    return fallback;
  }

  // Enforce upper bound to prevent unbounded long-running timeouts
  if (parsed > MAX_TIMEOUT_MS) {
    console.warn(
      `JOB_TIMEOUT_MS "${envValue}" exceeds max ${MAX_TIMEOUT_MS}ms; capping to ${MAX_TIMEOUT_MS}ms`
    );
    return MAX_TIMEOUT_MS;
  }

  return parsed;
}

/**
 * Map of job types to their Bun script commands and timeout configuration
 */

function isJobCancelled(jobId: string): boolean {
  const job = getJobTracker().getJob(jobId);
  return (
    job?.status === "failed" && job.result?.error === "Job cancelled by user"
  );
}

function isFetchJobType(
  jobType: JobType
): jobType is "fetch-ready" | "fetch-all" {
  return jobType === "fetch-ready" || jobType === "fetch-all";
}

export const JOB_COMMANDS: Record<
  JobType,
  {
    script: string;
    args: string[];
    buildArgs?: (options: JobOptions) => string[];
    timeoutMs: number;
  }
> = {
  "fetch-ready": {
    script: "bun",
    args: ["scripts/notion-fetch-all", "--status-filter", "Ready to publish"],
    buildArgs: (options) => {
      const args: string[] = [];
      if (options.maxPages !== undefined) {
        args.push("--max-pages", String(options.maxPages));
      }
      if (options.force) args.push("--force");
      if (options.dryRun) args.push("--dry-run");
      return args;
    },
    timeoutMs: DEFAULT_FETCH_JOB_TIMEOUT_MS,
  },
  "fetch-all": {
    script: "bun",
    args: ["scripts/notion-fetch-all"],
    buildArgs: (options) => {
      const args: string[] = [];
      if (options.maxPages !== undefined) {
        args.push("--max-pages", String(options.maxPages));
      }
      if (options.force) args.push("--force");
      if (options.dryRun) args.push("--dry-run");
      return args;
    },
    timeoutMs: DEFAULT_FETCH_JOB_TIMEOUT_MS,
  },
  "notion:fetch": {
    script: "bun",
    args: ["scripts/notion-fetch/index.ts"],
    timeoutMs: DEFAULT_JOB_TIMEOUT_MS,
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
    timeoutMs: DEFAULT_JOB_TIMEOUT_MS,
  },
  "notion:translate": {
    script: "bun",
    args: ["scripts/notion-translate"],
    timeoutMs: 30 * 60 * 1000, // 30 minutes
  },
  "notion:status-translation": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "translation"],
    timeoutMs: DEFAULT_JOB_TIMEOUT_MS,
  },
  "notion:status-draft": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "draft"],
    timeoutMs: DEFAULT_JOB_TIMEOUT_MS,
  },
  "notion:status-publish": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish"],
    timeoutMs: DEFAULT_JOB_TIMEOUT_MS,
  },
  "notion:status-publish-production": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish-production"],
    timeoutMs: DEFAULT_JOB_TIMEOUT_MS,
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
  const { jobId, onProgress, onComplete } = context;
  const jobTracker = getJobTracker();
  const logger = createJobLogger(jobId);
  const eventData = { jobId, type: jobType };
  const releaseFetchLockOnExit = isFetchJobType(jobType);

  // Update job status to running
  jobTracker.updateJobStatus(jobId, "running");

  // eslint-disable-next-line security/detect-object-injection
  const jobConfig = JOB_COMMANDS[jobType];
  if (!jobConfig) {
    const availableTypes = Object.keys(JOB_COMMANDS).join(", ");
    const errorMsg = `Unknown job type: ${jobType}. Available types: ${availableTypes}`;
    logger.error("Unknown job type", { jobType, availableTypes });
    logger.error("job_failed", { ...eventData, error: errorMsg });
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
  logger.info("job_started", {
    ...eventData,
    timeoutMs: parseTimeoutOverride(
      process.env.JOB_TIMEOUT_MS,
      jobConfig.timeoutMs
    ),
  });

  let childProcess: ChildProcess | null = null;
  let stdout = "";
  let stderr = "";
  let lastExitCode: number | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let failSafeTimer: NodeJS.Timeout | null = null;
  let timedOut = false;
  let processExited = false;
  let rejectProcessCompletion: ((error: Error) => void) | null = null;
  let pendingProcessCompletionError: Error | null = null;

  const runJobProcess = async (cwd?: string): Promise<string> => {
    const processArgs = [...args];
    if (cwd && processArgs[0]?.startsWith("scripts/")) {
      processArgs[0] = resolve(PROJECT_ROOT, processArgs[0]);
    }

    childProcess = spawn(jobConfig.script, processArgs, {
      cwd,
      env: buildChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Register the process so it can be killed on cancellation
    jobTracker.registerProcess(jobId, {
      kill: () => {
        if (childProcess) {
          // Direct kill first (also satisfies test mocks)
          childProcess.kill("SIGTERM");
          // Also kill entire process group to catch grandchildren
          if (childProcess.pid) {
            try {
              process.kill(-childProcess.pid, "SIGTERM");
            } catch {
              // ESRCH = no such process group; direct kill above suffices
            }
          }
        }
      },
    });

    // Determine timeout: use env var override or job-specific timeout
    const timeoutMs = parseTimeoutOverride(
      process.env.JOB_TIMEOUT_MS,
      jobConfig.timeoutMs
    );

    logger.info("Starting job with timeout", {
      timeoutMs,
      timeoutSeconds: Math.floor(timeoutMs / 1000),
      cwd,
    });

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

      // Kill child directly first
      if (!childProcess.killed) {
        childProcess.kill("SIGTERM");
      }
      // Also kill entire process group to catch grandchildren
      if (childProcess?.pid) {
        try {
          process.kill(-childProcess.pid, "SIGTERM");
        } catch {
          // ESRCH = ok
        }
      }

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (childProcess && !processExited) {
            logger.error(
              "Job did not terminate after SIGTERM, sending SIGKILL",
              {
                pid: childProcess.pid,
              }
            );
            childProcess.kill("SIGKILL");
            if (childProcess.pid) {
              try {
                process.kill(-childProcess.pid, "SIGKILL");
              } catch {
                // ESRCH = ok
              }
            }

            failSafeTimer = setTimeout(() => {
              if (!processExited) {
                const failSafeError = new Error(
                  "Process unresponsive after timeout (no close/error after SIGKILL)"
                );
                logger.error("Process unresponsive after SIGKILL fail-safe", {
                  pid: childProcess?.pid,
                });

                if (rejectProcessCompletion) {
                  rejectProcessCompletion(failSafeError);
                } else {
                  pendingProcessCompletionError = failSafeError;
                }
              }
            }, SIGKILL_FAILSAFE_MS);
          }
          resolve();
        }, SIGKILL_DELAY_MS);
      });
    }, timeoutMs);

    childProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      logger.debug("stdout", { output: text.trim() });
      parseProgressFromOutput(text, onProgress);
    });

    childProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      logger.warn("stderr", { output: text.trim() });
    });

    await new Promise<void>((resolve, reject) => {
      let completionSettled = false;
      const resolveOnce = () => {
        if (completionSettled) return;
        completionSettled = true;
        resolve();
      };
      const rejectOnce = (error: Error) => {
        if (completionSettled) return;
        completionSettled = true;
        reject(error);
      };

      rejectProcessCompletion = rejectOnce;
      if (pendingProcessCompletionError) {
        rejectOnce(pendingProcessCompletionError);
      }

      childProcess?.on("close", (code) => {
        processExited = true;
        lastExitCode = code;
        if (failSafeTimer) {
          clearTimeout(failSafeTimer);
          failSafeTimer = null;
        }
        if (timedOut) {
          const timeoutSeconds = Math.floor(timeoutMs / 1000);
          logger.error("Job timed out", { timeoutSeconds });
          rejectOnce(
            new Error(`Job execution timed out after ${timeoutSeconds} seconds`)
          );
        } else if (code === 0) {
          logger.info("Job completed successfully", { exitCode: code });
          resolveOnce();
        } else {
          logger.error("Job failed with non-zero exit code", {
            exitCode: code,
          });
          rejectOnce(new Error(`Process exited with code ${code}`));
        }
      });

      childProcess?.on("error", (err) => {
        processExited = true;
        if (failSafeTimer) {
          clearTimeout(failSafeTimer);
          failSafeTimer = null;
        }
        logger.error("Job process error", { error: err.message });
        rejectOnce(err);
      });
    });

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (failSafeTimer) {
      clearTimeout(failSafeTimer);
      failSafeTimer = null;
    }

    return stdout;
  };

  try {
    if (isFetchJobType(jobType)) {
      const timeoutMs = parseTimeoutOverride(
        process.env.JOB_TIMEOUT_MS,
        jobConfig.timeoutMs
      );
      const abortController = new AbortController();
      const fetchTimeoutHandle = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, timeoutMs);

      const fetchResult = await (async () => {
        try {
          return await runFetchJob({
            type: jobType,
            jobId,
            options,
            onProgress,
            logger,
            childEnv: buildChildEnv(),
            signal: abortController.signal,
            timeoutMs,
          });
        } finally {
          clearTimeout(fetchTimeoutHandle);
        }
      })();

      const resultData = {
        output: fetchResult.output ?? "",
        commitHash: fetchResult.terminal.commitHash,
        failedPageIds: fetchResult.terminal.failedPageIds ?? [],
        warnings: fetchResult.terminal.warnings ?? [],
        counters: {
          pagesProcessed: fetchResult.terminal.pagesProcessed,
          pagesSkipped: fetchResult.terminal.pagesSkipped,
          pagesTransitioned: fetchResult.terminal.pagesTransitioned,
        },
        errorEnvelope: fetchResult.terminal.error,
        dryRun: fetchResult.terminal.dryRun,
      };

      if (fetchResult.terminal.warnings?.length) {
        for (const warning of fetchResult.terminal.warnings) {
          logger.warn("job_warning", {
            ...eventData,
            warningType: warning.type,
            pageId: warning.pageId,
            message: warning.message,
          });
        }
      }

      if (fetchResult.success) {
        logger.info("job_completed", {
          ...eventData,
          pagesProcessed: fetchResult.terminal.pagesProcessed,
          pagesSkipped: fetchResult.terminal.pagesSkipped,
          pagesTransitioned: fetchResult.terminal.pagesTransitioned,
          commitHash: fetchResult.terminal.commitHash,
          dryRun: fetchResult.terminal.dryRun === true,
        });
      } else {
        if (fetchResult.terminal.error?.code === "JOB_TIMEOUT") {
          logger.error("job_timeout", {
            ...eventData,
            timeoutMs,
            message: fetchResult.terminal.error.message,
          });
        }
        logger.error("job_failed", {
          ...eventData,
          error: fetchResult.terminal.error?.message ?? fetchResult.error,
          code: fetchResult.terminal.error?.code ?? "UNKNOWN",
          commitHash: fetchResult.terminal.commitHash,
          failedPageIds: fetchResult.terminal.failedPageIds ?? [],
        });
      }

      jobTracker.setTerminalState(jobId, fetchResult.terminal);
      jobTracker.unregisterProcess(jobId);
      onComplete(fetchResult.success, resultData, fetchResult.error);
      jobTracker.updateJobStatus(
        jobId,
        fetchResult.success ? "completed" : "failed",
        {
          success: fetchResult.success,
          output: fetchResult.output,
          data: resultData,
          error: fetchResult.error,
          commitHash: fetchResult.terminal.commitHash,
          failedPageIds: fetchResult.terminal.failedPageIds,
          warnings: fetchResult.terminal.warnings,
          counters: {
            pagesProcessed: fetchResult.terminal.pagesProcessed,
            pagesSkipped: fetchResult.terminal.pagesSkipped,
            pagesTransitioned: fetchResult.terminal.pagesTransitioned,
          },
          errorEnvelope: fetchResult.terminal.error,
        }
      );
      return;
    }

    const useContentRepoManagement =
      isContentMutatingJob(jobType) && !isFetchJobType(jobType);

    let resultData: Record<string, unknown>;
    if (useContentRepoManagement) {
      const repoResult = await runContentTask(
        jobType,
        jobId,
        async (workdir) => runJobProcess(workdir),
        { shouldAbort: () => isJobCancelled(jobId) }
      );
      resultData = {
        output: repoResult.output,
        noOp: repoResult.noOp,
        commitSha: repoResult.commitSha,
      };
    } else {
      const output = await runJobProcess();
      resultData = { output };
    }

    jobTracker.unregisterProcess(jobId);
    logger.info("job_completed", { ...eventData, exitCode: lastExitCode ?? 0 });
    onComplete(true, resultData);
    jobTracker.updateJobStatus(jobId, "completed", {
      success: true,
      output: stdout,
      data: resultData,
    });
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (failSafeTimer) {
      clearTimeout(failSafeTimer);
      failSafeTimer = null;
    }

    jobTracker.unregisterProcess(jobId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails =
      error && typeof error === "object" && "details" in error
        ? String((error as { details?: unknown }).details ?? "")
        : "";
    const combinedError = [errorMessage, errorDetails]
      .filter(Boolean)
      .join("\n");
    const errorOutput = stderr || combinedError || errorMessage;

    logger.error("Job failed", {
      error: errorOutput,
      timedOut,
      lastExitCode,
      exitCodeKnown: lastExitCode !== null,
    });
    if (timedOut) {
      logger.error("job_timeout", {
        ...eventData,
        message: errorOutput,
      });
    }
    logger.error("job_failed", {
      ...eventData,
      error: errorOutput,
      timedOut,
      lastExitCode,
    });
    const sanitizedError =
      "Job execution failed. Please check server logs for details.";
    onComplete(false, undefined, sanitizedError);
    jobTracker.updateJobStatus(jobId, "failed", {
      success: false,
      error: sanitizedError,
    });
  } finally {
    if (releaseFetchLockOnExit) {
      releaseFetchJobLock(jobId);
    }
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
