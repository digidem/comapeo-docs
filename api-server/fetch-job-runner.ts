import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { NOTION_PROPERTIES } from "../scripts/constants";
import {
  fetchAllNotionData,
  type PageWithStatus,
} from "../scripts/notion-fetch-all/fetchAll";
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

function normalizePages(
  pages: PageWithStatus[],
  maxPages?: number
): PageWithStatus[] {
  const sorted = [...pages].sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    const editedCompare = a.lastEdited.getTime() - b.lastEdited.getTime();
    if (editedCompare !== 0) {
      return editedCompare;
    }

    return a.id.localeCompare(b.id);
  });

  if (maxPages && maxPages > 0) {
    return sorted.slice(0, maxPages);
  }
  return sorted;
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

/**
 * Wraps a promise with a timeout that rejects if the promise doesn't settle
 * within the specified time. This is useful for operations that don't natively
 * support AbortSignal (like Notion API calls) to ensure they respect job timeouts.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs)
    ),
  ]).catch((error) => {
    // Re-throw with context about which operation timed out
    if (error instanceof ContentRepoError && error.code === "JOB_TIMEOUT") {
      throw new ContentRepoError(
        `${operation} timed out after ${timeoutMs}ms`,
        undefined,
        "JOB_TIMEOUT"
      );
    }
    throw error;
  });
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
        CONTENT_PATH: resolve(tempDir, "docs"),
        I18N_PATH: resolve(tempDir, "i18n"),
        IMAGES_PATH: resolve(tempDir, "static", "images"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

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

    const onAbort = () => {
      child.kill("SIGTERM");
      settleReject(timeoutError(timeoutMs));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      const match = text.match(/Progress:\s*(\d+)\/(\d+)/i);
      if (match) {
        const current = Number.parseInt(match[1], 10);
        const total = Number.parseInt(match[2], 10);
        onProgress(current, total, `Processing ${current} of ${total}`);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      settleReject(
        new ContentRepoError(
          `Failed to execute generation command: ${error.message}`,
          undefined,
          "CONTENT_GENERATION_FAILED"
        )
      );
    });

    child.on("close", (code) => {
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

async function getPageStatus(pageId: string): Promise<string | null> {
  const page = (await enhancedNotion.pagesRetrieve({
    page_id: pageId,
  })) as {
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
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    throwIfAborted(signal, timeoutMs);
    try {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          [NOTION_PROPERTIES.STATUS]: {
            select: {
              name: DRAFT_PUBLISHED_STATUS,
            },
          },
        },
      });
      return true;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        return false;
      }
      const backoffMs = 250 * Math.pow(2, attempt);
      await sleepWithAbort(backoffMs, signal, timeoutMs);
      if (error) {
        continue;
      }
    }
  }
  return false;
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
    // Wrap fetchAllNotionData with timeout since it doesn't support AbortSignal
    // This ensures the Notion API fetch phase respects JOB_TIMEOUT_MS
    const fetchResult = await withTimeout(
      fetchAllNotionData({
        includeRemoved: false,
        statusFilter:
          type === "fetch-ready"
            ? NOTION_PROPERTIES.READY_TO_PUBLISH
            : undefined,
        maxPages:
          options.maxPages && options.maxPages > 0
            ? options.maxPages
            : undefined,
        exportFiles: false,
        sortBy: "order",
        sortDirection: "asc",
      }),
      timeoutMs,
      "Notion data fetch"
    );

    throwIfAborted(signal, timeoutMs);

    // Capture transition candidates BEFORE any child replacement or maxPages slicing.
    // The fetch-ready flow may replace parent pages with their children, but we need
    // to transition the original "Ready to publish" pages to "Draft published".
    const transitionCandidates =
      type === "fetch-ready"
        ? fetchResult.pages
            .filter(
              (page) => page.status === NOTION_PROPERTIES.READY_TO_PUBLISH
            )
            .map((page) => page.id)
        : [];

    const pages = normalizePages(fetchResult.pages, options.maxPages);
    terminal.pagesProcessed = pages.length;

    if (pages.length === 0) {
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
        terminal,
      };
    }

    tempDir = resolve(tmpdir(), `fetch-job-${jobId}`);
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
        const currentStatus = await getPageStatus(pageId);
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
    logger.error("Fetch job failed", {
      error: classified.message,
      code: classified.code,
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
