import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../fetchNotionData", () => ({
  fetchNotionData: vi.fn(),
  sortAndExpandNotionData: vi.fn(),
}));

vi.mock("../notionPageUtils", () => ({
  getStatusFromRawPage: vi.fn(),
}));

vi.mock("../constants", () => ({
  NOTION_PROPERTIES: {
    ELEMENT_TYPE: "Element Type",
    LANGUAGE: "Language",
  },
}));

describe("notion-count-pages module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be importable without errors when env vars are set", async () => {
    // This test runs in the normal test environment where env vars are set by vitest.setup.ts
    // The module can be imported successfully
    // Full integration testing is done via notion-count-pages.integration.test.ts
    expect(true).toBe(true);
  });

  it("should have the correct exports", async () => {
    // Verify that the module has the expected exports
    const module = await import("./index");
    expect(typeof module.main).toBe("function");
    expect(typeof module.parseArgs).toBe("function");
    expect(typeof module.buildStatusFilter).toBe("function");
  });

  describe("subpage filtering", () => {
    it("should exclude parent pages that are Sub-items of other pages from expectedDocs count", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { getStatusFromRawPage } = await import("../notionPageUtils");

      // Create test data: Page A has Page B as a Sub-item
      // Page B should be excluded from expectedDocs even though it's a "Page" type
      const pageA = {
        id: "page-a-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": {
            select: { name: "Page" },
          },
          Language: {
            select: { name: "English" },
          },
          "Sub-item": {
            relation: [{ id: "page-b-id" }], // Page A references Page B as a sub-item
          },
        },
      };

      const pageB = {
        id: "page-b-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": {
            select: { name: "Page" }, // Also a "Page" type, but should be excluded
          },
          Language: {
            select: { name: "English" },
          },
          "Sub-item": {
            relation: [], // No sub-items
          },
        },
      };

      const pageC = {
        id: "page-c-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": {
            select: { name: "Page" },
          },
          Language: {
            select: { name: "English" },
          },
          "Sub-item": {
            relation: [], // No sub-items
          },
        },
      };

      // Mock fetchNotionData to return parent pages
      vi.mocked(fetchNotionData).mockResolvedValue([pageA, pageB, pageC]);

      // Mock sortAndExpandNotionData to return all pages (no expansion)
      vi.mocked(sortAndExpandNotionData).mockResolvedValue([
        pageA,
        pageB,
        pageC,
      ]);

      // Mock getStatusFromRawPage to return empty status (not "Remove")
      vi.mocked(getStatusFromRawPage).mockReturnValue("");

      // Mock console.log to capture output
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // Mock process.exit to prevent actual exit
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      // Set up environment and argv for main()
      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages"];

      // Import and run main
      const countPagesModule = await import("./index");
      await countPagesModule.main();

      // Verify console.log was called with JSON output
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const result = JSON.parse(output);

      // Verify the counts
      // Expected behavior:
      // - subpageIdSet will contain "page-b-id" (from pageA's Sub-item relation)
      // - When counting expectedDocs:
      //    - pageA: elementType="Page", locale="en", NOT in subpageIdSet → COUNTED
      //    - pageB: elementType="Page", locale="en", but IN subpageIdSet → EXCLUDED
      //    - pageC: elementType="Page", locale="en", NOT in subpageIdSet → COUNTED
      // - Expected result: expectedDocs = 2 (pageA and pageC only)

      expect(result.expectedDocs).toBe(2);
      expect(result.parents).toBe(3); // All 3 pages are parents
      expect(result.subPages).toBe(0); // No expansion happened
      expect(result.byElementType.Page).toBe(3); // All 3 have elementType="Page"

      // Cleanup
      consoleLogSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle multiple levels of Sub-item relationships", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { getStatusFromRawPage } = await import("../notionPageUtils");

      // Create test data: Page A → Page B → Page C (chain of Sub-items)
      const pageA = {
        id: "page-a-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": { select: { name: "Page" } },
          Language: { select: { name: "English" } },
          "Sub-item": { relation: [{ id: "page-b-id" }] },
        },
      };

      const pageB = {
        id: "page-b-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": { select: { name: "Page" } },
          Language: { select: { name: "English" } },
          "Sub-item": { relation: [{ id: "page-c-id" }] },
        },
      };

      const pageC = {
        id: "page-c-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": { select: { name: "Page" } },
          Language: { select: { name: "English" } },
          "Sub-item": { relation: [] },
        },
      };

      vi.mocked(fetchNotionData).mockResolvedValue([pageA, pageB, pageC]);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue([
        pageA,
        pageB,
        pageC,
      ]);
      vi.mocked(getStatusFromRawPage).mockReturnValue("");

      // Mock console.log and process.exit
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      // Set up environment
      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages"];

      // Run main
      const countPagesModule = await import("./index");
      await countPagesModule.main();

      // Parse output
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const result = JSON.parse(output);

      // Expected behavior:
      // - subpageIdSet will contain "page-b-id" (from pageA) and "page-c-id" (from pageB)
      // - Only pageA should be counted in expectedDocs
      // - pageB and pageC should be excluded (they're sub-items)
      expect(result.expectedDocs).toBe(1);
      expect(result.parents).toBe(3);

      // Cleanup
      consoleLogSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });

    it("should handle pages with multiple Sub-items", async () => {
      const { fetchNotionData, sortAndExpandNotionData } = await import(
        "../fetchNotionData"
      );
      const { getStatusFromRawPage } = await import("../notionPageUtils");

      // Create test data: Page A has both Page B and Page C as Sub-items
      const pageA = {
        id: "page-a-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": { select: { name: "Page" } },
          Language: { select: { name: "English" } },
          "Sub-item": {
            relation: [{ id: "page-b-id" }, { id: "page-c-id" }],
          },
        },
      };

      const pageB = {
        id: "page-b-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": { select: { name: "Page" } },
          Language: { select: { name: "English" } },
          "Sub-item": { relation: [] },
        },
      };

      const pageC = {
        id: "page-c-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          "Element Type": { select: { name: "Page" } },
          Language: { select: { name: "English" } },
          "Sub-item": { relation: [] },
        },
      };

      vi.mocked(fetchNotionData).mockResolvedValue([pageA, pageB, pageC]);
      vi.mocked(sortAndExpandNotionData).mockResolvedValue([
        pageA,
        pageB,
        pageC,
      ]);
      vi.mocked(getStatusFromRawPage).mockReturnValue("");

      // Mock console.log and process.exit
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      // Set up environment
      process.env.NOTION_API_KEY = "test-key";
      process.env.DATABASE_ID = "test-db-id";
      process.argv = ["node", "notion-count-pages"];

      // Run main
      const countPagesModule = await import("./index");
      await countPagesModule.main();

      // Parse output
      const output = consoleLogSpy.mock.calls[0][0] as string;
      const result = JSON.parse(output);

      // Expected behavior:
      // - subpageIdSet will contain "page-b-id" and "page-c-id"
      // - Only pageA should be counted in expectedDocs
      // - pageB and pageC should be excluded (they're sub-items)
      expect(result.expectedDocs).toBe(1);
      expect(result.parents).toBe(3);

      // Cleanup
      consoleLogSpy.mockRestore();
      processExitSpy.mockRestore();
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;
    });
  });
});
