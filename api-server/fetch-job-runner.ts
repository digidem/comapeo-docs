import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve as pathResolve } from "node:path";
import { NOTION_PROPERTIES } from "../scripts/constants";
import { notion, enhancedNotion } from "../scripts/notionClient";
import type { FetchJobError, FetchJobWarning } from "./response-schemas";
import {
  assertCleanWorkingTree,
  commitGeneratedChanges,
  ContentRepoError,
  copyGeneratedContentFromTemp,
  getHeadCommitHash,
  hasHeadAdvancedSince,
  hasStagedGeneratedChanges,
  prepareContentBranchForFetch,
  pushContentBranchWithRetry,
  stageGeneratedPaths,
  verifyRemoteHeadMatchesLocal,
} from "./content-repo";
import { extractLastJsonLine } from "./json-extraction";

/**
 * Time to wait after SIGTERM before sending SIGKILL (5 seconds)
 */
const SIGKILL_DELAY_MS = 5000;

/**
 * Fail-safe delay after SIGKILL before force-failing unresponsive process (1 second)
 */
const SIGKILL_FAILSAFE_MS = 1000;

interface FetchJobLogger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

interface FetchJobOptions {
  maxPages?: number;
  force?: boolean;
  dryRun?: boolean;
}

interface FetchJobResult {
  success: boolean;
  output?: string;
  error?: string;
  terminal: {
    pagesProcessed: number;
    pagesSkipped: number;
    pagesTransitioned?: number;
    commitHash: string | null;
    failedPageIds?: string[];
    warnings?: FetchJobWarning[];
    dryRun?: boolean;
    error?: FetchJobError;
  };
}

interface RunFetchJobInput {
  type: "fetch-ready" | "fetch-all";
  jobId: string;
  options: FetchJobOptions;
  onProgress: (current: number, total: number, message: string) => void;
  logger: FetchJobLogger;
  childEnv: NodeJS.ProcessEnv;
  signal: AbortSignal;
  timeoutMs: number;
}

const DRAFT_PUBLISHED_STATUS = "Draft published";

function classifyError(error: unknown): FetchJobError {
  if (error instanceof ContentRepoError && error.code) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("notion") || message.includes("Notion")) {
    return {
      code: "NOTION_QUERY_FAILED",
      message,
    };
  }

  return {
    code: "UNKNOWN",
    message,
  };
}

function timeoutError(timeoutMs: number): ContentRepoError {
  const timeoutSeconds = Math.floor(timeoutMs / 1000);
  return new ContentRepoError(
    `Job execution timed out after ${timeoutSeconds} seconds`,
    undefined,
    "JOB_TIMEOUT"
  );
}

function throwIfAborted(signal: AbortSignal, timeoutMs: number): void {
  if (signal.aborted) {
    throw timeoutError(timeoutMs);
  }
}

async function sleepWithAbort(
  delayMs: number,
  signal: AbortSignal,
  timeoutMs: number
): Promise<void> {
  if (delayMs <= 0) {
    return;
  }

  throwIfAborted(signal, timeoutMs);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(timeoutError(timeoutMs));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableNotionError(error: any): boolean {
  if (!error) return false;

  const status = error.status || error.code;
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  if (
    error.code === "ECONNRESET" ||
    error.code === "ETIMEDOUT" ||
    error.message?.includes("network timeout")
  ) {
    return true;
  }

  return false;
}

async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let attempt = 0;
  while (true) {
    throwIfAborted(signal, timeoutMs);
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableNotionError(error)) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await sleepWithAbort(delayMs, signal, timeoutMs);
      attempt++;
    }
  }
}

function parseCiFetchHoldMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

