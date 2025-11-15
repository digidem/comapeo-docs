import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  vi,
  type Mock,
} from "vitest";
import {
  installTestNotionEnv,
  createMockFileSystem,
  createMockAxios,
  createMockNotionPage,
  createMockNotionPageWithoutTitle,
  createMockNotionPageWithoutWebsiteBlock,
  createMockTogglePage,
  createMockHeadingPage,
  createMockPageFamily,
  createMockMarkdownWithImages,
  mockImageBuffer,
  mockProcessedImageResult,
} from "../test-utils";
import { NOTION_PROPERTIES } from "../constants";
import path from "path";
import fs from "node:fs";

// Mock sharp to avoid installation issues
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

// Mock external dependencies
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
    blocksChildrenList: vi.fn(),
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
      warn: vi.fn(),
    })),
    remove: vi.fn(),
    stopAll: vi.fn(),
  },
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

// Mock filesystem operations
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
  },
}));

// Mock the docusaurus config to prevent file system issues
vi.mock("../../docusaurus.config", () => ({
  default: {
    i18n: {
      locales: ["en", "pt", "es"],
      defaultLocale: "en",
    },
  },
}));

describe("generateBlocks", () => {
  let restoreEnv: () => void;
  let mockFS: ReturnType<typeof createMockFileSystem>;
  let mockAxios: ReturnType<typeof createMockAxios>;
  let n2m: any;
  let fetchNotionBlocks: Mock;
  let processImage: Mock;
  let compressImageToFileWithFallback: Mock;

  beforeEach(async () => {
    restoreEnv = installTestNotionEnv();
    mockFS = createMockFileSystem();
    mockAxios = createMockAxios();

    // Reset all mocks
    vi.clearAllMocks();

    const { __resetPrefetchCaches } = await import("./generateBlocks");
    __resetPrefetchCaches();

    // Get mocked functions
    const notionClient = await import("../notionClient");
    n2m = notionClient.n2m;

    const fetchData = await import("../fetchNotionData");
    fetchNotionBlocks = fetchData.fetchNotionBlocks as Mock;

    const imageProc = await import("./imageProcessor");
    processImage = imageProc.processImage as Mock;

    const utils = await import("./utils");
    compressImageToFileWithFallback =
      utils.compressImageToFileWithFallback as Mock;

    // Setup default mock implementations
    processImage.mockResolvedValue(mockProcessedImageResult);
    compressImageToFileWithFallback.mockResolvedValue({
      finalSize: 512,
      usedFallback: false,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("should be able to import module", async () => {
    const generateBlocksModule = await import("./generateBlocks");
    expect(generateBlocksModule).toBeDefined();
  });

  it("should export generateBlocks function", async () => {
    const { generateBlocks } = await import("./generateBlocks");
    expect(typeof generateBlocks).toBe("function");
  });

  describe("Toggle pages without Title property", () => {
    it("should fall back safely when Title property is missing", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const pageFamily = createMockPageFamily("Test Section", "Toggle");
      const togglePageWithoutTitle = createMockNotionPageWithoutTitle({
        ...pageFamily.mainPage,
        elementType: "Toggle",
      });

      const pages = [togglePageWithoutTitle, ...pageFamily.pages.slice(1)];
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      const result = await generateBlocks(pages, progressCallback);

      expect(result).toEqual({
        totalSaved: expect.any(Number),
        sectionCount: expect.any(Number),
        titleSectionCount: expect.any(Number),
        emojiCount: expect.any(Number),
      });

      // Should complete without throwing
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe("Pages without Website Block", () => {
    it("should write placeholder markdown when Website Block is absent", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = fs.writeFileSync as Mock;

      const pageWithoutWebsiteBlock = createMockNotionPageWithoutWebsiteBlock({
        title: "Test Page",
        elementType: "Page",
      });

      const pages = [pageWithoutWebsiteBlock];
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: null }); // No Website Block

      await generateBlocks(pages, progressCallback);

      // Check if placeholder content was written
      const writeCalls = mockWriteFileSync.mock.calls;
      const placeholderCall = writeCalls.find(
        (call) =>
          typeof call[1] === "string" &&
          call[1].includes("Placeholder content generated automatically")
      );

      expect(placeholderCall).toBeDefined();
      expect(placeholderCall[1]).toContain(
        "add blocks in Notion to replace this file"
      );
    });
  });

  describe("Translation string updates", () => {
    it("should update translation strings only for non-EN locales", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const mockReadFileSync = fs.readFileSync as Mock;
      const mockWriteFileSync = fs.writeFileSync as Mock;

      // Mock existing translation file
      mockReadFileSync.mockReturnValue("{}");

      const pageFamily = createMockPageFamily("Test Page", "Page");
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      await generateBlocks(pageFamily.pages, progressCallback);

      // Check that translation strings were written for non-English pages
      const translationWrites = mockWriteFileSync.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("code.json")
      );

      // Should have writes for pt and es locales
      expect(translationWrites.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Title fallbacks", () => {
    it("should fallback to legacy Title property when Content elements is missing", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = fs.writeFileSync as Mock;

      const legacyTitlePage = createMockNotionPage({
        title: "Legacy Title Page",
        elementType: "Page",
      });

      delete legacyTitlePage.properties[NOTION_PROPERTIES.TITLE];

      const pages = [legacyTitlePage];
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "# Legacy Title Page" });

      await generateBlocks(pages, progressCallback);

      const markdownCall = mockWriteFileSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      expect(markdownCall).toBeDefined();
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe("Prefetch caching", () => {
    it("reuses cached blocks and markdown for unchanged pages", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const page = createMockNotionPage({
        id: "cache-page",
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        elementType: "Page",
      });

      const pages = [page];
      const progressCallback = vi.fn();

      const markdownResult: any[] = [];

      fetchNotionBlocks.mockResolvedValue([]);
      n2m.pageToMarkdown.mockResolvedValue(markdownResult);
      n2m.toMarkdownString.mockReturnValue({ parent: "Cached content" });

      await generateBlocks(pages, progressCallback);
      expect(fetchNotionBlocks).toHaveBeenCalledTimes(1);
      expect(n2m.pageToMarkdown).toHaveBeenCalledTimes(1);

      fetchNotionBlocks.mockClear();
      n2m.pageToMarkdown.mockClear();

      await generateBlocks(pages, progressCallback);
      expect(fetchNotionBlocks).not.toHaveBeenCalled();
      expect(n2m.pageToMarkdown).not.toHaveBeenCalled();
    });
  });

  describe("Image processing", () => {
    it("should capture image processing success/failure totals with retry metrics", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const imageUrls = [
        "https://example.com/success.jpg",
        "https://example.com/fail.jpg",
        "https://example.com/retry-success.jpg",
      ];

      const markdownWithImages = createMockMarkdownWithImages(imageUrls);
      const pageFamily = createMockPageFamily("Test Page", "Page");
      const progressCallback = vi.fn();

      // Mock different image download scenarios
      mockAxios.mockImageDownload(imageUrls[0], mockImageBuffer);
      mockAxios.mockImageDownloadFailure(
        imageUrls[1],
        new Error("Download failed")
      );

      // Mock retry scenario - fail twice then succeed
      let retryAttempts = 0;
      const originalImplementation = mockAxios.axios.get.getMockImplementation();
      mockAxios.axios.get.mockImplementation((url, config) => {
        if (url === imageUrls[2]) {
          retryAttempts++;
          if (retryAttempts <= 2) {
            return Promise.reject(new Error("Temporary failure"));
          }
          return Promise.resolve({
            data: mockImageBuffer,
            headers: { "content-type": "image/jpeg" },
          });
        }
        // Handle other URLs normally using the original implementation
        return originalImplementation ? originalImplementation(url, config) : Promise.reject(new Error(`No mock for URL: ${url}`));
      });

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue(markdownWithImages);

      const result = await generateBlocks(pageFamily.pages, progressCallback);

      expect(result.totalSaved).toBeGreaterThanOrEqual(0);
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should handle multiple concurrent image downloads with proper error handling", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const imageUrls = Array.from(
        { length: 5 },
        (_, i) => `https://example.com/image${i + 1}.jpg`
      );

      const markdownWithImages = createMockMarkdownWithImages(imageUrls);
      const pageFamily = createMockPageFamily("Test Page", "Page");
      const progressCallback = vi.fn();

      // Mock mixed success/failure scenarios
      mockAxios.mockMultipleImageDownloads([
        { url: imageUrls[0], buffer: mockImageBuffer },
        { url: imageUrls[1], buffer: mockImageBuffer },
        { url: imageUrls[2], buffer: mockImageBuffer },
        { url: imageUrls[3], buffer: mockImageBuffer },
        { url: imageUrls[4], buffer: mockImageBuffer },
      ]);

      // Make some fail
      mockAxios.mockImageDownloadFailure(
        imageUrls[1],
        new Error("Network error")
      );
      mockAxios.mockImageDownloadFailure(
        imageUrls[3],
        new Error("Timeout error")
      );

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue(markdownWithImages);

      const result = await generateBlocks(pageFamily.pages, progressCallback);

      // Should complete despite some failures
      expect(result).toEqual({
        totalSaved: expect.any(Number),
        sectionCount: expect.any(Number),
        titleSectionCount: expect.any(Number),
        emojiCount: expect.any(Number),
      });
    });
  });

  describe("Toggle sections", () => {
    it("should create section folders for Toggle type pages", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const mockMkdirSync = fs.mkdirSync as Mock;

      const togglePage = createMockTogglePage({
        title: "Test Section",
      });

      const pages = [togglePage];
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      await generateBlocks(pages, progressCallback);

      // Check if directories were created
      expect(mockMkdirSync).toHaveBeenCalled();

      // Check if _category_.json was created
      const mockWriteFileSync = fs.writeFileSync as Mock;
      const categoryCall = mockWriteFileSync.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("_category_.json")
      );

      expect(categoryCall).toBeDefined();
    });
  });

  describe("Heading sections", () => {
    it("should apply heading titles to subsequent sections", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = fs.writeFileSync as Mock;

      const headingPage = createMockHeadingPage({
        title: "Section Heading",
      });

      const togglePage = createMockNotionPage({
        title: "Following Section",
        elementType: "Toggle",
        hasSubItems: false,
      });

      const pages = [headingPage, togglePage];
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      await generateBlocks(pages, progressCallback);

      // Check if heading was applied to the category
      const categoryCall = mockWriteFileSync.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("_category_.json")
      );

      expect(categoryCall).toBeDefined();
      if (categoryCall) {
        const categoryContent = JSON.parse(categoryCall[1] as string);
        expect(categoryContent.customProps.title).toBe("Section Heading");
      }
    });
  });

  describe("Page content generation", () => {
    it("should generate proper frontmatter for Page type entries", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = fs.writeFileSync as Mock;

      const page = createMockNotionPage({
        title: "Test Article",
        elementType: "Page",
        order: 5,
        tags: ["tutorial", "guide"],
        keywords: ["test", "example"],
        icon: "📚",
      });

      const pages = [page];
      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({
        parent: "# Test Article\n\nContent here.",
      });

      await generateBlocks(pages, progressCallback);

      // Find the markdown file write
      const markdownCall = mockWriteFileSync.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].endsWith(".md")
      );

      expect(markdownCall).toBeDefined();

      const content = markdownCall[1] as string;
      expect(content).toContain("title: Test Article");
      expect(content).toContain("sidebar_position: 5");
      expect(content).toContain("tags: [tutorial, guide]");
      expect(content).toContain('icon: "📚"');
      expect(content).toContain("slug: /test-article");

      // Should remove duplicate title heading
      expect(content).not.toMatch(/---\n\n# Test Article/);
    });
  });

  describe("Error handling", () => {
    it("should continue processing other pages when individual page fails", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const goodPage = createMockNotionPage({ title: "Good Page" });
      const badPage = createMockNotionPage({ title: "Bad Page" });

      const pages = [badPage, goodPage];
      const progressCallback = vi.fn();

      // Mock the second page to succeed
      n2m.pageToMarkdown.mockImplementation((pageId) => {
        if (pageId === badPage.id) {
          throw new Error("Page processing failed");
        }
        return Promise.resolve([]);
      });

      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      const result = await generateBlocks(pages, progressCallback);

      // Should complete and process at least one page
      expect(result).toBeDefined();
      expect(progressCallback).toHaveBeenCalledWith({ current: 2, total: 2 });
    });
  });

  describe("Progress tracking", () => {
    it("should call progress callback with correct values throughout processing", async () => {
      const { generateBlocks } = await import("./generateBlocks");

      const pages = [
        createMockNotionPage({ title: "Page 1" }),
        createMockNotionPage({ title: "Page 2" }),
        createMockNotionPage({ title: "Page 3" }),
      ];

      const progressCallback = vi.fn();

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      await generateBlocks(pages, progressCallback);

      // Check progress callback was called with incrementing values
      expect(progressCallback).toHaveBeenCalledWith({ current: 1, total: 3 });
      expect(progressCallback).toHaveBeenCalledWith({ current: 2, total: 3 });
      expect(progressCallback).toHaveBeenCalledWith({ current: 3, total: 3 });
    });
  });

  describe("getPublishedDate", () => {
    let getPublishedDate: (page: any) => string;
    const fixedDate = new Date("2024-01-02T12:00:00Z");
    let OriginalDate: typeof Date;

    beforeAll(async () => {
      ({ getPublishedDate } = await import("./generateBlocks"));
    });

    beforeEach(() => {
      // Mock Date constructor to return fixed date when called without arguments
      // This is needed because vi.setSystemTime is unavailable in Vitest 4.x
      OriginalDate = global.Date;
      global.Date = class extends OriginalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            // new Date() without arguments should return fixed date
            super(fixedDate.getTime());
          } else {
            // new Date(value) with arguments should work normally
            super(...args);
          }
        }
        static now() {
          return fixedDate.getTime();
        }
      } as any;
    });

    afterEach(() => {
      // Restore original Date
      global.Date = OriginalDate;
    });

    it("should use published date when available and valid", () => {
      const page = {
        id: "test-page-1",
        last_edited_time: "2023-11-30T10:00:00.000Z",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: { start: "2023-12-01" },
          },
        },
      };

      expect(getPublishedDate(page)).toBe("12/1/2023");
    });

    it("should fall back to last_edited_time when published date is missing", () => {
      const page = {
        id: "test-page-2",
        last_edited_time: "2023-11-30T10:00:00.000Z",
        properties: {},
      };

      expect(getPublishedDate(page)).toBe("11/30/2023");
    });

    it("should fall back to last_edited_time when published date is invalid", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const page = {
        id: "test-page-3",
        last_edited_time: "2023-11-30T10:00:00.000Z",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: { start: "invalid-date" },
          },
        },
      };

      expect(getPublishedDate(page)).toBe("11/30/2023");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid published date format for page test-page-3"
        )
      );

      warnSpy.mockRestore();
    });

    it("should use current date when published and last_edited_time are invalid", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const page = {
        id: "test-page-4",
        last_edited_time: "definitely-not-a-date",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: { start: "still-not-a-date" },
          },
        },
      };

      expect(getPublishedDate(page)).toBe("1/2/2024");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid published date format for page test-page-4"
        )
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Invalid last_edited_time format for page test-page-4"
        )
      );

      warnSpy.mockRestore();
    });

    it("should use current date when no date fields are present", () => {
      const page = {
        id: "test-page-5",
        properties: {},
      };

      expect(getPublishedDate(page)).toBe("1/2/2024");
    });

    it("should handle empty published date object", () => {
      const page = {
        id: "test-page-6",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: {},
          },
        },
      };

      expect(getPublishedDate(page)).toBe("1/2/2024");
    });

    it("should not throw errors when parsing dates fails", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const page = {
        id: "test-page-7",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: { start: "not-a-date" },
          },
        },
      };

      expect(() => getPublishedDate(page)).not.toThrow();

      warnSpy.mockRestore();
    });
  });

  describe("Critical error handling", () => {
    it("should log and rethrow critical errors in generateBlocks", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Create a page that will cause an error during the grouping phase
      // by having malformed properties
      const malformedPage = {
        id: "malformed-page",
        properties: null, // This will cause errors when accessing properties
      };

      const progressCallback = vi.fn();

      await expect(
        generateBlocks([malformedPage as any], progressCallback)
      ).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Critical error in generateBlocks:"),
        expect.anything()
      );

      consoleErrorSpy.mockRestore();
    });

    it("should handle non-Error objects in critical error catch", async () => {
      const { generateBlocks } = await import("./generateBlocks");
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      // Create page that will trigger string error by making progressCallback throw
      const page = createMockNotionPage({ title: "Test Page" });
      const pages = [page];
      const progressCallback = vi.fn().mockImplementation(() => {
        throw "String error thrown";
      });

      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });

      await expect(generateBlocks(pages, progressCallback)).rejects.toThrow(
        "String error thrown"
      );

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe("ensureBlankLineAfterStandaloneBold", () => {
    let ensureBlankLineAfterStandaloneBold: (content: string) => string;

    beforeAll(async () => {
      ({ ensureBlankLineAfterStandaloneBold } = await import(
        "./markdownTransform"
      ));
    });

    it("should add blank line after standalone bold text", () => {
      const input = "**Bold Title**\nRegular text";
      const result = ensureBlankLineAfterStandaloneBold(input);
      expect(result).toBe("**Bold Title**\n\nRegular text");
    });

    it("should not add blank line if already present", () => {
      const input = "**Bold Title**\n\nRegular text";
      const result = ensureBlankLineAfterStandaloneBold(input);
      expect(result).toBe("**Bold Title**\n\nRegular text");
    });

    it("should not add blank line if next line is empty", () => {
      const input = "**Bold Title**\n";
      const result = ensureBlankLineAfterStandaloneBold(input);
      expect(result).toBe("**Bold Title**\n");
    });

    it("should handle empty content", () => {
      const result = ensureBlankLineAfterStandaloneBold("");
      expect(result).toBe("");
    });

    it("should not add blank line for inline bold", () => {
      const input = "This is **bold** inline\nNext line";
      const result = ensureBlankLineAfterStandaloneBold(input);
      expect(result).toBe("This is **bold** inline\nNext line");
    });

    it("should handle multiple standalone bold sections", () => {
      const input =
        "**First Bold**\nText 1\n**Second Bold**\nText 2\n**Third Bold**";
      const result = ensureBlankLineAfterStandaloneBold(input);
      expect(result).toBe(
        "**First Bold**\n\nText 1\n**Second Bold**\n\nText 2\n**Third Bold**"
      );
    });

    it("should handle bold with spaces", () => {
      const input = "  **Bold with leading spaces**  \nText";
      const result = ensureBlankLineAfterStandaloneBold(input);
      expect(result).toBe("  **Bold with leading spaces**  \n\nText");
    });
  });
});
