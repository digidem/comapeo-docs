import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { mockConsole } from "../test-utils";

const writeFileMock = vi.fn();
const databasesQueryMock = vi.fn();
const fetchNotionBlocksMock = vi.fn();

vi.mock("node:fs/promises", () => ({
  writeFile: writeFileMock,
}));

vi.mock("ora", () => ({
  default: vi.fn(() => {
    const spinner = {
      start: vi.fn(() => spinner),
      succeed: vi.fn(() => spinner),
      fail: vi.fn(() => spinner),
      stop: vi.fn(() => spinner),
      text: "",
      isSpinning: false,
    };
    return spinner;
  }),
}));

vi.mock("chalk", () => {
  const identity = (text: string) => text;

  const bold = Object.assign(identity, {
    cyan: identity,
    green: identity,
    red: identity,
    yellow: identity,
    magenta: identity,
    blue: identity,
  });

  return {
    default: {
      bold,
      cyan: identity,
      blue: identity,
      green: identity,
      yellow: identity,
      red: identity,
      gray: identity,
    },
  };
});

vi.mock("../notionClient", () => ({
  enhancedNotion: {
    databasesQuery: databasesQueryMock,
  },
  DATABASE_ID: "test-database-id",
}));

vi.mock("../fetchNotionData", () => ({
  fetchNotionBlocks: fetchNotionBlocksMock,
}));

vi.mock("../constants", () => ({
  NOTION_PROPERTIES: {
    TITLE: "Title",
    STATUS: "Status",
    READY_TO_PUBLISH: "Ready to publish",
    ELEMENT_TYPE: "Element Type",
  },
}));

describe("exportNotionDatabase", () => {
  const samplePage = {
    id: "page-1",
    url: "https://notion.so/page1",
    last_edited_time: "2024-01-02T12:34:56.000Z",
    properties: {
      Title: {
        title: [
          {
            plain_text: "Sample Page",
          },
        ],
      },
      Status: {
        select: { name: "Ready to publish" },
      },
      "Element Type": {
        select: { name: "Guide" },
      },
      Language: {
        select: { name: "English" },
      },
    },
  };

  const sampleBlocks = [
    {
      id: "block-1",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            plain_text: "Hello world",
          },
        ],
      },
      has_children: false,
      archived: false,
      created_time: "2024-01-02T12:34:56.000Z",
      last_edited_time: "2024-01-02T12:34:56.000Z",
    },
  ];

  let consoleMocks: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    consoleMocks = mockConsole();

    process.env.NOTION_API_KEY = "test-key";
    process.env.DATABASE_ID = "test-database-id";

    databasesQueryMock.mockResolvedValue({
      results: [samplePage],
      has_more: false,
    });

    fetchNotionBlocksMock.mockResolvedValue(sampleBlocks);
    writeFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleMocks.restore();
  });

  it("writes export and analysis files with full data", async () => {
    const { exportNotionDatabase } = await import("./exportDatabase");

    await exportNotionDatabase({
      verbose: true,
      quick: false,
      includeRawData: true,
    });

    expect(databasesQueryMock).toHaveBeenCalledWith({
      database_id: "test-database-id",
    });

    expect(fetchNotionBlocksMock).toHaveBeenCalledWith("page-1");
    expect(writeFileMock).toHaveBeenCalledTimes(2);

    const [completePath, completePayload] = writeFileMock.mock.calls[0];
    const [analysisPath, analysisPayload] = writeFileMock.mock.calls[1];

    expect(completePath).toContain(`${path.sep}notion_db_complete_`);
    expect(analysisPath).toContain(`${path.sep}notion_content_analysis_`);

    const completeJson = JSON.parse(completePayload as string);
    expect(completeJson.metadata.totalPages).toBe(1);
    expect(completeJson.statistics.statusBreakdown["Ready to publish"]).toBe(1);
    expect(completeJson.pages[0]).toMatchObject({
      id: "page-1",
      title: "Sample Page",
      totalBlocks: 1,
    });
    expect(completeJson.rawData.pages[0].blocks).toHaveLength(1);

    const summaryJson = JSON.parse(analysisPayload as string);
    expect(summaryJson.summary.totalPages).toBe(1);
    expect(summaryJson.summary.readyToPublish).toBe(1);
    expect(summaryJson.summary.emptyPages).toBe(0);
  });

  it("omits raw data and tolerates block fetch failures", async () => {
    databasesQueryMock.mockResolvedValueOnce({
      results: [samplePage, { ...samplePage, id: "page-2" }],
      has_more: false,
    });

    fetchNotionBlocksMock
      .mockResolvedValueOnce(sampleBlocks)
      .mockRejectedValueOnce(new Error("network error"));

    const { exportNotionDatabase } = await import("./exportDatabase");

    await exportNotionDatabase({
      verbose: false,
      quick: true,
      includeRawData: false,
    });

    expect(writeFileMock).toHaveBeenCalledTimes(2);

    const completePayload = writeFileMock.mock.calls[0][1] as string;
    const completeJson = JSON.parse(completePayload);

    expect(completeJson.rawData).toBeUndefined();
    expect(completeJson.metadata.totalPages).toBe(2);

    const summaryPayload = writeFileMock.mock.calls[1][1] as string;
    const summaryJson = JSON.parse(summaryPayload);
    expect(summaryJson.summary.totalPages).toBe(2);

    expect(consoleMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch blocks for page page-2")
    );
  });
});
