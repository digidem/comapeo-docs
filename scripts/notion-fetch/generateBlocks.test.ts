import { describe, it, expect, vi, beforeEach } from "vitest";
import { NOTION_PROPERTIES } from "../constants";

const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const readFileSyncMock = vi.fn(() => "{}");

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: mkdirSyncMock,
    writeFileSync: writeFileSyncMock,
    readFileSync: readFileSyncMock,
  },
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
  readFileSync: readFileSyncMock,
}));

vi.mock("../notionClient.js", () => ({
  n2m: {
    pageToMarkdown: vi.fn(),
    toMarkdownString: vi.fn(),
  },
}));

vi.mock("./spinnerManager.js", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
    })),
    stopAll: vi.fn(),
    remove: vi.fn(),
  },
}));

describe("generateBlocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const importModule = () => import("./generateBlocks");

  it("exposes generateBlocks", async () => {
    const module = await importModule();
    expect(typeof module.generateBlocks).toBe("function");
  });

  it("creates toggle folders even when no subpages exist", async () => {
    const { generateBlocks } = await importModule();

    // Clear directory creation during module import
    vi.clearAllMocks();

    const togglePage = {
      id: "toggle-page-id",
      properties: {
        "Content elements": {
          title: [{ plain_text: "Sample Section" }],
        },
        [NOTION_PROPERTIES.ELEMENT_TYPE]: {
          select: {
            name: "Toggle",
          },
        },
        "Sub-item": {
          relation: [],
        },
      },
    };

    await generateBlocks([togglePage], vi.fn());

    const mkdirCall = mkdirSyncMock.mock.calls.find(([dir]) =>
      /docs[\\/]sample-section$/.test(dir)
    );

    expect(mkdirCall).toBeDefined();
    expect(mkdirCall?.[1]).toEqual({ recursive: true });

    const categoryCall = writeFileSyncMock.mock.calls.find(([filePath]) =>
      /_category_\.json$/.test(filePath)
    );

    expect(categoryCall).toBeDefined();
    expect(categoryCall?.[1]).toContain('"label": "Sample Section"');
    expect(categoryCall?.[2]).toBe("utf8");
  });
});
