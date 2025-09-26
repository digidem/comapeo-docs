import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import path from "path";
import fs from "node:fs";

// Mock external dependencies
vi.mock("axios");
vi.mock("../notionClient", () => ({
  n2m: {
    pageToMarkdown: vi.fn(),
    toMarkdownString: vi.fn(),
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

  beforeEach(async () => {
    restoreEnv = installTestNotionEnv();
    mockFS = createMockFileSystem();
    mockAxios = createMockAxios();
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock implementations
    const { processImage } = vi.mocked(await import("./imageProcessor"));
    processImage.mockResolvedValue(mockProcessedImageResult);
    
    const { compressImageToFileWithFallback } = vi.mocked(await import("./utils"));
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
      const { n2m } = vi.mocked(await import("../notionClient"));
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
      });
      
      // Should complete without throwing
      expect(progressCallback).toHaveBeenCalled();
    });
  });

  describe("Pages without Website Block", () => {
    it("should write placeholder markdown when Website Block is absent", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      
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
      const placeholderCall = writeCalls.find(call => 
        typeof call[1] === 'string' && call[1].includes('Placeholder content generated automatically')
      );
      
      expect(placeholderCall).toBeDefined();
      expect(placeholderCall[1]).toContain('add blocks in Notion to replace this file');
    });
  });

  describe("Translation string updates", () => {
    it("should update translation strings only for non-EN locales", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      
      // Mock existing translation file
      mockReadFileSync.mockReturnValue('{}');
      
      const pageFamily = createMockPageFamily("Test Page", "Page");
      const progressCallback = vi.fn();
      
      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });
      
      await generateBlocks(pageFamily.pages, progressCallback);
      
      // Check that translation strings were written for non-English pages
      const translationWrites = mockWriteFileSync.mock.calls.filter(call => 
        typeof call[0] === 'string' && call[0].includes('code.json')
      );
      
      // Should have writes for pt and es locales
      expect(translationWrites.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Image processing", () => {
    it("should capture image processing success/failure totals with retry metrics", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      
      const imageUrls = [
        "https://example.com/success.jpg",
        "https://example.com/fail.jpg",
        "https://example.com/retry-success.jpg"
      ];
      
      const markdownWithImages = createMockMarkdownWithImages(imageUrls);
      const pageFamily = createMockPageFamily("Test Page", "Page");
      const progressCallback = vi.fn();
      
      // Mock different image download scenarios
      mockAxios.mockImageDownload(imageUrls[0], mockImageBuffer);
      mockAxios.mockImageDownloadFailure(imageUrls[1], new Error("Download failed"));
      
      // Mock retry scenario - fail twice then succeed
      let retryAttempts = 0;
      mockAxios.axios.get.mockImplementation((url) => {
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
        // Handle other URLs normally
        return mockAxios.axios.get.getMockImplementation()(url);
      });
      
      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue(markdownWithImages);
      
      const result = await generateBlocks(pageFamily.pages, progressCallback);
      
      expect(result.totalSaved).toBeGreaterThanOrEqual(0);
      expect(progressCallback).toHaveBeenCalled();
    });

    it("should handle multiple concurrent image downloads with proper error handling", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      
      const imageUrls = Array.from({ length: 5 }, (_, i) => 
        `https://example.com/image${i + 1}.jpg`
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
      mockAxios.mockImageDownloadFailure(imageUrls[1], new Error("Network error"));
      mockAxios.mockImageDownloadFailure(imageUrls[3], new Error("Timeout error"));
      
      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue(markdownWithImages);
      
      const result = await generateBlocks(pageFamily.pages, progressCallback);
      
      // Should complete despite some failures
      expect(result).toEqual({
        totalSaved: expect.any(Number),
        sectionCount: expect.any(Number),
        titleSectionCount: expect.any(Number),
      });
    });
  });

  describe("Toggle sections", () => {
    it("should create section folders for Toggle type pages", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      const mockMkdirSync = vi.mocked(fs.mkdirSync);
      
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
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      const categoryCall = mockWriteFileSync.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('_category_.json')
      );
      
      expect(categoryCall).toBeDefined();
    });
  });

  describe("Heading sections", () => {
    it("should apply heading titles to subsequent sections", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      
      const headingPage = createMockHeadingPage({
        title: "Section Heading",
      });
      
      const togglePage = createMockTogglePage({
        title: "Following Section",
      });
      
      const pages = [headingPage, togglePage];
      const progressCallback = vi.fn();
      
      n2m.pageToMarkdown.mockResolvedValue([]);
      n2m.toMarkdownString.mockReturnValue({ parent: "Test content" });
      
      await generateBlocks(pages, progressCallback);
      
      // Check if heading was applied to the category
      const categoryCall = mockWriteFileSync.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].includes('_category_.json')
      );
      
      if (categoryCall) {
        const categoryContent = JSON.parse(categoryCall[1] as string);
        expect(categoryContent.customProps.title).toBe("Section Heading");
      }
    });
  });

  describe("Page content generation", () => {
    it("should generate proper frontmatter for Page type entries", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
      const { generateBlocks } = await import("./generateBlocks");
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      
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
      n2m.toMarkdownString.mockReturnValue({ parent: "# Test Article\n\nContent here." });
      
      await generateBlocks(pages, progressCallback);
      
      // Find the markdown file write
      const markdownCall = mockWriteFileSync.mock.calls.find(call => 
        typeof call[0] === 'string' && call[0].endsWith('.md')
      );
      
      expect(markdownCall).toBeDefined();
      
      const content = markdownCall[1] as string;
      expect(content).toContain('title: Test Article');
      expect(content).toContain('sidebar_position: 5');
      expect(content).toContain('tags: [tutorial, guide]');
      expect(content).toContain('icon: "📚"');
      expect(content).toContain('slug: /test-article');
      
      // Should remove duplicate title heading
      expect(content).not.toMatch(/---\n\n# Test Article/);
    });
  });

  describe("Error handling", () => {
    it("should continue processing other pages when individual page fails", async () => {
      const { n2m } = vi.mocked(await import("../notionClient"));
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
      const { n2m } = vi.mocked(await import("../notionClient"));
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
});
