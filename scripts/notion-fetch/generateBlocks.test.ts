import { describe, it, expect, vi, beforeEach } from "vitest";
import { NOTION_PROPERTIES } from "../constants";

const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const readFileSyncMock = vi.fn(() => "{}");
const pageToMarkdownMock = vi.fn();
const toMarkdownStringMock = vi.fn();

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
    pageToMarkdown: pageToMarkdownMock,
    toMarkdownString: toMarkdownStringMock,
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
    pageToMarkdownMock.mockReset();
    toMarkdownStringMock.mockReset();
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

  it("writes placeholder content when website blocks are missing", async () => {
    const { generateBlocks } = await importModule();

    vi.clearAllMocks();

    pageToMarkdownMock.mockResolvedValue([]);
    toMarkdownStringMock.mockReturnValue({ parent: "" });

    const mainPage = {
      id: "main-page-id",
      properties: {
        "Content elements": {
          title: [{ plain_text: "Empty Section" }],
        },
        [NOTION_PROPERTIES.ELEMENT_TYPE]: {
          select: {
            name: "Page",
          },
        },
        "Sub-item": {
          relation: [{ id: "child-en" }],
        },
      },
    };

    const childPage = {
      id: "child-en",
      properties: {
        Language: {
          select: { name: "English" },
        },
        "Content elements": {
          title: [{ plain_text: "Empty page" }],
        },
        "Sub-item": {
          relation: [],
        },
      },
    };

    await generateBlocks([mainPage, childPage], vi.fn());

    const placeholderCall = writeFileSyncMock.mock.calls.find(
      ([, content]) =>
        typeof content === "string" &&
        content.includes("This page is under construction.")
    );

    expect(placeholderCall).toBeDefined();
  });
});
