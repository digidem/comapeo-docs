/**
 * Job executor for Notion jobs
 * Executes various Notion-related jobs and reports progress
 */

import { spawn, ChildProcess } from "node:child_process";
import type { JobType, JobStatus, GitHubContext } from "./job-tracker";
import { getJobTracker } from "./job-tracker";
import { createJobLogger, type JobLogger } from "./job-persistence";
import { reportJobCompletion } from "./github-status";

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
 * Map of job types to their Bun script commands
 */
const JOB_COMMANDS: Record<
  JobType,
  {
    script: string;
    args: string[];
    buildArgs?: (options: JobOptions) => string[];
  }
> = {
  "notion:fetch": {
    script: "bun",
    args: ["scripts/notion-fetch"],
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
  },
  "notion:translate": {
    script: "bun",
    args: ["scripts/notion-translate"],
  },
  "notion:status-translation": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "translation"],
  },
  "notion:status-draft": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "draft"],
  },
  "notion:status-publish": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish"],
  },
  "notion:status-publish-production": {
    script: "bun",
    args: ["scripts/notion-status", "--workflow", "publish-production"],
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

  try {
    childProcess = spawn(jobConfig.script, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Register the process so it can be killed on cancellation
    jobTracker.registerProcess(jobId, {
      kill: () => childProcess?.kill("SIGTERM"),
    });

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
        if (code === 0) {
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
        logger.error("Job process error", { error: err.message });
        reject(err);
      });
    });

    // Job completed successfully
    jobTracker.unregisterProcess(jobId);
    onComplete(true, { output: stdout });
    jobTracker.updateJobStatus(jobId, "completed", {
      success: true,
      output: stdout,
    });
  } catch (error) {
    jobTracker.unregisterProcess(jobId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorOutput = stderr || errorMessage;

    logger.error("Job failed", { error: errorOutput });
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
function parseProgressFromOutput(
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
