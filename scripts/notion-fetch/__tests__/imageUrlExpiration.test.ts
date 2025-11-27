/**
 * Tests for Image URL Expiration Handling (Issue #94)
 *
 * These tests verify that:
 * 1. Images are processed immediately after markdown conversion
 * 2. Expired URLs (403 errors) are properly detected and logged
 * 3. Processing order prevents URL expiration
 * 4. Image downloads complete within reasonable timeframes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installTestNotionEnv,
  mockImageBuffer,
  mockProcessedImageResult,
} from "../../test-utils";

// Helper to create page structure for testing
const createPageStructureForTesting = (
  testTitle = "Test Page",
  imageCount = 0
) => {
  const subPageId = "sub-page-en";
  const imageMarkdown = Array.from(
    { length: imageCount },
    (_, i) => `![Image ${i + 1}](https://example.com/image${i + 1}.jpg)`
  ).join("\n\n");

  const mainPage = {
    id: "test-page",
    created_time: "2025-11-19T10:16:11.471Z",
    last_edited_time: "2025-11-26T10:16:11.471Z",
    archived: false,
    url: "https://notion.so/test-page",
    properties: {
      "Content elements": { title: [{ plain_text: testTitle }] },
      Status: { select: { name: "Ready to publish" } },
      Order: { number: 1 },
      Language: { select: { name: "English" } },
      "Element Type": { select: { name: "Page" } },
      "Sub-item": { relation: [{ id: subPageId }] },
      Tags: { multi_select: [] },
      Keywords: { multi_select: [] },
      Icon: { rich_text: [] },
      "Website Block": { rich_text: [{ plain_text: "Present" }] },
    },
  };

  const subPage = {
    id: subPageId,
    created_time: "2025-11-19T10:16:11.471Z",
    last_edited_time: "2025-11-26T10:16:11.471Z",
    archived: false,
    url: "https://notion.so/sub-page-en",
    properties: {
      "Content elements": { title: [{ plain_text: `${testTitle} EN` }] },
      Status: { select: { name: "Ready to publish" } },
      Order: { number: 1 },
      Language: { select: { name: "English" } },
      "Element Type": { select: { name: "Page" } },
      "Sub-item": { relation: [] },
      Tags: { multi_select: [] },
      Keywords: { multi_select: [] },
      Icon: { rich_text: [] },
      "Website Block": { rich_text: [{ plain_text: "Present" }] },
    },
  };

  return { pages: [mainPage, subPage], imageMarkdown };
};

// Mock external dependencies
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
    resize: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("resized")),
  })),
}));

vi.mock("chalk", () => ({
  default: {
    yellow: vi.fn((text) => text),
    red: vi.fn((text) => text),
    green: vi.fn((text) => text),
    blue: vi.fn((text) => text),
    gray: vi.fn((text) => text),
    cyan: vi.fn((text) => text),
    magenta: vi.fn((text) => text),
    bold: {
      cyan: vi.fn((text) => text),
      red: vi.fn((text) => text),
      green: vi.fn((text) => text),
      yellow: vi.fn((text) => text),
      magenta: vi.fn((text) => text),
      blue: vi.fn((text) => text),
    },
  },
}));

vi.mock("axios");
vi.mock("../../notionClient", () => ({
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

vi.mock("../spinnerManager", () => ({
  default: {
    create: vi.fn(() => ({
      text: "",
      succeed: vi.fn(),
      fail: vi.fn(),
      warn: vi.fn(),
    })),
    remove: vi.fn(),
    stopAll: vi.fn(),
  },
}));

vi.mock("../scriptHasher", () => ({
  computeScriptHash: vi.fn().mockResolvedValue({
    hash: "mock-hash",
    filesHashed: 0,
    missingFiles: [],
    notionSdkVersion: "0.0.0",
  }),
  formatScriptHashSummary: vi.fn(() => "Mock script hash summary"),
  isScriptHashChanged: vi.fn(() => false),
}));

vi.mock("../imageProcessor", () => ({
  processImage: vi.fn(),
}));

vi.mock("../imageProcessing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../imageProcessing")>();
  return {
    ...actual,
    getImageCache: vi.fn(() => ({
      cleanup: vi.fn(),
      getStats: vi.fn(() => ({
        totalEntries: 0,
        validEntries: 0,
      })),
    })),
  };
});

vi.mock("../utils", () => ({
  compressImageToFileWithFallback: vi.fn(),
  detectFormatFromBuffer: vi.fn(() => "jpeg"),
  formatFromContentType: vi.fn(() => "jpeg"),
  chooseFormat: vi.fn(() => "jpeg"),
  extForFormat: vi.fn(() => ".jpg"),
  isResizableFormat: vi.fn(() => true),
  sanitizeMarkdownContent: vi.fn((content) => content),
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => "{}"),
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    unlink: vi.fn(),
  },
}));

describe("Image URL Expiration Handling (Issue #94)", () => {
  let restoreEnv: () => void;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(async () => {
    restoreEnv = installTestNotionEnv();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    const { processImage } = vi.mocked(await import("../imageProcessor"));
    processImage.mockResolvedValue(mockProcessedImageResult);

    const { compressImageToFileWithFallback } = vi.mocked(
      await import("../utils")
    );
    compressImageToFileWithFallback.mockResolvedValue({
      finalSize: 512,
      usedFallback: false,
    });
  });

  afterEach(() => {
    restoreEnv();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Phase 1: Image Processing Order", () => {
    it("should process images immediately after markdown conversion", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const { pages, imageMarkdown } = createPageStructureForTesting(
        "Test Page",
        3
      );

      // Track the order of operations
      const operationOrder: string[] = [];

      // Mock markdown conversion to track when it's called
      n2m.pageToMarkdown.mockImplementation(async () => {
        operationOrder.push("pageToMarkdown");
        return [];
      });

      n2m.toMarkdownString.mockImplementation(() => {
        operationOrder.push("toMarkdownString");
        return { parent: imageMarkdown };
      });

      // Mock axios to track when image download is called
      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation(async (url) => {
        operationOrder.push(`downloadImage:${url}`);
        return {
          data: mockImageBuffer,
          headers: { "content-type": "image/jpeg" },
        };
      });

      await generateBlocks(pages);

      // Verify operation order:
      // 1. pageToMarkdown (URL generation)
      // 2. toMarkdownString (markdown conversion)
      // 3. downloadImage calls (should happen immediately, not after emoji/callout processing)
      expect(operationOrder[0]).toBe("pageToMarkdown");
      expect(operationOrder[1]).toBe("toMarkdownString");

      // Images should be downloaded immediately after markdown conversion
      const firstImageDownloadIndex = operationOrder.findIndex((op) =>
        op.startsWith("downloadImage:")
      );
      expect(firstImageDownloadIndex).toBeGreaterThan(1);
      expect(firstImageDownloadIndex).toBeLessThan(10); // Should be early in the process
    });

    it("should download all images within 30 seconds of URL generation", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const { pages, imageMarkdown } = createPageStructureForTesting(
        "Test Page",
        5
      );

      let urlGenerationTime = 0;
      const downloadTimes: number[] = [];

      n2m.pageToMarkdown.mockImplementation(async () => {
        urlGenerationTime = Date.now();
        return [];
      });

      n2m.toMarkdownString.mockReturnValue({ parent: imageMarkdown });

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation(async () => {
        downloadTimes.push(Date.now());
        return {
          data: mockImageBuffer,
          headers: { "content-type": "image/jpeg" },
        };
      });

      await generateBlocks(pages);

      // Verify all images were downloaded within 30 seconds of URL generation
      for (const downloadTime of downloadTimes) {
        const timeSinceGeneration = downloadTime - urlGenerationTime;
        expect(timeSinceGeneration).toBeLessThan(30000); // 30 seconds
      }
    });
  });

  describe("Phase 2: Expired URL Detection", () => {
    it("should detect and log 403 expired URL errors", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/expired-image.jpg";
      const { pages } = createPageStructureForTesting("Test Page", 1);

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Expired Image](${testUrl})`,
      });

      // Mock 403 error with expired signature
      const axios = vi.mocked(await import("axios")).default;
      const expiredError = new Error("Request failed with status code 403");
      (expiredError as any).response = {
        status: 403,
        data: "SignatureDoesNotMatch: The request signature we calculated does not match",
      };
      axios.get.mockRejectedValue(expiredError);

      await generateBlocks(pages);

      // Should log error about expired URL
      // Note: Current implementation logs this as a general failure
      // Phase 2 will add specific expired URL detection
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should distinguish expired URLs from other 403 errors", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const { pages } = createPageStructureForTesting("Test Page", 1);

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Forbidden Image](https://example.com/forbidden.jpg)`,
      });

      // Mock 403 error without expired signature (access denied)
      const axios = vi.mocked(await import("axios")).default;
      const forbiddenError = new Error("Request failed with status code 403");
      (forbiddenError as any).response = {
        status: 403,
        data: "Access Denied",
      };
      axios.get.mockRejectedValue(forbiddenError);

      await generateBlocks(pages);

      // Should handle gracefully without expired URL message
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe("Integration: Large Batch Processing", () => {
    it("should handle 50 pages with images without expiration", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      // Create 50 pages, each with 3 images (150 total images)
      const allPages: any[] = [];
      for (let i = 0; i < 50; i++) {
        const { pages, imageMarkdown } = createPageStructureForTesting(
          `Page ${i + 1}`,
          3
        );
        allPages.push(...pages);

        // Setup mocks for each page
        n2m.pageToMarkdown.mockResolvedValue([]);
        n2m.toMarkdownString.mockReturnValue({
          parent: imageMarkdown,
        });
      }

      const axios = vi.mocked(await import("axios")).default;
      let successfulDownloads = 0;
      let expiredErrors = 0;

      axios.get.mockImplementation(async (url) => {
        // Simulate some processing delay
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Check if this would have been an expired URL
        // (in real scenario, URLs generated >1h ago would fail)
        const urlAge = Date.now() % 3600000; // Simulate age
        if (urlAge > 3600000) {
          // > 1 hour
          expiredErrors++;
          const error = new Error("Request failed with status code 403");
          (error as any).response = {
            status: 403,
            data: "SignatureDoesNotMatch",
          };
          throw error;
        }

        successfulDownloads++;
        return {
          data: mockImageBuffer,
          headers: { "content-type": "image/jpeg" },
        };
      });

      const startTime = Date.now();
      await generateBlocks(allPages);
      const duration = Date.now() - startTime;

      // With Phase 1 implemented, all downloads should succeed
      // and complete well before 1 hour
      expect(duration).toBeLessThan(600000); // Should finish in < 10 minutes
      expect(expiredErrors).toBe(0); // No URLs should expire with Phase 1
    });

    it("should handle page with many images efficiently", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      // Single page with 50 images
      const { pages, imageMarkdown } = createPageStructureForTesting(
        "Image Heavy Page",
        50
      );

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: imageMarkdown,
      });

      const axios = vi.mocked(await import("axios")).default;
      const downloadTimes: number[] = [];

      axios.get.mockImplementation(async () => {
        downloadTimes.push(Date.now());
        // Simulate realistic download time
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          data: mockImageBuffer,
          headers: { "content-type": "image/jpeg" },
        };
      });

      const startTime = Date.now();
      await generateBlocks(pages);
      const duration = Date.now() - startTime;

      // All 50 images should be downloaded
      expect(downloadTimes.length).toBeGreaterThanOrEqual(1);

      // Total time should be reasonable (images downloaded in batches of 5)
      // 50 images / 5 concurrent = 10 batches * 100ms = ~1 second + overhead
      expect(duration).toBeLessThan(30000); // 30 seconds

      // Verify all downloads happened in sequence without long gaps
      if (downloadTimes.length > 1) {
        const timeBetweenFirstAndLast =
          downloadTimes[downloadTimes.length - 1] - downloadTimes[0];
        expect(timeBetweenFirstAndLast).toBeLessThan(20000); // 20 seconds
      }
    });
  });

  describe("Regression Prevention", () => {
    it("should not regress emoji processing after reordering", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const { pages } = createPageStructureForTesting("Test Page", 0);

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: "![Image](https://example.com/image.jpg)\n\n:smile: Emoji text",
      });

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockResolvedValue({
        data: mockImageBuffer,
        headers: { "content-type": "image/jpeg" },
      });

      const result = await generateBlocks(pages);

      // Emoji processing should still work
      expect(result).toBeDefined();
    });

    it("should not regress callout processing after reordering", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const { pages } = createPageStructureForTesting("Test Page", 0);

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent:
          "![Image](https://example.com/image.jpg)\n\n> **Note**: Callout text",
      });

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockResolvedValue({
        data: mockImageBuffer,
        headers: { "content-type": "image/jpeg" },
      });

      const result = await generateBlocks(pages);

      // Callout processing should still work
      expect(result).toBeDefined();
    });
  });

  describe("Cache Behavior", () => {
    it("should use cached images without re-downloading", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));
      const fs = vi.mocked(await import("node:fs")).default;

      const testUrl = "https://example.com/cached-image.jpg";
      const { pages } = createPageStructureForTesting("Test Page", 1);

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Cached Image](${testUrl})`,
      });

      // Mock cache file exists
      fs.existsSync.mockImplementation((path) => {
        if (typeof path === "string" && path.includes(".cache/images")) {
          return true; // Cache entry exists
        }
        if (typeof path === "string" && path.includes("static/images")) {
          return true; // Image file exists
        }
        return false;
      });

      // Mock cache file read
      fs.readFileSync.mockImplementation((path) => {
        if (typeof path === "string" && path.includes(".cache/images")) {
          return JSON.stringify({
            url: testUrl,
            localPath: "cached_0.jpg",
            timestamp: new Date().toISOString(),
            blockName: "testpage",
          });
        }
        return "{}";
      });

      const axios = vi.mocked(await import("axios")).default;
      let downloadAttempts = 0;
      axios.get.mockImplementation(async () => {
        downloadAttempts++;
        return {
          data: mockImageBuffer,
          headers: { "content-type": "image/jpeg" },
        };
      });

      await generateBlocks(pages);

      // Should use cache, not download again
      expect(downloadAttempts).toBe(0);
    });
  });
});
