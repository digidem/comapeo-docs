/**
 * Tests for Notion API modules
 *
 * These tests verify that the refactored modules work correctly
 * and can be called programmatically without CLI dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchPages,
  fetchPage,
  generateMarkdown,
  generatePlaceholders,
  validateConfig,
  getHealthStatus,
  type NotionApiConfig,
  type ApiResult,
} from "./modules";

// Mock environment variables
const mockEnv = {
  NOTION_API_KEY: "test-api-key",
  DATABASE_ID: "test-database-id",
  DATA_SOURCE_ID: "test-data-source-id",
};

// Mock the underlying modules
vi.mock("../notion-fetch-all/fetchAll", () => ({
  fetchAllNotionData: vi.fn(),
  transformPage: vi.fn((page: any) => ({
    id: page.id,
    url: page.url,
    title: page.properties?.Title?.title?.[0]?.plain_text || "Untitled",
    status: "Ready to publish",
    elementType: "Page",
    order: 0,
    lastEdited: new Date(page.last_edited_time),
    createdTime: new Date(page.created_time),
    properties: page.properties,
    rawPage: page,
    subItems: [],
  })),
}));

vi.mock("../notion-fetch/runFetch", () => ({
  runFetchPipeline: vi.fn(),
}));

vi.mock("../fetchNotionData", () => ({
  fetchNotionData: vi.fn(),
}));

// Mock enhancedNotion to prevent actual API calls
vi.mock("../notionClient", () => ({
  enhancedNotion: {
    pagesRetrieve: vi.fn(),
    dataSourcesQuery: vi.fn(),
    blocksChildrenList: vi.fn(),
    blocksChildrenAppend: vi.fn(),
    blocksDelete: vi.fn(),
  },
  notion: {},
  n2m: {},
}));

vi.mock("../notion-placeholders/pageAnalyzer", () => ({
  PageAnalyzer: {
    analyzePages: vi.fn(() => Promise.resolve(new Map())),
    generateAnalysisSummary: vi.fn(() => ({
      totalPages: 0,
      emptyPages: 0,
      pagesNeedingFill: 0,
      pagesNeedingEnhancement: 0,
      averageContentScore: 0,
      recentlyModifiedSkipped: 0,
    })),
  },
}));

vi.mock("../notion-placeholders/contentGenerator", () => ({
  ContentGenerator: {
    generateCompletePage: vi.fn(() => []),
  },
}));

vi.mock("../notion-placeholders/notionUpdater", () => ({
  NotionUpdater: {
    updatePages: vi.fn(() => Promise.resolve(new Map())),
    generateUpdateSummary: vi.fn(() => ({
      totalPages: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      totalBlocksAdded: 0,
      errors: [],
    })),
  },
}));

vi.mock("../constants", () => ({
  NOTION_PROPERTIES: {
    TITLE: "Title",
    LANGUAGE: "Language",
    STATUS: "Status",
    ORDER: "Order",
    ELEMENT_TYPE: "Element Type",
  },
}));

describe("Notion API Modules", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set up mock environment
    process.env.NOTION_API_KEY = mockEnv.NOTION_API_KEY;
    process.env.DATABASE_ID = mockEnv.DATABASE_ID;
    process.env.DATA_SOURCE_ID = mockEnv.DATA_SOURCE_ID;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("validateConfig", () => {
    it("should validate correct configuration", () => {
      const config: NotionApiConfig = {
        apiKey: "valid-key",
        databaseId: "valid-db-id",
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject missing apiKey", () => {
      const config: NotionApiConfig = {
        apiKey: "",
        databaseId: "valid-db-id",
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "apiKey is required and must be a string"
      );
    });

    it("should reject invalid databaseId type", () => {
      const config: NotionApiConfig = {
        apiKey: "valid-key",
        databaseId: 123 as any,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "databaseId must be a string if provided"
      );
    });

    it("should reject invalid timeout type", () => {
      const config: NotionApiConfig = {
        apiKey: "valid-key",
        timeout: "1000" as any,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("timeout must be a number if provided");
    });

    it("should reject invalid maxRetries type", () => {
      const config: NotionApiConfig = {
        apiKey: "valid-key",
        maxRetries: "3" as any,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "maxRetries must be a number if provided"
      );
    });

    it("should accept configuration with optional fields", () => {
      const config: NotionApiConfig = {
        apiKey: "valid-key",
        timeout: 10000,
        maxRetries: 5,
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("fetchPages", () => {
    it("should set environment variables and call fetchAllNotionData", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockResolvedValue({
        pages: [],
        rawPages: [],
        metrics: {
          totalSaved: 0,
          sectionCount: 0,
          titleSectionCount: 0,
        },
        fetchedCount: 0,
        processedCount: 0,
        candidateIds: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
        databaseId: "test-db-id",
      };

      const result = await fetchPages(config, { maxPages: 10 });

      expect(process.env.NOTION_API_KEY).toBe("test-api-key");
      expect(process.env.DATABASE_ID).toBe("test-db-id");
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle errors and return failure result", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockRejectedValue(
        new Error("Notion API error")
      );

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await fetchPages(config);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Notion API error");
    });

    it("should pass progress callback to fetchAllNotionData", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockResolvedValue({
        pages: [],
        rawPages: [],
        metrics: undefined,
        fetchedCount: 0,
        processedCount: 0,
        candidateIds: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const onProgress = vi.fn();
      await fetchPages(config, {}, onProgress);

      // Verify fetchAllNotionData was called with progressLogger option
      expect(fetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          progressLogger: onProgress,
        })
      );
    });
  });

  describe("fetchPage", () => {
    it("should fetch a single page by ID", async () => {
      const { enhancedNotion } = await import("../notionClient");
      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue({
        id: "page-123",
        url: "https://notion.so/page-123",
        properties: {
          Title: {
            id: "title-property-id",
            type: "title",
            title: [
              {
                plain_text: "Test Page",
                href: null,
                annotations: {
                  bold: false,
                  italic: false,
                  strikethrough: false,
                  underline: false,
                  code: false,
                  color: "default",
                },
                type: "text",
                text: { content: "Test Page", link: null },
              },
            ],
          },
        },
        last_edited_time: "2024-01-01T00:00:00.000Z",
        created_time: "2024-01-01T00:00:00.000Z",
        object: "page" as const,
        archived: false,
        in_trash: false,
        is_locked: false,
        parent: { type: "workspace", workspace: true },
        cover: null,
        icon: null,
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await fetchPage(config, "page-123");

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe("page-123");
    });

    it("should return error when page not found", async () => {
      const { enhancedNotion } = await import("../notionClient");
      vi.mocked(enhancedNotion.pagesRetrieve).mockRejectedValue(
        new Error("Could not find page")
      );

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await fetchPage(config, "nonexistent-page");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PAGE_NOT_FOUND");
    });

    it("should handle fetch errors", async () => {
      const { enhancedNotion } = await import("../notionClient");
      vi.mocked(enhancedNotion.pagesRetrieve).mockRejectedValue(
        new Error("Network error")
      );

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await fetchPage(config, "page-123");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_PAGE_ERROR");
    });
  });

  describe("generateMarkdown", () => {
    it("should generate markdown files", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockResolvedValue({
        pages: [],
        rawPages: [],
        metrics: {
          totalSaved: 1024,
          sectionCount: 5,
          titleSectionCount: 3,
        },
        fetchedCount: 10,
        processedCount: 10,
        candidateIds: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await generateMarkdown(config, {
        includeRemoved: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.metrics).toBeDefined();
      expect(result.data?.metrics?.totalSaved).toBe(1024);
    });

    it("should pass generateOptions through", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockResolvedValue({
        pages: [],
        rawPages: [],
        metrics: undefined,
        fetchedCount: 0,
        processedCount: 0,
        candidateIds: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const generateOptions = {
        force: true,
        dryRun: false,
      };

      await generateMarkdown(config, { generateOptions });

      expect(fetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          generateOptions,
        })
      );
    });
  });

  describe("generatePlaceholders", () => {
    it("should generate placeholders for empty pages", async () => {
      const { fetchNotionData } = await import("../fetchNotionData");
      vi.mocked(fetchNotionData).mockResolvedValue([
        {
          id: "page-123",
          properties: {
            Title: {
              id: "title-property-id",
              type: "title",
              title: [
                {
                  plain_text: "Test Page",
                  href: null,
                  annotations: {
                    bold: false,
                    italic: false,
                    strikethrough: false,
                    underline: false,
                    code: false,
                    color: "default",
                  },
                  type: "text",
                  text: { content: "Test Page", link: null },
                },
              ],
            },
            Language: { select: { name: "English" } },
            "Element Type": { select: { name: "Page" } },
            Status: { select: { name: "Draft" } },
          },
        },
      ]);

      const { PageAnalyzer } = await import(
        "../notion-placeholders/pageAnalyzer"
      );
      vi.mocked(PageAnalyzer.analyzePages).mockResolvedValue(
        new Map([
          [
            "page-123",
            {
              isEmpty: true,
              hasOnlyEmptyBlocks: true,
              contentScore: 0,
              blockCount: 0,
              recommendedAction: "fill" as const,
              recommendedContentType: "tutorial" as const,
              recommendedContentLength: "medium" as const,
              hasRecentActivity: false,
            },
          ],
        ])
      );

      const { NotionUpdater } = await import(
        "../notion-placeholders/notionUpdater"
      );
      vi.mocked(NotionUpdater.updatePages).mockResolvedValue([
        {
          pageId: "page-123",
          success: true,
          blocksAdded: 5,
          originalBlockCount: 0,
          newBlockCount: 5,
        },
      ]);

      // Mock generateUpdateSummary to return correct counts
      vi.mocked(NotionUpdater.generateUpdateSummary).mockReturnValue({
        totalPages: 1,
        successfulUpdates: 1,
        failedUpdates: 0,
        totalBlocksAdded: 5,
        errors: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await generatePlaceholders(config, {
        contentLength: "medium",
        dryRun: false,
      });

      expect(result.success).toBe(true);
      expect(result.data?.updated).toBe(1);
      expect(result.data?.blocksAdded).toBe(5);
    });

    it("should return error on failure", async () => {
      const { fetchNotionData } = await import("../fetchNotionData");
      vi.mocked(fetchNotionData).mockRejectedValue(new Error("API Error"));

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const result = await generatePlaceholders(config);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PLACEHOLDER_ERROR");
    });

    it("should call progress callback during execution", async () => {
      const { fetchNotionData } = await import("../fetchNotionData");
      vi.mocked(fetchNotionData).mockResolvedValue([]);

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const onProgress = vi.fn();
      await generatePlaceholders(config, {}, onProgress);

      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe("getHealthStatus", () => {
    it("should return healthy status when config is valid and fetch succeeds", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockResolvedValue({
        pages: [],
        rawPages: [],
        metrics: undefined,
        fetchedCount: 0,
        processedCount: 0,
        candidateIds: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
        databaseId: "test-db-id",
      };

      const result = await getHealthStatus(config);

      expect(result.success).toBe(true);
      expect(result.data?.healthy).toBe(true);
      expect(result.data?.databaseAccessible).toBe(true);
    });

    it("should return unhealthy status when config is invalid", async () => {
      const config: NotionApiConfig = {
        apiKey: "",
      };

      const result = await getHealthStatus(config);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONFIG");
    });

    it("should return unhealthy status when fetch fails", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockRejectedValue(new Error("API Error"));

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
        databaseId: "test-db-id",
      };

      const result = await getHealthStatus(config);

      // getHealthStatus calls fetchPages, which catches errors
      // The health check should report unhealthy when fetch fails
      expect(result.success).toBe(true);
      expect(result.data?.healthy).toBe(false);
      expect(result.data?.databaseAccessible).toBe(false);
    });
  });

  describe("ApiResult type consistency", () => {
    it("should always return ApiResult with metadata", async () => {
      const { fetchAllNotionData } = await import(
        "../notion-fetch-all/fetchAll"
      );
      vi.mocked(fetchAllNotionData).mockResolvedValue({
        pages: [],
        rawPages: [],
        metrics: undefined,
        fetchedCount: 0,
        processedCount: 0,
        candidateIds: [],
      });

      const config: NotionApiConfig = {
        apiKey: "test-api-key",
      };

      const fetchResult = await fetchPages(config);
      expect(fetchResult.metadata).toBeDefined();
      expect(fetchResult.metadata?.timestamp).toBeInstanceOf(Date);
      expect(fetchResult.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);

      const healthResult = await getHealthStatus(config);
      expect(healthResult.metadata).toBeDefined();
    });
  });
});
