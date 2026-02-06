/**
 * Job executor for Notion jobs
 * Executes various Notion-related jobs and reports progress
 */

import { spawn, ChildProcess } from "node:child_process";
import type { JobType, JobStatus } from "./job-tracker";
import { getJobTracker } from "./job-tracker";

export interface JobExecutionContext {
  jobId: string;
  onProgress: (current: number, total: number, message: string) => void;
  onComplete: (success: boolean, data?: unknown, error?: string) => void;
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
  const { jobId, onProgress, onComplete } = context;
  const jobTracker = getJobTracker();

  // Update job status to running
  jobTracker.updateJobStatus(jobId, "running");

  // eslint-disable-next-line security/detect-object-injection
  const jobConfig = JOB_COMMANDS[jobType];
  if (!jobConfig) {
    const availableTypes = Object.keys(JOB_COMMANDS).join(", ");
    onComplete(
      false,
      undefined,
      `Unknown job type: ${jobType}. Available types: ${availableTypes}`
    );
    jobTracker.updateJobStatus(jobId, "failed", {
      success: false,
      error: `Unknown job type: ${jobType}`,
    });
    return;
  }

  // Build command arguments
  const args = [...jobConfig.args, ...(jobConfig.buildArgs?.(options) || [])];

  console.log(
    `[Job ${jobId}] Executing: ${jobConfig.script} ${args.join(" ")}`
  );

  let process: ChildProcess | null = null;
  let stdout = "";
  let stderr = "";

  try {
    process = spawn(jobConfig.script, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Collect stdout and stderr
    process.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      console.log(`[Job ${jobId}] ${text}`);

      // Parse progress from output (for jobs that output progress)
      parseProgressFromOutput(text, onProgress);
    });

    process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      console.error(`[Job ${jobId}] ERROR: ${text}`);
    });

    // Wait for process to complete
    await new Promise<void>((resolve, reject) => {
      process?.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      process?.on("error", (err) => {
        reject(err);
      });
    });

    // Job completed successfully
    onComplete(true, { output: stdout });
    jobTracker.updateJobStatus(jobId, "completed", {
      success: true,
      output: stdout,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorOutput = stderr || errorMessage;

    console.error(`[Job ${jobId}] Failed: ${errorOutput}`);
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
  options: JobOptions = {}
): void {
  const context: JobExecutionContext = {
    jobId,
    onProgress: (current, total, message) => {
      const jobTracker = getJobTracker();
      jobTracker.updateJobProgress(jobId, current, total, message);
    },
    onComplete: (success, data, error) => {
      const jobTracker = getJobTracker();
      jobTracker.updateJobStatus(jobId, success ? "completed" : "failed", {
        success,
        data,
        error,
      });
    },
  };

  // Execute in background without awaiting
  executeJob(jobType, context, options).catch((err) => {
    console.error(`[Job ${jobId}] Unexpected error:`, err);
  });
}