async function runGenerationScript(
  type: "fetch-ready" | "fetch-all",
  options: FetchJobOptions,
  tempDir: string,
  childEnv: NodeJS.ProcessEnv,
  onProgress: (current: number, total: number, message: string) => void,
  signal: AbortSignal,
  timeoutMs: number
): Promise<string> {
  const args = ["scripts/notion-fetch-all"];
  if (type === "fetch-ready") {
    args.push("--status-filter", NOTION_PROPERTIES.READY_TO_PUBLISH);
  }
  if (options.maxPages !== undefined && options.maxPages > 0) {
    args.push("--max-pages", String(options.maxPages));
  }

  return await new Promise<string>((resolve, reject) => {
    const child = spawn("bun", args, {
      env: {
        ...childEnv,
        CONTENT_PATH: pathResolve(tempDir, "docs"),
        I18N_PATH: pathResolve(tempDir, "i18n"),
        IMAGES_PATH: pathResolve(tempDir, "static", "images"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let processExited = false;

    const settleReject = (error: ContentRepoError) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(error);
    };

    const settleResolve = (value: string) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };

    const onAbort = async () => {
      // Send SIGTERM to the child process
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      // Also kill entire process group to catch grandchildren
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          // ESRCH = ok (process doesn't exist)
        }
      }

      // Wait for SIGKILL_DELAY_MS, then escalate to SIGKILL if process hasn't exited
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!processExited) {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
            if (child.pid) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                // ESRCH = ok
              }
            }
          }
          resolve();
        }, SIGKILL_DELAY_MS);
      });

      // Fail-safe: wait for SIGKILL_FAILSAFE_MS, then reject if process still running
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (!processExited) {
            settleReject(timeoutError(timeoutMs));
          }
          resolve();
        }, SIGKILL_FAILSAFE_MS);
      });
    };

    signal.addEventListener("abort", onAbort, { once: true });

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        const match = text.match(/Progress:\s*(\d+)\/(\d+)/i);
        if (match) {
          const current = Number.parseInt(match[1], 10);
          const total = Number.parseInt(match[2], 10);
          onProgress(current, total, `Processing ${current} of ${total}`);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (error) => {
      processExited = true;
      settleReject(
        new ContentRepoError(
          `Failed to execute generation command: ${error.message}`,
          undefined,
          "CONTENT_GENERATION_FAILED"
        )
      );
    });

    child.on("close", (code) => {
      processExited = true;

      if (signal.aborted) {
        settleReject(timeoutError(timeoutMs));
        return;
      }

      if (code === 0) {
        settleResolve(stdout);
        return;
      }
      settleReject(
        new ContentRepoError(
          "Generation command failed",
          stderr || stdout,
          "CONTENT_GENERATION_FAILED"
        )
      );
    });
  });
}

