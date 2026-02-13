/**
 * Tests for Notion Test Pages Setup Script
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { installTestNotionEnv, createMockNotionPage } from "../test-utils";
import { NOTION_PROPERTIES, MAIN_LANGUAGE } from "../constants";
import { setupTestPages, restoreTestPages } from "./index";
import type { TestPageResult } from "./index";

// Mock the @notionhq/client
vi.mock("@notionhq/client", () => {
  const mockQuery = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  const mockAppend = vi.fn();

  return {
    Client: class MockClient {
      dataSources = { query: mockQuery };
      pages = { create: mockCreate, update: mockUpdate };
      blocks = { children: { append: mockAppend } };
    },
  };
});

// Mock ora spinner
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

// Import the mocked Client after mocking
import { Client } from "@notionhq/client";

describe("Notion Test Pages Setup", () => {
  let cleanup: () => void;
  let mockClient: {
    dataSources: { query: Mock };
    pages: { create: Mock; update: Mock };
    blocks: { children: { append: Mock } };
  };

  beforeEach(() => {
    cleanup = installTestNotionEnv();
    vi.clearAllMocks();

    // Get reference to mocked client methods
    mockClient = new Client({ auth: "test" }) as any;
  });

  afterEach(() => {
    cleanup();
  });

  describe("setupTestPages", () => {
    describe("dry run mode", () => {
      it("should query for existing test pages", async () => {
        mockClient.dataSources.query.mockResolvedValueOnce({
          results: [],
          has_more: false,
        });

        const result = await setupTestPages({ dryRun: true });

        expect(mockClient.dataSources.query).toHaveBeenCalledWith(
          expect.objectContaining({
            data_source_id: expect.any(String),
            filter: expect.objectContaining({
              and: expect.arrayContaining([
                expect.objectContaining({
                  property: NOTION_PROPERTIES.TITLE,
                }),
                expect.objectContaining({
                  property: NOTION_PROPERTIES.LANGUAGE,
                }),
              ]),
            }),
          })
        );

        // In dry run with no existing pages, should not create any
        expect(result.pages).toHaveLength(0);
        expect(result.summary.totalPages).toBe(0);
      });

      it("should not create pages in dry run mode", async () => {
        mockClient.dataSources.query.mockResolvedValue({
          results: [],
          has_more: false,
        });

        await setupTestPages({ dryRun: true });

        expect(mockClient.pages.create).not.toHaveBeenCalled();
        expect(mockClient.blocks.children.append).not.toHaveBeenCalled();
      });

      it("should identify existing test pages in dry run", async () => {
        const existingPage = createMockNotionPage({
          id: "existing-test-page",
          title: "[TEST] Installation Guide",
          language: MAIN_LANGUAGE,
          status: "Not started",
        });

        mockClient.dataSources.query
          // First call for finding existing test pages
          .mockResolvedValueOnce({
            results: [existingPage],
            has_more: false,
          })
          // Second call for finding Spanish siblings
          .mockResolvedValueOnce({
            results: [],
            has_more: false,
          })
          // Third call for finding Portuguese siblings
          .mockResolvedValueOnce({
            results: [],
            has_more: false,
          });

        const result = await setupTestPages({ dryRun: true });

        // In dry run mode, existing pages are still reported
        expect(result.pages).toHaveLength(1);
        expect(result.pages[0].isNew).toBe(false);
        expect(result.summary.existingPages).toBe(1);
      });
    });

    describe("create mode", () => {
      it("should create test pages with realistic content blocks", async () => {
        mockClient.dataSources.query.mockResolvedValue({
          results: [],
          has_more: false,
        });

        mockClient.pages.create.mockResolvedValue({
          id: "new-test-page",
          properties: {},
        });

        const result = await setupTestPages({ dryRun: false });

        // Should create 2 pages (installation and features)
        expect(mockClient.pages.create).toHaveBeenCalledTimes(2);
        expect(mockClient.blocks.children.append).toHaveBeenCalledTimes(2);
      });

      it("should set proper page properties on creation", async () => {
        mockClient.dataSources.query.mockResolvedValue({
          results: [],
          has_more: false,
        });

        mockClient.pages.create.mockResolvedValue({
          id: "new-test-page",
          properties: {},
        });

        await setupTestPages({ dryRun: false });

        // Check that create was called with proper properties
        expect(mockClient.pages.create).toHaveBeenCalledWith(
          expect.objectContaining({
            parent: expect.objectContaining({
              type: "data_source_id",
            }),
            properties: expect.objectContaining({
              [NOTION_PROPERTIES.TITLE]: expect.any(Object),
              [NOTION_PROPERTIES.LANGUAGE]: expect.any(Object),
            }),
          })
        );
      });

      it("should create blocks with correct types", async () => {
        mockClient.dataSources.query.mockResolvedValue({
          results: [],
          has_more: false,
        });

        mockClient.pages.create.mockResolvedValue({
          id: "new-test-page",
          properties: {},
        });

        await setupTestPages({ dryRun: false });

        // Verify blocks were appended with correct structure
        const appendCalls = mockClient.blocks.children.append.mock.calls;
        expect(appendCalls.length).toBeGreaterThan(0);

        for (const call of appendCalls) {
          expect(call[0]).toHaveProperty("block_id");
          expect(call[0]).toHaveProperty("children");
          expect(Array.isArray(call[0].children)).toBe(true);

          // Check for various block types
          const blockTypes = call[0].children.map((b: any) => b.type);
          expect(blockTypes).toContain("heading_1");
          expect(blockTypes).toContain("paragraph");
        }
      });
    });

    describe("setReadyForTranslation mode", () => {
      it("should update page status to Ready for translation when flag is set", async () => {
        const existingPage = createMockNotionPage({
          id: "test-page-1",
          title: "[TEST] Installation Guide",
          language: MAIN_LANGUAGE,
          status: "Not started",
        });

        mockClient.dataSources.query
          .mockResolvedValueOnce({
            results: [existingPage],
            has_more: false,
          })
          .mockResolvedValue({
            results: [],
            has_more: false,
          });

        await setupTestPages({
          dryRun: false,
          setReadyForTranslation: true,
        });

        expect(mockClient.pages.update).toHaveBeenCalledWith(
          expect.objectContaining({
            page_id: "test-page-1",
            properties: expect.objectContaining({
              [NOTION_PROPERTIES.STATUS]: expect.objectContaining({
                select: { name: NOTION_PROPERTIES.READY_FOR_TRANSLATION },
              }),
            }),
          })
        );
      });

      it("should not update status when flag is not set", async () => {
        const existingPage = createMockNotionPage({
          id: "test-page-1",
          title: "[TEST] Installation Guide",
          language: MAIN_LANGUAGE,
          status: "Not started",
        });

        mockClient.dataSources.query.mockResolvedValue({
          results: [existingPage],
          has_more: false,
        });

        await setupTestPages({
          dryRun: false,
          setReadyForTranslation: false,
        });

        expect(mockClient.pages.update).not.toHaveBeenCalled();
      });
    });

    describe("translation siblings", () => {
      it("should find Spanish and Portuguese translation siblings", async () => {
        const englishPage = createMockNotionPage({
          id: "en-page",
          title: "[TEST] Installation Guide",
          language: MAIN_LANGUAGE,
          status: "Not started",
        });

        const spanishPage = createMockNotionPage({
          id: "es-page",
          title: "[TEST] Guía de instalación",
          language: "Spanish",
        });

        const portuguesePage = createMockNotionPage({
          id: "pt-page",
          title: "[TEST] Guia de instalação",
          language: "Portuguese",
        });

        // Since the script processes 2 pages (installation and features),
        // we need to provide mocks for both pages' sibling lookups
        mockClient.dataSources.query
          // First call for existing test pages - only return installation page
          .mockResolvedValueOnce({
            results: [englishPage],
            has_more: false,
          })
          // Second call for Spanish siblings (installation)
          .mockResolvedValueOnce({
            results: [spanishPage],
            has_more: false,
          })
          // Third call for Portuguese siblings (installation)
          .mockResolvedValueOnce({
            results: [portuguesePage],
            has_more: false,
          })
          // Fourth call for Spanish siblings (features - none exist)
          .mockResolvedValueOnce({
            results: [],
            has_more: false,
          })
          // Fifth call for Portuguese siblings (features - none exist)
          .mockResolvedValueOnce({
            results: [],
            has_more: false,
          });

        // Create page needs to be mocked for features page
        mockClient.pages.create.mockResolvedValue({
          id: "features-page",
          properties: {},
        });

        const result = await setupTestPages({ dryRun: false });

        // Only the installation page (first one) has siblings
        const installationPage = result.pages.find(
          (p) => p.page.id === "en-page"
        );
        expect(installationPage).toBeDefined();
        expect(installationPage?.siblings.spanish).toBeDefined();
        expect(installationPage?.siblings.spanish?.id).toBe("es-page");
        expect(installationPage?.siblings.portuguese).toBeDefined();
        expect(installationPage?.siblings.portuguese?.id).toBe("pt-page");
        expect(result.summary.withSiblings).toBe(1);
      });

      it("should handle missing translation siblings gracefully", async () => {
        const englishPage = createMockNotionPage({
          id: "en-page",
          title: "[TEST] Installation Guide",
          language: MAIN_LANGUAGE,
          status: "Not started",
        });

        mockClient.dataSources.query
          .mockResolvedValueOnce({
            results: [englishPage],
            has_more: false,
          })
          .mockResolvedValue({
            results: [],
            has_more: false,
          });

        const result = await setupTestPages({ dryRun: false });

        expect(result.pages[0].siblings.spanish).toBeUndefined();
        expect(result.pages[0].siblings.portuguese).toBeUndefined();
        expect(result.summary.withSiblings).toBe(0);
      });
    });

    describe("error handling", () => {
      it("should throw error when NOTION_API_KEY is missing", async () => {
        delete process.env.NOTION_API_KEY;

        await expect(setupTestPages({})).rejects.toThrow(
          "NOTION_API_KEY is required"
        );
      });

      it("should throw error when DATABASE_ID is missing", async () => {
        delete process.env.DATABASE_ID;
        delete process.env.NOTION_DATABASE_ID;
        delete process.env.DATA_SOURCE_ID;

        await expect(setupTestPages({})).rejects.toThrow(
          "DATA_SOURCE_ID or DATABASE_ID is required"
        );
      });

      it("should propagate Notion API errors", async () => {
        mockClient.dataSources.query.mockRejectedValue(
          new Error("Notion API error")
        );

        await expect(setupTestPages({ dryRun: true })).rejects.toThrow(
          "Notion API error"
        );
      });
    });

    describe("summary statistics", () => {
      it("should provide accurate summary for new pages", async () => {
        mockClient.dataSources.query.mockResolvedValue({
          results: [],
          has_more: false,
        });

        mockClient.pages.create.mockResolvedValue({
          id: "new-page",
          properties: {},
        });

        const result = await setupTestPages({ dryRun: false });

        expect(result.summary.totalPages).toBe(2); // installation and features
        expect(result.summary.newPages).toBe(2);
        expect(result.summary.existingPages).toBe(0);
      });

      it("should provide accurate summary for mixed pages", async () => {
        const existingPage = createMockNotionPage({
          id: "existing-page",
          title: "[TEST] Installation Guide",
          language: MAIN_LANGUAGE,
          status: "Not started",
        });

        mockClient.dataSources.query
          .mockResolvedValueOnce({
            results: [existingPage],
            has_more: false,
          })
          .mockResolvedValue({
            results: [],
            has_more: false,
          });

        mockClient.pages.create.mockResolvedValue({
          id: "new-page",
          properties: {},
        });

        const result = await setupTestPages({ dryRun: false });

        expect(result.summary.totalPages).toBe(2);
        expect(result.summary.newPages).toBe(1); // features created
        expect(result.summary.existingPages).toBe(1); // installation found
      });
    });
  });

  describe("restoreTestPages", () => {
    it("should restore pages to their original status", async () => {
      const testResults: TestPageResult[] = [
        {
          page: createMockNotionPage({
            id: "page-1",
            title: "Test Page 1",
            status: "Ready for translation",
          }),
          siblings: {},
          isNew: false,
          originalStatus: "Not started",
        },
      ];

      await restoreTestPages(testResults);

      expect(mockClient.pages.update).toHaveBeenCalledWith({
        page_id: "page-1",
        properties: {
          [NOTION_PROPERTIES.STATUS]: {
            select: { name: "Not started" },
          },
        },
      });
    });

    it("should skip pages with no original status", async () => {
      const testResults: TestPageResult[] = [
        {
          page: createMockNotionPage({
            id: "page-1",
            title: "Test Page 1",
          }),
          siblings: {},
          isNew: true,
          originalStatus: null,
        },
      ];

      await restoreTestPages(testResults);

      expect(mockClient.pages.update).not.toHaveBeenCalled();
    });

    it("should throw error when NOTION_API_KEY is missing", async () => {
      delete process.env.NOTION_API_KEY;

      await expect(restoreTestPages([])).rejects.toThrow(
        "NOTION_API_KEY is required"
      );
    });

    it("should handle multiple pages", async () => {
      const testResults: TestPageResult[] = [
        {
          page: createMockNotionPage({
            id: "page-1",
            title: "Test Page 1",
          }),
          siblings: {},
          isNew: false,
          originalStatus: "Not started",
        },
        {
          page: createMockNotionPage({
            id: "page-2",
            title: "Test Page 2",
          }),
          siblings: {},
          isNew: false,
          originalStatus: "Ready to publish",
        },
      ];

      await restoreTestPages(testResults);

      expect(mockClient.pages.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("content blocks validation", () => {
    it("should include all required block types in test content", async () => {
      mockClient.dataSources.query.mockResolvedValue({
        results: [],
        has_more: false,
      });

      mockClient.pages.create.mockResolvedValue({
        id: "new-page",
        properties: {},
      });

      await setupTestPages({ dryRun: false });

      // Get all block types from append calls
      const allBlocks = mockClient.blocks.children.append.mock.calls.flatMap(
        (call) => call[0].children
      );
      const blockTypes = allBlocks.map((b: any) => b.type);

      // Verify required block types are present
      expect(blockTypes).toContain("heading_1");
      expect(blockTypes).toContain("heading_2");
      expect(blockTypes).toContain("paragraph");
      expect(blockTypes).toContain("bulleted_list_item");
      expect(blockTypes).toContain("numbered_list_item");
      expect(blockTypes).toContain("callout");
      expect(blockTypes).toContain("divider");
    });

    it("should create callout blocks with emoji icons", async () => {
      mockClient.dataSources.query.mockResolvedValue({
        results: [],
        has_more: false,
      });

      mockClient.pages.create.mockResolvedValue({
        id: "new-page",
        properties: {},
      });

      await setupTestPages({ dryRun: false });

      // Find callout blocks
      const allBlocks = mockClient.blocks.children.append.mock.calls.flatMap(
        (call) => call[0].children
      );
      const calloutBlocks = allBlocks.filter((b: any) => b.type === "callout");

      expect(calloutBlocks.length).toBeGreaterThan(0);

      for (const callout of calloutBlocks) {
        expect(callout.callout).toHaveProperty("icon");
        expect(callout.callout.icon).toHaveProperty("type", "emoji");
        expect(callout.callout.icon).toHaveProperty("emoji");
      }
    });

    it("should create rich text content in blocks", async () => {
      mockClient.dataSources.query.mockResolvedValue({
        results: [],
        has_more: false,
      });

      mockClient.pages.create.mockResolvedValue({
        id: "new-page",
        properties: {},
      });

      await setupTestPages({ dryRun: false });

      // Get all blocks
      const allBlocks = mockClient.blocks.children.append.mock.calls.flatMap(
        (call) => call[0].children
      );

      // Check that blocks have rich_text content where applicable
      const paragraphBlocks = allBlocks.filter(
        (b: any) => b.type === "paragraph"
      );

      for (const block of paragraphBlocks) {
        expect(block.paragraph).toHaveProperty("rich_text");
        expect(Array.isArray(block.paragraph.rich_text)).toBe(true);
        expect(block.paragraph.rich_text.length).toBeGreaterThan(0);
        expect(block.paragraph.rich_text[0]).toHaveProperty("text");
      }
    });
  });
});
