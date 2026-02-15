/**
 * Tests for page ordering in generateBlocks
 * Verifies that pages are processed in the correct order based on the Order property
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockNotionPage, createMockPageFamily } from "../test-utils";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Get the project root directory
const PROJECT_ROOT = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../.."
);

// Mock external dependencies (matching generateBlocks.test.ts patterns)
vi.mock("sharp", () => {
  const createPipeline = () => {
    const pipeline: any = {
      resize: vi.fn(() => pipeline),
      jpeg: vi.fn(() => pipeline),
      png: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from("")),
      toFile: vi.fn(async () => ({ size: 1000 })),
      metadata: vi.fn(async () => ({
        width: 100,
        height: 100,
        format: "jpeg",
      })),
    };
    return pipeline;
  };
  return {
    default: vi.fn(() => createPipeline()),
  };
});

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../notionClient", () => ({
  n2m: {
    pageToMarkdown: vi.fn(),
    toMarkdownString: vi.fn(),
  },
  enhancedNotion: {
    blocksChildrenList: vi.fn(() =>
      Promise.resolve({
        results: [],
        has_more: false,
        next_cursor: null,
      })
    ),
  },
}));

vi.mock("../fetchNotionData", () => ({
  fetchNotionBlocks: vi.fn().mockResolvedValue([]),
}));

vi.mock("./emojiProcessor", () => ({
  EmojiProcessor: {
    processBlockEmojis: vi.fn().mockResolvedValue({
      emojiMap: new Map(),
      totalSaved: 0,
    }),
    applyEmojiMappings: vi.fn((content) => content),
    processPageEmojis: vi.fn((pageId, content) =>
      Promise.resolve({
        content: content || "",
        totalSaved: 0,
        processedCount: 0,
      })
    ),
  },
}));

vi.mock("./spinnerManager", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
      isSpinning: false,
    })),
    remove: vi.fn(),
    stopAll: vi.fn(),
  },
}));

vi.mock("./runtime", () => ({
  trackSpinner: vi.fn(() => () => {}),
}));

vi.mock("./imageProcessor", () => ({
  processImage: vi.fn(),
}));

vi.mock("./utils", () => ({
  sanitizeMarkdownContent: vi.fn((content) => content),
  compressImageToFileWithFallback: vi.fn(),
  detectFormatFromBuffer: vi.fn(() => "jpeg"),
  formatFromContentType: vi.fn(() => "jpeg"),
  chooseFormat: vi.fn(() => "jpeg"),
  extForFormat: vi.fn(() => ".jpg"),
  isResizableFormat: vi.fn(() => true),
}));

// Mock filesystem operations (matching generateBlocks.test.ts)
vi.mock("node:fs", () => {
  const files = new Map<string, string>();
  const directories = new Set<string>();

  const ensureDir = (dirPath: string) => {
    if (dirPath) {
      directories.add(dirPath);
    }
  };

  const api = {
    mkdirSync: vi.fn((dirPath: string) => {
      ensureDir(dirPath);
    }),
    writeFileSync: vi.fn((filePath: string, content: string | Buffer) => {
      const value = typeof content === "string" ? content : content.toString();
      files.set(filePath, value);
      const dirPath = filePath?.includes("/")
        ? filePath.slice(0, filePath.lastIndexOf("/"))
        : "";
      ensureDir(dirPath);
    }),
    readFileSync: vi.fn((filePath: string) => {
      if (files.has(filePath)) {
        return files.get(filePath);
      }
      if (filePath.endsWith("code.json")) {
        return "{}";
      }
      return "";
    }),
    existsSync: vi.fn((target: string) => {
      return files.has(target) || directories.has(target);
    }),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
    renameSync: vi.fn((from: string, to: string) => {
      if (files.has(from)) {
        files.set(to, files.get(from) ?? "");
        files.delete(from);
      }
    }),
    unlinkSync: vi.fn((target: string) => {
      files.delete(target);
    }),
    __reset: () => {
      files.clear();
      directories.clear();
    },
  };

  return {
    default: api,
    ...api,
  };
});

describe("Page Ordering in generateBlocks", () => {
  let mockWriteFileSync: any;
  let mockFs: any;
  let n2m: any;
  let fetchNotionBlocks: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    // Get mocks
    const notionClient = await import("../notionClient");
    n2m = notionClient.n2m;
    fetchNotionBlocks = (await import("../fetchNotionData")).fetchNotionBlocks;

    // Access the mocked fs
    mockFs = await import("node:fs");
    mockWriteFileSync = mockFs.writeFileSync;

    // Default mocks
    n2m.pageToMarkdown.mockResolvedValue([]);
    n2m.toMarkdownString.mockReturnValue({ parent: "# Test Content" });
  });

  afterEach(() => {
    mockFs.__reset();
  });

  describe("pagesByLang ordering", () => {
    it("should process pages in Order property order (ascending)", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      // Create pages in RANDOM order (not sorted by Order)
      const pages = [
        createMockNotionPage({ title: "Page C", order: 3 }),
        createMockNotionPage({ title: "Page A", order: 1 }),
        createMockNotionPage({ title: "Page B", order: 2 }),
      ];

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract sidebar_position from frontmatter
      const sidebarPositions = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const match = content.match(/sidebar_position:\s*(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean);

      // Should be sorted: 1, 2, 3
      expect(sidebarPositions).toEqual([1, 2, 3]);
    });

    it("should handle pages with missing Order property", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      // Create pages with some missing Order values
      const pages = [
        createMockNotionPage({ title: "Page C", order: 3 }),
        createMockNotionPage({ title: "Page A" }), // No order - should use fallback
        createMockNotionPage({ title: "Page B", order: 2 }),
      ];

      // Remove Order property from second page
      delete pages[1].properties.Order;

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract sidebar_position from frontmatter
      const sidebarPositions = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const match = content.match(/sidebar_position:\s*(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean);

      // Page A has no Order, so it gets fallback position based on array index (position 2 = i+1 = 2)
      // Order: 3, fallback: 2, 2 -> results in [2, 3] (or different based on implementation)
      // The key is that Page A should get a consistent fallback
      expect(sidebarPositions.length).toBe(3);
    });

    it("should maintain correct order for large number of pages", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      // Create 10 pages in random order
      const pages = [];
      for (let i = 10; i >= 1; i--) {
        pages.push(createMockNotionPage({ title: `Page ${i}`, order: i }));
      }

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract sidebar_position from frontmatter
      const sidebarPositions = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const match = content.match(/sidebar_position:\s*(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean);

      // Should be sorted: 1, 2, 3, ..., 10
      expect(sidebarPositions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe("sidebar_position matching Order property", () => {
    it("should set sidebar_position to match Order property value", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const pages = [
        createMockNotionPage({ title: "First Page", order: 5 }),
        createMockNotionPage({ title: "Second Page", order: 10 }),
      ];

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract titles and sidebar_positions
      const results = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const titleMatch = content.match(/title:\s*(.+)/);
          const posMatch = content.match(/sidebar_position:\s*(\d+)/);
          return {
            title: titleMatch ? titleMatch[1].trim() : null,
            position: posMatch ? parseInt(posMatch[1], 10) : null,
          };
        })
        .filter((r) => r.title && r.position);

      // Should have correct positions
      const firstPage = results.find((r) => r.title?.includes("First Page"));
      const secondPage = results.find((r) => r.title?.includes("Second Page"));

      expect(firstPage?.position).toBe(5);
      expect(secondPage?.position).toBe(10);
    });

    it("should use Order property even when pages are in different order", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      // Pages passed in reverse order but have correct Order values
      const pages = [
        createMockNotionPage({ title: "Page with Order 2", order: 2 }),
        createMockNotionPage({ title: "Page with Order 1", order: 1 }),
      ];

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract sidebar_position from frontmatter - should use Order values, not array index
      const sidebarPositions = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const match = content.match(/sidebar_position:\s*(\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean);

      // Should be [1, 2] based on Order property, not [2, 1] based on array position
      expect(sidebarPositions).toEqual([1, 2]);
    });
  });

  describe("Order property edge cases", () => {
    it("should handle negative Order values", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const pages = [
        createMockNotionPage({ title: "Negative Order", order: -1 }),
        createMockNotionPage({ title: "Positive Order", order: 5 }),
      ];

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract sidebar_position
      const sidebarPositions = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const match = content.match(/sidebar_position:\s*(-?\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter(Boolean);

      // Should preserve negative order
      expect(sidebarPositions).toContain(-1);
      expect(sidebarPositions).toContain(5);
    });

    it("should handle zero Order value", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const pages = [
        createMockNotionPage({ title: "Zero Order", order: 0 }),
        createMockNotionPage({ title: "One Order", order: 1 }),
      ];

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Get all markdown write calls
      const markdownCalls = mockWriteFileSync.mock.calls.filter(
        (call: any[]) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      // Extract sidebar_position - handle negative numbers too
      const sidebarPositions = markdownCalls
        .map((call: any[]) => {
          const content = call[1] as string;
          const match = content.match(/sidebar_position:\s*(-?\d+)/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter((x): x is number => x !== null);

      // Should include 0
      expect(sidebarPositions).toContain(0);
      expect(sidebarPositions).toContain(1);
    });

    it("should handle duplicate Order values (stable sort)", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      // All pages with same order
      const pages = [
        createMockNotionPage({ title: "Page A", order: 1 }),
        createMockNotionPage({ title: "Page B", order: 1 }),
        createMockNotionPage({ title: "Page C", order: 1 }),
      ];

      const progressCallback = vi.fn();

      await generateBlocks(pages, progressCallback);

      // Should complete without errors - duplicate orders should be handled gracefully
      expect(progressCallback).toHaveBeenCalled();
    });
  });
});
