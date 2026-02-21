import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NOTION_PROPERTIES } from "../scripts/constants";
import { ContentRepoError } from "./content-repo";

const {
  mockFetchAllNotionData,
  mockNotionPagesUpdate,
  mockEnhancedPagesRetrieve,
  mockAssertCleanWorkingTree,
  mockCommitGeneratedChanges,
  mockCopyGeneratedContentFromTemp,
  mockGetHeadCommitHash,
  mockHasHeadAdvancedSince,
  mockHasStagedGeneratedChanges,
  mockPrepareContentBranchForFetch,
  mockPushContentBranchWithRetry,
  mockStageGeneratedPaths,
  mockVerifyRemoteHeadMatchesLocal,
  mockSpawn,
} = vi.hoisted(() => ({
  mockFetchAllNotionData: vi.fn(),
  mockNotionPagesUpdate: vi.fn(),
  mockEnhancedPagesRetrieve: vi.fn(),
  mockAssertCleanWorkingTree: vi.fn(),
  mockCommitGeneratedChanges: vi.fn(),
  mockCopyGeneratedContentFromTemp: vi.fn(),
  mockGetHeadCommitHash: vi.fn(),
  mockHasHeadAdvancedSince: vi.fn(),
  mockHasStagedGeneratedChanges: vi.fn(),
  mockPrepareContentBranchForFetch: vi.fn(),
  mockPushContentBranchWithRetry: vi.fn(),
  mockStageGeneratedPaths: vi.fn(),
  mockVerifyRemoteHeadMatchesLocal: vi.fn(),
  mockSpawn: vi.fn(),
}));

vi.mock("../scripts/notion-fetch-all/fetchAll", () => ({
  fetchAllNotionData: mockFetchAllNotionData,
}));

vi.mock("../scripts/notionClient", () => ({
  notion: {
    pages: {
      update: mockNotionPagesUpdate,
    },
  },
  enhancedNotion: {
    pagesRetrieve: mockEnhancedPagesRetrieve,
  },
}));

