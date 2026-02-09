/**
 * Integration tests for notion-count-pages script
 *
 * This test suite validates the count functionality with 5 pages to ensure
 * it correctly counts pages, handles status filtering, and respects flags.
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
import {
  installTestNotionEnv,
  createMockNotionPage,
  createMockPageFamily,
} from "./test-utils";

// Mock the fetchAllNotionData function
const mockFetchAllNotionData = vi.fn();

vi.mock("./notion-fetch-all/fetchAll", () => ({
  fetchAllNotionData: (...args: unknown[]) => mockFetchAllNotionData(...args),
  get type() {
    return this;
  },
  get set() {
    return this;
  },
}));

describe("notion-count-pages integration tests", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("Quick count validation (5 pages)", () => {
    it("should count exactly 5 pages successfully", async () => {
      // Create exactly 5 mock pages for quick validation
      const mockPages = [
        createMockNotionPage({
          title: "Getting Started",
          status: "Ready to publish",
          elementType: "Section",
          order: 1,
        }),
        createMockNotionPage({
          title: "Installation Guide",
          status: "Ready to publish",
          order: 2,
        }),
        createMockNotionPage({
          title: "Configuration",
          status: "Ready to publish",
          order: 3,
        }),
        createMockNotionPage({
          title: "User Interface",
          status: "Draft",
          order: 4,
        }),
        createMockNotionPage({
          title: "Advanced Features",
          status: "Draft",
          order: 5,
        }),
      ];

      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages,
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 5,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify fetchAllNotionData was called with correct options
      expect(mockFetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          includeRemoved: false,
          exportFiles: false,
        })
      );

      // Verify console output shows count of 5
      expect(consoleLogSpy).toHaveBeenCalledWith("Count: 5");

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should count pages with status filter correctly", async () => {
      // Create 5 pages with mixed statuses
      const mockPages = [
        createMockNotionPage({
          title: "Ready Page 1",
          status: "Ready to publish",
        }),
        createMockNotionPage({
          title: "Ready Page 2",
          status: "Ready to publish",
        }),
        createMockNotionPage({
          title: "Draft Page",
          status: "Draft",
        }),
        createMockNotionPage({
          title: "In Progress Page",
          status: "In progress",
        }),
        createMockNotionPage({
          title: "Not Started Page",
          status: "Not started",
        }),
      ];

      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages.slice(0, 2), // Only return 2 "Ready to publish" pages
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 2,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = [
        "node",
        "notion-count-pages",
        "--status-filter",
        "Ready to publish",
      ];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify status filter was passed correctly
      expect(mockFetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          statusFilter: "Ready to publish",
        })
      );

      // Verify console output shows filtered count
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Count: 2")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Status filter: Ready to publish")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fetched: 5")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("After filtering: 2")
      );

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should count pages excluding removed status", async () => {
      // Create 5 pages including one with "Remove" status
      const mockPages = [
        createMockNotionPage({
          title: "Active Page 1",
          status: "Ready to publish",
        }),
        createMockNotionPage({
          title: "Active Page 2",
          status: "Draft",
        }),
        createMockNotionPage({
          title: "Active Page 3",
          status: "In progress",
        }),
        createMockNotionPage({
          title: "Removed Page",
          status: "Remove",
        }),
        createMockNotionPage({
          title: "Active Page 4",
          status: "Ready to publish",
        }),
      ];

      // When includeRemoved is false, should exclude the "Remove" page
      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages.filter(
          (p) => p.properties.Status.select.name !== "Remove"
        ),
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 4,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify includeRemoved is false by default
      expect(mockFetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          includeRemoved: false,
        })
      );

      // Verify count excludes removed pages (output includes fetched/processed diff)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Count: 4")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fetched: 5")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("After filtering: 4")
      );

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should count pages including removed status when flag is set", async () => {
      // Create 5 pages including one with "Remove" status
      const mockPages = [
        createMockNotionPage({
          title: "Active Page 1",
          status: "Ready to publish",
        }),
        createMockNotionPage({
          title: "Active Page 2",
          status: "Draft",
        }),
        createMockNotionPage({
          title: "Active Page 3",
          status: "In progress",
        }),
        createMockNotionPage({
          title: "Removed Page",
          status: "Remove",
        }),
        createMockNotionPage({
          title: "Active Page 4",
          status: "Ready to publish",
        }),
      ];

      // When includeRemoved is true, should include all pages
      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages,
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 5,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages", "--include-removed"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify includeRemoved flag is passed
      expect(mockFetchAllNotionData).toHaveBeenCalledWith(
        expect.objectContaining({
          includeRemoved: true,
        })
      );

      // Verify count includes removed pages
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Count: 5")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Include removed: true")
      );

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should output JSON format when requested", async () => {
      // Create 5 pages
      const mockPages = Array.from({ length: 5 }, (_, i) =>
        createMockNotionPage({
          title: `Page ${i + 1}`,
          status: "Ready to publish",
        })
      );

      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages,
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 5,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages", "--json"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify JSON output
      const output = consoleLogSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);

      expect(parsed).toEqual({
        count: 5,
        fetchedCount: 5,
        processedCount: 5,
        includeRemoved: false,
      });

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });

  describe("Multi-language page counting", () => {
    it("should count pages across multiple languages", async () => {
      // Create page family with multiple languages (4 pages)
      const family = createMockPageFamily("Getting Started", "Page");
      // Add one more page to make it 5 total
      const extraPage = createMockNotionPage({
        title: "Additional Page",
        status: "Draft",
      });

      const mockPages = [...family.pages, extraPage];

      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages,
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 5,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify all 5 pages are counted
      expect(consoleLogSpy).toHaveBeenCalledWith("Count: 5");

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });

  describe("Hierarchical page counting", () => {
    it("should count hierarchical pages correctly", async () => {
      // Create hierarchical structure: 1 section + 4 child pages = 5 total
      const sectionId = "section-123";
      const mockPages = [
        createMockNotionPage({
          id: sectionId,
          title: "User Guide",
          status: "Ready to publish",
          elementType: "Section",
          order: 1,
        }),
        createMockNotionPage({
          title: "Installation",
          parentItem: sectionId,
          status: "Ready to publish",
          order: 1,
        }),
        createMockNotionPage({
          title: "Configuration",
          parentItem: sectionId,
          status: "Ready to publish",
          order: 2,
        }),
        createMockNotionPage({
          title: "Usage",
          parentItem: sectionId,
          status: "Draft",
          order: 3,
        }),
        createMockNotionPage({
          title: "Troubleshooting",
          parentItem: sectionId,
          status: "Draft",
          order: 4,
        }),
      ];

      mockFetchAllNotionData.mockResolvedValue({
        pages: mockPages,
        rawPages: mockPages,
        fetchedCount: 5,
        processedCount: 5,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify hierarchical pages are counted correctly
      expect(consoleLogSpy).toHaveBeenCalledWith("Count: 5");

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle empty database gracefully", async () => {
      mockFetchAllNotionData.mockResolvedValue({
        pages: [],
        rawPages: [],
        fetchedCount: 0,
        processedCount: 0,
      });

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const { main } = await import("./notion-count-pages");
      await main();

      // Verify count of 0 is handled
      expect(consoleLogSpy).toHaveBeenCalledWith("Count: 0");

      consoleLogSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle API errors gracefully", async () => {
      mockFetchAllNotionData.mockRejectedValue(
        new Error("Notion API request failed")
      );

      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => {
          throw new Error("exit called");
        });

      const { main } = await import("./notion-count-pages");

      await expect(main()).rejects.toThrow("exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error:",
        "Notion API request failed"
      );

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle missing NOTION_API_KEY gracefully", async () => {
      process.env.NOTION_API_KEY = "";
      process.env.DATABASE_ID = "test-database-id";
      process.argv = ["node", "notion-count-pages"];

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => {
          throw new Error("exit called");
        });

      const { main } = await import("./notion-count-pages");

      await expect(main()).rejects.toThrow("exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("NOTION_API_KEY")
      );

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle missing DATABASE_ID gracefully", async () => {
      process.env.NOTION_API_KEY = "test-api-key";
      process.env.DATABASE_ID = "";
      process.argv = ["node", "notion-count-pages"];

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => {
          throw new Error("exit called");
        });

      const { main } = await import("./notion-count-pages");

      await expect(main()).rejects.toThrow("exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("DATABASE_ID")
      );

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });
});