async function getPageStatus(
  pageId: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<string | null> {
  const page = (await withExponentialBackoff(
    () => enhancedNotion.pagesRetrieve({ page_id: pageId }),
    signal,
    timeoutMs
  )) as {
    properties?: Record<string, { select?: { name?: string } | null }>;
  };

  const status = page.properties?.[NOTION_PROPERTIES.STATUS];
  return status?.select?.name ?? null;
}

async function updatePageStatusWithRetry(
  pageId: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<boolean> {
  try {
    await withExponentialBackoff(
      () =>
        notion.pages.update({
          page_id: pageId,
          properties: {
            [NOTION_PROPERTIES.STATUS]: {
              select: {
                name: DRAFT_PUBLISHED_STATUS,
              },
            },
          },
        }),
      signal,
      timeoutMs
    );
    return true;
  } catch (error) {
    return false;
  }
}

export async function runFetchJob({
  type,
  jobId,
  options,
  onProgress,
  logger,
  childEnv,
  signal,
  timeoutMs,
}: RunFetchJobInput): Promise<FetchJobResult> {
  const terminal: FetchJobResult["terminal"] = {
    pagesProcessed: 0,
    pagesSkipped: 0,
    commitHash: null,
  };

  let tempDir: string | null = null;
  let output = "";

  try {
    const ciFetchHoldMs = parseCiFetchHoldMs(process.env.CI_FETCH_HOLD_MS);
    if (ciFetchHoldMs > 0) {
      logger.info("Applying CI fetch hold", { holdMs: ciFetchHoldMs });
      await sleepWithAbort(ciFetchHoldMs, signal, timeoutMs);
    }

    throwIfAborted(signal, timeoutMs);
    await assertCleanWorkingTree(Boolean(options.force));

    throwIfAborted(signal, timeoutMs);
    tempDir = pathResolve(tmpdir(), `fetch-job-${jobId}`);
    await rm(tempDir, { recursive: true, force: true });
    await mkdir(tempDir, { recursive: true });

    throwIfAborted(signal, timeoutMs);
    output = await runGenerationScript(
      type,
      options,
      tempDir,
      childEnv,
      onProgress,
      signal,
      timeoutMs
    );

    const parsedOutput = extractLastJsonLine(output) as {
      candidateIds?: string[];
      pagesProcessed?: number;
    } | null;
    terminal.pagesProcessed = parsedOutput?.pagesProcessed ?? 0;
    const transitionCandidates: string[] =
      type === "fetch-ready" ? (parsedOutput?.candidateIds ?? []) : [];

    if (terminal.pagesProcessed === 0) {
      if (options.dryRun) {
        terminal.dryRun = true;
      }
      if (type === "fetch-ready") {
        terminal.pagesTransitioned = 0;
        terminal.failedPageIds = [];
        terminal.warnings = [];
      }
      return {
        success: true,
        output,
        terminal,
      };
    }

    if (options.dryRun) {
      terminal.dryRun = true;
      if (type === "fetch-ready") {
        terminal.pagesTransitioned = 0;
        terminal.failedPageIds = [];
        terminal.warnings = [];
      }
      return {
        success: true,
        output,
        terminal,
      };
    }

    throwIfAborted(signal, timeoutMs);
    const { remoteRef } = await prepareContentBranchForFetch(type);
    throwIfAborted(signal, timeoutMs);
    await copyGeneratedContentFromTemp(tempDir);
    throwIfAborted(signal, timeoutMs);
    await stageGeneratedPaths();

    throwIfAborted(signal, timeoutMs);
    const contentChanged = await hasStagedGeneratedChanges();
    throwIfAborted(signal, timeoutMs);
    const mergeAdvanced = await hasHeadAdvancedSince(remoteRef);

    if (contentChanged) {
      throwIfAborted(signal, timeoutMs);
      const commitMessage = `${type}: ${terminal.pagesProcessed} pages [${jobId}]`;
      await commitGeneratedChanges(commitMessage);
      throwIfAborted(signal, timeoutMs);
      terminal.commitHash = await pushContentBranchWithRetry();
    } else if (mergeAdvanced) {
      throwIfAborted(signal, timeoutMs);
      terminal.commitHash = await pushContentBranchWithRetry();
    } else {
      terminal.commitHash = null;
    }

    if (type === "fetch-ready") {
      throwIfAborted(signal, timeoutMs);
      await verifyRemoteHeadMatchesLocal();

      const warnings: FetchJobWarning[] = [];
      const failedPageIds: string[] = [];
      let transitioned = 0;

      for (const pageId of transitionCandidates) {
        throwIfAborted(signal, timeoutMs);
        const currentStatus = await getPageStatus(pageId, signal, timeoutMs);
        if (currentStatus !== NOTION_PROPERTIES.READY_TO_PUBLISH) {
          warnings.push({
            type: "status_changed",
            pageId,
            message: `Page is no longer ${NOTION_PROPERTIES.READY_TO_PUBLISH}`,
          });
          continue;
        }

        const updated = await updatePageStatusWithRetry(
          pageId,
          signal,
          timeoutMs
        );
        if (updated) {
          transitioned += 1;
          continue;
        }

        failedPageIds.push(pageId);
      }

      terminal.pagesTransitioned = transitioned;
      terminal.failedPageIds = failedPageIds;
      terminal.warnings = warnings;

      if (failedPageIds.length > 0) {
        terminal.error = {
          code: "NOTION_STATUS_PARTIAL",
          message: "Some pages failed to transition to Draft published",
        };
        return {
          success: false,
          output,
          error: "Some pages failed to transition to Draft published",
          terminal,
        };
      }
    }

    return {
      success: true,
      output,
      terminal,
    };
  } catch (error) {
    const classified = classifyError(error);
    const errorDetails =
      error instanceof ContentRepoError ? error.details : undefined;
    logger.error("Fetch job failed", {
      error: classified.message,
      code: classified.code,
      ...(errorDetails ? { details: errorDetails } : {}),
    });
    terminal.error = classified;
    if (type === "fetch-ready") {
      terminal.failedPageIds = terminal.failedPageIds ?? [];
      terminal.warnings = terminal.warnings ?? [];
      terminal.pagesTransitioned = terminal.pagesTransitioned ?? 0;
    }
    return {
      success: false,
      output,
      error: classified.message,
      terminal,
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