vi.mock("./content-repo", () => ({
  assertCleanWorkingTree: mockAssertCleanWorkingTree,
  commitGeneratedChanges: mockCommitGeneratedChanges,
  copyGeneratedContentFromTemp: mockCopyGeneratedContentFromTemp,
  getHeadCommitHash: mockGetHeadCommitHash,
  hasHeadAdvancedSince: mockHasHeadAdvancedSince,
  hasStagedGeneratedChanges: mockHasStagedGeneratedChanges,
  prepareContentBranchForFetch: mockPrepareContentBranchForFetch,
  pushContentBranchWithRetry: mockPushContentBranchWithRetry,
  stageGeneratedPaths: mockStageGeneratedPaths,
  verifyRemoteHeadMatchesLocal: mockVerifyRemoteHeadMatchesLocal,
  ContentRepoError: class ContentRepoError extends Error {
    details?: string;
    code?:
      | "DIRTY_WORKING_TREE"
      | "PUSH_FAILED"
      | "CONTENT_GENERATION_FAILED"
      | "BRANCH_MISSING";

    constructor(message: string, details?: string, code?: any) {
      super(message);
      this.name = "ContentRepoError";
      this.details = details;
      this.code = code;
    }
  },
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

import { runFetchJob } from "./fetch-job-runner";

function createSpawnSuccessProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = stdout;
  child.stderr = stderr;

  queueMicrotask(() => {
    stdout.emit("data", Buffer.from("Progress: 1/1\n"));
    child.emit("close", 0);
  });

  return child;
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("fetch-job-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertCleanWorkingTree.mockResolvedValue(undefined);
    mockPrepareContentBranchForFetch.mockResolvedValue({
      remoteRef: "origin-content-sha",
    });
    mockHasStagedGeneratedChanges.mockResolvedValue(true);
    mockHasHeadAdvancedSince.mockResolvedValue(false);
    mockCommitGeneratedChanges.mockResolvedValue("local-sha");
    mockPushContentBranchWithRetry.mockResolvedValue("pushed-sha");
    mockVerifyRemoteHeadMatchesLocal.mockResolvedValue(undefined);
    mockCopyGeneratedContentFromTemp.mockResolvedValue(undefined);
    mockStageGeneratedPaths.mockResolvedValue(undefined);
    mockGetHeadCommitHash.mockResolvedValue("head-sha");
    mockSpawn.mockImplementation(() => createSpawnSuccessProcess());
    mockNotionPagesUpdate.mockResolvedValue(undefined);
    mockEnhancedPagesRetrieve.mockResolvedValue({
      properties: {
        [NOTION_PROPERTIES.STATUS]: {
          select: {
            name: NOTION_PROPERTIES.READY_TO_PUBLISH,
          },
        },
      },
    });
  });

  it("returns completed response for zero-page ready query", async () => {
    mockFetchAllNotionData.mockResolvedValue({
      pages: [],
      rawPages: [],
      candidateIds: [],
      fetchedCount: 0,
      processedCount: 0,
    });

    const logger = createLogger();
    const result = await runFetchJob({
      type: "fetch-ready",
      jobId: "job-1",
      options: {},
      onProgress: vi.fn(),
      logger,
      childEnv: process.env,
      signal: new AbortController().signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(true);
    expect(result.terminal.pagesProcessed).toBe(0);
    expect(result.terminal.commitHash).toBeNull();
    expect(result.terminal.pagesTransitioned).toBe(0);
    expect(result.terminal.failedPageIds).toEqual([]);
    expect(mockPrepareContentBranchForFetch).not.toHaveBeenCalled();
  });

  it("returns dryRun marker for zero-page dry-run queries", async () => {
    mockFetchAllNotionData.mockResolvedValue({
      pages: [],
      rawPages: [],
      candidateIds: [],
      fetchedCount: 0,
      processedCount: 0,
    });

    const result = await runFetchJob({
      type: "fetch-ready",
      jobId: "job-1-dry",
      options: { dryRun: true },
      onProgress: vi.fn(),
      logger: createLogger(),
      childEnv: process.env,
      signal: new AbortController().signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(true);
    expect(result.terminal.pagesProcessed).toBe(0);
    expect(result.terminal.commitHash).toBeNull();
    expect(result.terminal.dryRun).toBe(true);
  });

  it("supports dry-run without branch prep or status transitions", async () => {
    mockFetchAllNotionData.mockResolvedValue({
      pages: [
        {
          id: "page-1",
          status: NOTION_PROPERTIES.READY_TO_PUBLISH,
          order: 1,
          lastEdited: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
      rawPages: [],
      candidateIds: ["page-1"],
      fetchedCount: 1,
      processedCount: 1,
    });

    const result = await runFetchJob({
      type: "fetch-ready",
      jobId: "job-2",
      options: { dryRun: true },
      onProgress: vi.fn(),
      logger: createLogger(),
      childEnv: process.env,
      signal: new AbortController().signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(true);
    expect(result.terminal.dryRun).toBe(true);
    expect(result.terminal.commitHash).toBeNull();
    expect(mockPrepareContentBranchForFetch).not.toHaveBeenCalled();
    expect(mockNotionPagesUpdate).not.toHaveBeenCalled();
  });

  it("returns NOTION_STATUS_PARTIAL when ready-page transitions fail", async () => {
    mockFetchAllNotionData.mockResolvedValue({
      pages: [
        {
          id: "page-1",
          status: NOTION_PROPERTIES.READY_TO_PUBLISH,
          order: 1,
          lastEdited: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
      rawPages: [],
      candidateIds: ["page-1"],
      fetchedCount: 1,
      processedCount: 1,
    });
    mockNotionPagesUpdate.mockRejectedValue(new Error("status update failed"));

    const result = await runFetchJob({
      type: "fetch-ready",
      jobId: "job-3",
      options: {},
      onProgress: vi.fn(),
      logger: createLogger(),
      childEnv: process.env,
      signal: new AbortController().signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(false);
    expect(result.terminal.error?.code).toBe("NOTION_STATUS_PARTIAL");
    expect(result.terminal.commitHash).toBe("pushed-sha");
    expect(result.terminal.failedPageIds).toEqual(["page-1"]);
  });

  it("does not transition statuses for fetch-all jobs", async () => {
    mockFetchAllNotionData.mockResolvedValue({
      pages: [
        {
          id: "page-1",
          status: "Draft published",
          order: 1,
          lastEdited: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
      rawPages: [],
      candidateIds: [],
      fetchedCount: 1,
      processedCount: 1,
    });
    mockHasStagedGeneratedChanges.mockResolvedValue(false);
    mockHasHeadAdvancedSince.mockResolvedValue(true);
    mockPushContentBranchWithRetry.mockResolvedValue("merge-only-sha");

    const result = await runFetchJob({
      type: "fetch-all",
      jobId: "job-4",
      options: {},
      onProgress: vi.fn(),
      logger: createLogger(),
      childEnv: process.env,
      signal: new AbortController().signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(true);
    expect(result.terminal.commitHash).toBe("merge-only-sha");
    expect(mockNotionPagesUpdate).not.toHaveBeenCalled();
    expect(mockVerifyRemoteHeadMatchesLocal).not.toHaveBeenCalled();
  });

  it("returns CONTENT_GENERATION_FAILED when staging fails", async () => {
    mockFetchAllNotionData.mockResolvedValue({
      pages: [
        {
          id: "page-1",
          status: NOTION_PROPERTIES.READY_TO_PUBLISH,
          order: 1,
          lastEdited: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
      rawPages: [],
      candidateIds: ["page-1"],
      fetchedCount: 1,
      processedCount: 1,
    });
    mockStageGeneratedPaths.mockRejectedValue(
      new ContentRepoError(
        "Failed to stage generated paths (exit code 1)",
        "fatal: git add failed",
        "CONTENT_GENERATION_FAILED"
      )
    );

    const logger = createLogger();
    const result = await runFetchJob({
      type: "fetch-ready",
      jobId: "job-stage-fail",
      options: {},
      onProgress: vi.fn(),
      logger,
      childEnv: process.env,
      signal: new AbortController().signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(false);
    expect(result.terminal.error?.code).toBe("CONTENT_GENERATION_FAILED");
    expect(result.terminal.commitHash).toBeNull();
    expect(result.terminal.failedPageIds).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      "Fetch job failed",
      expect.objectContaining({
        code: "CONTENT_GENERATION_FAILED",
        details: "fatal: git add failed",
      })
    );
  });

  it("returns JOB_TIMEOUT and skips side effects when already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await runFetchJob({
      type: "fetch-ready",
      jobId: "job-timeout",
      options: {},
      onProgress: vi.fn(),
      logger: createLogger(),
      childEnv: process.env,
      signal: abortController.signal,
      timeoutMs: 20 * 60 * 1000,
    });

    expect(result.success).toBe(false);
    expect(result.terminal.error?.code).toBe("JOB_TIMEOUT");
    expect(result.terminal.commitHash).toBeNull();
    expect(mockFetchAllNotionData).not.toHaveBeenCalled();
    expect(mockPrepareContentBranchForFetch).not.toHaveBeenCalled();
    expect(mockNotionPagesUpdate).not.toHaveBeenCalled();
  });
});
