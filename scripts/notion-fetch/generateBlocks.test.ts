// Set up environment variables before any imports
process.env.NOTION_API_KEY = "test-key";
process.env.DATABASE_ID = "test-db-id";

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
import { NOTION_PROPERTIES } from "../constants";
import path from "path";
import fs from "node:fs";
import * as scriptModule from "./generateBlocks";

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

  /**
   * TODO: Implement the following test cases
   *
   * AI-Generated Test Case Suggestions:
   * (Run `bun run ai:suggest-tests ./generateBlocks.ts` to generate)
   *
   * 1. Test with valid input parameters
   * 2. Test error handling for invalid inputs
   * 3. Test edge cases and boundary conditions
   * 4. Test async operations and promise handling
   * 5. Test integration with external dependencies
   */

  it.todo("should test downloadAndProcessImage function with valid inputs");
  it.todo("should test downloadAndProcessImage function with invalid inputs");
  it.todo("should test setTranslationString function with valid inputs");
  it.todo("should test setTranslationString function with invalid inputs");
  it.todo("should test generateBlocks function with valid inputs");
  it.todo("should test generateBlocks function with invalid inputs");
  it.todo("should test getI18NPath function with valid inputs");
  it.todo("should test getI18NPath function with invalid inputs");
  it.todo("should test groupPagesByLang function with valid inputs");
  it.todo("should test groupPagesByLang function with invalid inputs");
  it.todo("should handle async operations correctly");
  it.todo("should handle promise rejections");
  it.todo("should handle file read/write operations");
  it.todo("should handle file system errors");
  it.todo("should handle network requests");
  it.todo("should handle network failures");

  // Tests for getPublishedDate function
  describe("getPublishedDate", () => {
    it("should use published date when available and valid", () => {
      const page = {
        id: "test-page-1",
        last_edited_time: '2023-11-30T10:00:00.000Z', // Earlier than published date
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: { 
            date: { start: '2023-12-01' } 
          }
        }
      };
      
      const result = scriptModule.getPublishedDate(page);
      expect(result).toBe('12/1/2023');
    });

    it("should fall back to last_edited_time when published date is missing", () => {
      const page = {
        id: "test-page-2",
        last_edited_time: '2023-11-30T10:00:00.000Z',
        properties: {}
      };
      
      const result = scriptModule.getPublishedDate(page);
      expect(result).toBe('11/30/2023');
    });

    it("should fall back to last_edited_time when published date is invalid", () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const page = {
        id: "test-page-3",
        last_edited_time: '2023-11-30T10:00:00.000Z',
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: { 
            date: { start: 'invalid-date' } 
          }
        }
      };
      
      const result = scriptModule.getPublishedDate(page);
      expect(result).toBe('11/30/2023');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid published date format for page test-page-3')
      );
      
      consoleSpy.mockRestore();
    });

    it("should use current date when both published date and last_edited_time are invalid", () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const currentDate = new Date().toLocaleDateString("en-US");
      
      const page = {
        id: "test-page-4",
        last_edited_time: 'invalid-timestamp',
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: { 
            date: { start: 'invalid-date' } 
          }
        }
      };
      
      const result = scriptModule.getPublishedDate(page);
      expect(result).toBe(currentDate);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid published date format for page test-page-4')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid last_edited_time format for page test-page-4')
      );
      
      consoleSpy.mockRestore();
    });

    it("should use current date when no date fields are present", () => {
      const currentDate = new Date().toLocaleDateString("en-US");
      
      const page = {
        id: "test-page-5",
        properties: {}
      };
      
      const result = scriptModule.getPublishedDate(page);
      expect(result).toBe(currentDate);
    });

    it("should handle empty published date object gracefully", () => {
      const currentDate = new Date().toLocaleDateString("en-US");
      
      const page = {
        id: "test-page-6",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: { 
            date: {} 
          }
        }
      };
      
      const result = scriptModule.getPublishedDate(page);
      expect(result).toBe(currentDate);
    });

    it("should not throw errors when parsing dates fails", () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const page = {
        id: "test-page-7",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: { 
            date: { start: 'definitely-not-a-date' } 
          }
        }
      };
      
      expect(() => scriptModule.getPublishedDate(page)).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });
});
