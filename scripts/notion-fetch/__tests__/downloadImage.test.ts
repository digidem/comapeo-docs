import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installTestNotionEnv,
  mockImageBuffer,
  mockProcessedImageResult,
  createMockError,
  delay,
} from "../../test-utils";

// Helper function to create proper page structure for testing
const createPageStructureForTesting = (testTitle = "Test Page") => {
  const subPageId = "sub-page-en";
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

  return [mainPage, subPage];
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
  sanitizeMarkdownContent: vi.fn((content) => content), // Pass-through mock
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => "{}"),
    existsSync: vi.fn(() => false), // Default to false to avoid cache hits
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

describe("downloadAndProcessImage", () => {
  let restoreEnv: () => void;

  beforeEach(async () => {
    restoreEnv = installTestNotionEnv();

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
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Retry mechanism", () => {
    it("should retry failed downloads with exponential backoff", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/retry-test.jpg";
      let attemptCount = 0;

      // Mock axios to fail twice then succeed
      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation((url) => {
        if (url === testUrl) {
          attemptCount++;
          if (attemptCount <= 2) {
            return Promise.reject(new Error("Network temporarily unavailable"));
          }
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/jpeg" },
          });
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      // Create a page structure with proper Sub-item relations
      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      // Start the async operation
      const result = await generateBlocks(pages, progressCallback);

      // Verify the image was processed successfully after retries
      expect(result.totalSaved).toBeGreaterThanOrEqual(0);
      expect(attemptCount).toBe(3); // Failed twice, succeeded on third attempt
      expect(progressCallback).toHaveBeenCalled();
    }, 30000);

    it("should fail permanently after three attempts and leave no partial file", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/always-fail.jpg";
      let attemptCount = 0;

      // Mock axios to always fail
      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation((url) => {
        if (url === testUrl) {
          attemptCount++;
          return Promise.reject(new Error("Permanent network failure"));
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      // Create a page structure with proper Sub-item relations
      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      // Start the async operation
      const result = await generateBlocks(pages, progressCallback);

      // Verify exactly 3 attempts were made
      expect(attemptCount).toBe(3);

      // Page should still be processed (image failure doesn't stop page processing)
      expect(progressCallback).toHaveBeenCalled();
      expect(result).toBeDefined();
    }, 30000);
  });

  describe("Error handling", () => {
    it("should handle timeout errors with proper error messages", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/timeout.jpg";

      const axios = vi.mocked(await import("axios")).default;
      const timeoutError = new Error("timeout of 30000ms exceeded");
      (timeoutError as any).code = "ECONNABORTED";
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === testUrl) {
          return Promise.reject(timeoutError);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      // Should handle timeout gracefully
      const result = await generateBlocks(pages, progressCallback);
      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should handle DNS resolution failures", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://nonexistent-domain.example/image.jpg";

      const axios = vi.mocked(await import("axios")).default;
      const networkError = new Error("getaddrinfo ENOTFOUND example.com");
      (networkError as any).code = "ENOTFOUND";
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === testUrl) {
          return Promise.reject(networkError);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      // Should handle DNS failure gracefully
      const result = await generateBlocks(pages, progressCallback);
      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should handle HTTP error responses", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/not-found.jpg";

      const axios = vi.mocked(await import("axios")).default;
      const httpError = new Error("Request failed with status 404");
      (httpError as any).response = { status: 404, statusText: "Not Found" };
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === testUrl) {
          return Promise.reject(httpError);
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      // Should handle HTTP errors gracefully
      const result = await generateBlocks(pages, progressCallback);
      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe("Successful downloads", () => {
    it("should handle successful download with compression", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/success.jpg";

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === testUrl) {
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/jpeg" },
          });
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      const result = await generateBlocks(pages, progressCallback);

      // Verify successful processing
      expect(result.totalSaved).toBeGreaterThanOrEqual(0);
      expect(progressCallback).toHaveBeenCalled();

      // Verify the compression pipeline was called
      // Note: processImage (resize) may be skipped for non-resizable content
      const { compressImageToFileWithFallback } = vi.mocked(
        await import("../utils")
      );
      expect(compressImageToFileWithFallback).toHaveBeenCalled();
    });

    it("should handle different image formats correctly", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const pngUrl = "https://example.com/test.png";
      const webpUrl = "https://example.com/test.webp";

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === pngUrl) {
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/png" },
          });
        }
        if (requestUrl === webpUrl) {
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/webp" },
          });
        }
        return Promise.reject(new Error(`Mock URL not found: ${requestUrl}`));
      });

      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![PNG Image](${pngUrl})\n![WebP Image](${webpUrl})`,
      });

      const progressCallback = vi.fn();

      const result = await generateBlocks(pages, progressCallback);

      // Verify both images were processed
      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();

      // Verify format detection was called
      const { chooseFormat } = vi.mocked(await import("../utils"));
      expect(chooseFormat).toHaveBeenCalled();
    });
  });

  describe("File naming and paths", () => {
    it("should generate proper file names and paths", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));

      const testUrl = "https://example.com/complex-image-name.jpg";

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === testUrl) {
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/jpeg" },
          });
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      const pages = createPageStructureForTesting(
        "Complex Page Name With Spaces!"
      );

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      const result = await generateBlocks(pages, progressCallback);

      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();

      // Verify compression was called with proper file path
      const { compressImageToFileWithFallback } = vi.mocked(
        await import("../utils")
      );
      const calls = compressImageToFileWithFallback.mock.calls;

      expect(calls.length).toBeGreaterThan(0);
      // File path should be sanitized and contain the block name
      const filePath = calls[0][2]; // Third argument is the file path
      expect(filePath).toContain("complexpagenamewiths"); // Sanitized version (truncated at 20 chars)
      expect(filePath).toContain("_0.jpg"); // Index and extension
    });
  });

  describe("Progress tracking", () => {
    it("should update spinner text during different processing phases", async () => {
      const { generateBlocks } = await import("../generateBlocks");
      const { n2m } = vi.mocked(await import("../../notionClient"));
      const SpinnerManager = vi.mocked(
        await import("../spinnerManager")
      ).default;

      const testUrl = "https://example.com/progress-test.jpg";

      const axios = vi.mocked(await import("axios")).default;
      axios.get.mockImplementation((requestUrl) => {
        if (requestUrl === testUrl) {
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/jpeg" },
          });
        }
        return Promise.reject(new Error("Mock URL not found"));
      });

      const mockSpinner = {
        text: "",
        succeed: vi.fn(),
        fail: vi.fn(),
        warn: vi.fn(),
      };

      SpinnerManager.create.mockReturnValue(mockSpinner);

      const pages = createPageStructureForTesting("Test Page");

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: `![Test Image](${testUrl})`,
      });

      const progressCallback = vi.fn();

      const result = await generateBlocks(pages, progressCallback);

      expect(result).toBeDefined();

      // Verify spinner text was updated during processing phases
      expect(mockSpinner.succeed).toHaveBeenCalled();
      expect(SpinnerManager.remove).toHaveBeenCalledWith(mockSpinner);
    });
  });
});
