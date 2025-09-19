import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { createTempDir, cleanupTempDir, mockConsole } from "../test-utils";

const writeFileMock = vi.fn();
const databasesQueryMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  writeFile: writeFileMock,
}));

vi.mock("../notionClient.js", () => ({
  enhancedNotion: {
    databasesQuery: databasesQueryMock,
  },
  DATABASE_ID: "test-database-id",
}));

vi.mock("chalk", () => ({
  default: {
    cyan: vi.fn((text) => text),
    green: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    red: vi.fn((text) => text),
  },
}));

describe("exportNotionDatabase", () => {
  let originalCwd: () => string;
  let tempDir: string;
  let consoleMocks: ReturnType<typeof mockConsole>;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalCwd = process.cwd;
    tempDir = await createTempDir();
    process.cwd = () => tempDir;
    consoleMocks = mockConsole();

    databasesQueryMock.mockReset();
    writeFileMock.mockReset();
  });

  afterEach(async () => {
    consoleMocks.restore();
    process.cwd = originalCwd;
    await cleanupTempDir(tempDir);
    vi.resetModules();
  });

  it("should export full dataset with ready-to-publish summary", async () => {
    const pageA = {
      id: "page-a",
      properties: {
        Status: { select: { name: "Ready to publish" } },
      },
    };
    const pageB = {
      id: "page-b",
      properties: {
        Status: { select: { name: "Draft" } },
      },
    };

    databasesQueryMock
      .mockResolvedValueOnce({
        results: [pageA],
        has_more: true,
        next_cursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        results: [pageB],
        has_more: false,
        next_cursor: null,
      });

    const { exportNotionDatabase } = await import("./exportDatabase");

    await exportNotionDatabase();

    expect(databasesQueryMock).toHaveBeenCalledTimes(2);
    expect(databasesQueryMock).toHaveBeenNthCalledWith(1, {
      database_id: "test-database-id",
    });
    expect(databasesQueryMock).toHaveBeenNthCalledWith(2, {
      database_id: "test-database-id",
      start_cursor: "cursor-1",
    });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [outputPath, content] = writeFileMock.mock.calls[0];
    expect(outputPath).toBe(path.join(tempDir, "notion_db.json"));

    const payload = JSON.parse(content);
    expect(payload.total).toBe(2);
    expect(payload.readyToPublishTotal).toBe(1);
    expect(payload.readyToPublishIds).toEqual(["page-a"]);
    expect(payload.results).toEqual([pageA, pageB]);

    expect(
      consoleMocks.log.mock.calls.some((args) =>
        args.join(" ").includes("Exported 2 pages")
      )
    ).toBe(true);
    expect(
      consoleMocks.log.mock.calls.some((args) =>
        args.join(" ").includes('1 items are marked as "Ready to publish"')
      )
    ).toBe(true);
  });
});
