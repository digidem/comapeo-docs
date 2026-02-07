import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installTestNotionEnv } from "./test-utils";

// Mock perfTelemetry to prevent telemetry side effects
vi.mock("./perfTelemetry", () => ({
  perfTelemetry: {
    recordDataset: vi.fn(),
  },
}));

// Mock notionClient to prevent real API calls
vi.mock("./notionClient", () => ({
  enhancedNotion: {
    blocksChildrenList: vi.fn().mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    }),
    dataSourcesQuery: vi.fn().mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    }),
    pagesRetrieve: vi.fn().mockResolvedValue({
      id: "test-page-id",
      properties: {},
    }),
  },
  DATABASE_ID: "test-db-id",
  DATA_SOURCE_ID: "test-data-source-id",
  n2m: {
    pageToMarkdown: vi.fn().mockResolvedValue([]),
    toMarkdownString: vi.fn().mockReturnValue({ parent: "" }),
  },
}));

describe("fetchNotionData", () => {
  let restoreEnv: () => void;
  let fetchNotionData: (typeof import("./fetchNotionData"))["fetchNotionData"];
  let sortAndExpandNotionData: (typeof import("./fetchNotionData"))["sortAndExpandNotionData"];
  let fetchNotionPage: (typeof import("./fetchNotionData"))["fetchNotionPage"];
  let fetchNotionBlocks: (typeof import("./fetchNotionData"))["fetchNotionBlocks"];

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();
    restoreEnv = installTestNotionEnv();

    const module = await import("./fetchNotionData");
    fetchNotionData = module.fetchNotionData;
    sortAndExpandNotionData = module.sortAndExpandNotionData;
    fetchNotionPage = module.fetchNotionPage;
    fetchNotionBlocks = module.fetchNotionBlocks;
  });

  afterEach(() => {
    // Clean up after each test
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("should run without errors", () => {
    // This basic test ensures the module can be imported
    expect(fetchNotionData).toBeDefined();
    expect(sortAndExpandNotionData).toBeDefined();
    expect(fetchNotionPage).toBeDefined();
    expect(fetchNotionBlocks).toBeDefined();
  });

  describe("function signatures", () => {
    it("should have correct function types", () => {
      expect(typeof fetchNotionData).toBe("function");
      expect(typeof sortAndExpandNotionData).toBe("function");
      expect(typeof fetchNotionPage).toBe("function");
      expect(typeof fetchNotionBlocks).toBe("function");
    });

    it("should have correct parameter counts", () => {
      expect(fetchNotionData.length).toBe(1); // filter parameter
      expect(sortAndExpandNotionData.length).toBe(1); // data parameter
      expect(fetchNotionPage.length).toBe(0); // no parameters
      expect(fetchNotionBlocks.length).toBe(1); // blockId parameter
    });
  });

  describe("async function behavior", () => {
    it("should return promises for all async functions", () => {
      const filter = { property: "Status", select: { equals: "Published" } };
      const data = [{ id: "test-id", properties: {} }];

      const result1 = fetchNotionData(filter);
      const result2 = sortAndExpandNotionData(data);
      const result3 = fetchNotionPage();
      const result4 = fetchNotionBlocks("test-block-id");

      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      expect(result3).toBeInstanceOf(Promise);
      expect(result4).toBeInstanceOf(Promise);

      // Clean up promises to avoid unhandled rejections
      result1.catch(() => {});
      result2.catch(() => {});
      result3.catch(() => {});
      result4.catch(() => {});
    });
  });

  describe("sortAndExpandNotionData", () => {
    it("should handle empty data arrays", async () => {
      const emptyData: Array<Record<string, unknown>> = [];

      const result = await sortAndExpandNotionData(emptyData);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it("should handle data without Order property", async () => {
      const data = [
        { id: "1", properties: {} },
        { id: "2", properties: {} },
      ];

      const result = await sortAndExpandNotionData(data);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle data with Order properties", async () => {
      const data = [
        { id: "1", properties: { Order: { number: 2 } } },
        { id: "2", properties: { Order: { number: 1 } } },
      ];

      const result = await sortAndExpandNotionData(data);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
      // Should be sorted by Order
      if (result.length >= 2) {
        const firstOrder =
          result[0].properties?.["Order"]?.number ?? Number.MAX_SAFE_INTEGER;
        const secondOrder =
          result[1].properties?.["Order"]?.number ?? Number.MAX_SAFE_INTEGER;
        expect(firstOrder).toBeLessThanOrEqual(secondOrder);
      }
    });

    it("should handle mixed data with and without Order", async () => {
      const data = [
        { id: "1", properties: { Order: { number: 5 } } },
        { id: "2", properties: {} }, // no Order property
        { id: "3", properties: { Order: { number: 1 } } },
      ];

      const result = await sortAndExpandNotionData(data);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle data with Sub-item relations", async () => {
      const data = [
        {
          id: "parent",
          properties: {
            Order: { number: 1 },
            "Sub-item": { relation: [] }, // empty relations should work
          },
        },
      ];

      const result = await sortAndExpandNotionData(data);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("should maintain original data structure", async () => {
      const originalData = [
        {
          id: "test",
          properties: { Order: { number: 1 } },
          customField: "value",
        },
      ];

      const result = await sortAndExpandNotionData(originalData);

      expect(result[0]).toHaveProperty("id", "test");
      expect(result[0]).toHaveProperty("customField", "value");
    });
  });

  describe("parameter validation", () => {
    it("should handle null/undefined parameters gracefully", () => {
      // These should return promises but may reject due to invalid parameters
      expect(() => {
        const result1 = fetchNotionData(null);
        const result2 = fetchNotionBlocks(null);
        result1.catch(() => {});
        result2.catch(() => {});
      }).not.toThrow();
    });

    it("should handle empty string parameters", () => {
      expect(() => {
        const result = fetchNotionBlocks("");
        result.catch(() => {});
      }).not.toThrow();
    });

    it("should handle various filter types", () => {
      const filterTypes = [
        { property: "Status", select: { equals: "Published" } },
        { property: "Title", title: { contains: "test" } },
        { and: [{ property: "Status", select: { equals: "Draft" } }] },
      ];

      filterTypes.forEach((filter) => {
        expect(() => {
          const result = fetchNotionData(filter);
          result.catch(() => {});
        }).not.toThrow();
      });
    });
  });

  describe("error handling structure", () => {
    it("should not throw immediately for invalid parameters", () => {
      // Test that the functions return promises without making network calls
      const filter = { property: "NonExistent", select: { equals: "test" } };

      expect(() => {
        const result = fetchNotionData(filter);
        result.catch(() => {}); // Handle promise rejection
      }).not.toThrow();
    });

    it("should return promises for invalid block IDs", () => {
      expect(() => {
        const result = fetchNotionBlocks("invalid-block-id");
        result.catch(() => {}); // Handle promise rejection
      }).not.toThrow();
    });
  });

  describe("fetchNotionData comprehensive", () => {
    let enhancedNotion: any;
    let perfTelemetry: any;

    beforeEach(async () => {
      const notionModule = await import("./notionClient");
      const perfModule = await import("./perfTelemetry");
      enhancedNotion = notionModule.enhancedNotion;
      perfTelemetry = perfModule.perfTelemetry;
      vi.clearAllMocks();
    });

    it("should fetch single page without pagination", async () => {
      vi.mocked(enhancedNotion.dataSourcesQuery).mockResolvedValue({
        results: [{ id: "page1", properties: {} }],
        has_more: false,
        next_cursor: null,
      });

      const result = await fetchNotionData({
        property: "Status",
        select: { equals: "Published" },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("page1");
      expect(perfTelemetry.recordDataset).toHaveBeenCalledWith({
        parentPages: 1,
      });
    });

    it("should handle pagination with multiple pages", async () => {
      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [{ id: "page2", properties: {} }],
          has_more: true,
          next_cursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          results: [{ id: "page3", properties: {} }],
          has_more: false,
          next_cursor: null,
        });

      const result = await fetchNotionData({ property: "Status" });

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(["page1", "page2", "page3"]);
      expect(enhancedNotion.dataSourcesQuery).toHaveBeenCalledTimes(3);
    });

    it("should stop at safety limit and warn", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      // Mock infinite pagination with unique IDs to avoid anomaly detection
      let callCount = 0;
      vi.mocked(enhancedNotion.dataSourcesQuery).mockImplementation(
        async () => ({
          results: [{ id: `page-${++callCount}`, properties: {} }],
          has_more: true,
          next_cursor: `cursor-${callCount}`,
        })
      );

      const result = await fetchNotionData({ property: "Status" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Pagination safety limit exceeded")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("returning partial results")
      );
      expect(enhancedNotion.dataSourcesQuery).toHaveBeenCalledTimes(10_000);

      consoleWarnSpy.mockRestore();
    });

    it("should detect duplicate IDs and retry", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          // Duplicate ID anomaly
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          // Retry response with new data
          results: [{ id: "page2", properties: {} }],
          has_more: false,
          next_cursor: "cursor-2",
        });

      const result = await fetchNotionData({ property: "Status" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Notion API pagination anomaly detected")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Retrying once")
      );
      // Note: Duplicates are added to results before anomaly is detected
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(["page1", "page1", "page2"]);

      consoleWarnSpy.mockRestore();
    });

    it("should detect missing cursor anomaly and retry", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: null, // Anomaly: has_more but no cursor
        })
        .mockResolvedValueOnce({
          // Retry fails
          results: [],
          has_more: false,
          next_cursor: null,
        });

      const result = await fetchNotionData({ property: "Status" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Notion API pagination anomaly detected")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("anomaly persisted after retry")
      );

      consoleWarnSpy.mockRestore();
    });

    it("should detect same cursor anomaly", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [{ id: "page2", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1", // Same cursor
        })
        .mockResolvedValueOnce({
          // Retry
          results: [],
          has_more: false,
          next_cursor: null,
        });

      await fetchNotionData({ property: "Status" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Notion API pagination anomaly detected; retrying once..."
      );

      consoleWarnSpy.mockRestore();
    });

    it("should detect zero results anomaly", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [], // Zero results but has_more
          has_more: true,
          next_cursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          // Retry
          results: [],
          has_more: false,
          next_cursor: null,
        });

      await fetchNotionData({ property: "Status" });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Notion API pagination anomaly detected; retrying once..."
      );

      consoleWarnSpy.mockRestore();
    });

    it("should recover from anomaly after successful retry", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [], // Anomaly
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          // Successful retry with new cursor
          results: [{ id: "page2", properties: {} }],
          has_more: true,
          next_cursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          results: [{ id: "page3", properties: {} }],
          has_more: false,
          next_cursor: null,
        });

      const result = await fetchNotionData({ property: "Status" });

      expect(result).toHaveLength(3);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Notion API pagination anomaly detected; retrying once..."
      );

      consoleWarnSpy.mockRestore();
    });

    it("should filter out duplicate IDs in retry results", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.dataSourcesQuery)
        .mockResolvedValueOnce({
          results: [{ id: "page1", properties: {} }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [{ id: "page1" }], // Duplicate
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          // Retry with mix of duplicate and new
          results: [
            { id: "page1" }, // Duplicate, should be filtered
            { id: "page2" }, // New
          ],
          has_more: false,
          next_cursor: "cursor-2",
        });

      const result = await fetchNotionData({ property: "Status" });

      // page1 appears twice (original + duplicate before detection), page2 added from retry
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(["page1", "page1", "page2"]);

      consoleWarnSpy.mockRestore();
    });

    it("should handle results that are not arrays", async () => {
      vi.mocked(enhancedNotion.dataSourcesQuery).mockResolvedValue({
        results: null as any,
        has_more: false,
        next_cursor: null,
      });

      const result = await fetchNotionData({ property: "Status" });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe("sortAndExpandNotionData comprehensive", () => {
    let enhancedNotion: any;
    let perfTelemetry: any;
    let consoleLogSpy: any;

    beforeEach(async () => {
      const notionModule = await import("./notionClient");
      const perfModule = await import("./perfTelemetry");
      enhancedNotion = notionModule.enhancedNotion;
      perfTelemetry = perfModule.perfTelemetry;
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.clearAllMocks();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should fetch and add sub-pages with batching", async () => {
      const data = [
        {
          id: "parent1",
          url: "url1",
          properties: {
            Order: { number: 1 },
            Title: { title: [{ plain_text: "Parent 1" }] },
            "Sub-item": {
              relation: [{ id: "sub1" }, { id: "sub2" }],
            },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve)
        .mockResolvedValueOnce({ id: "sub1", properties: {} })
        .mockResolvedValueOnce({ id: "sub2", properties: {} });

      const result = await sortAndExpandNotionData(data);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(["parent1", "sub1", "sub2"]);
      expect(perfTelemetry.recordDataset).toHaveBeenCalledWith({
        parentPages: 1,
        subpageRelations: 2,
      });
    });

    it("should handle batch processing with multiple batches", async () => {
      const relations = Array.from({ length: 25 }, (_, i) => ({
        id: `sub${i}`,
      }));

      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: relations },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockImplementation(
        async ({ page_id }) => ({
          id: page_id,
          properties: {},
        })
      );

      const result = await sortAndExpandNotionData(data);

      expect(result).toHaveLength(26); // 1 parent + 25 subs
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Batch 1/3")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Batch 3/3")
      );
    });

    it("should handle sub-page fetch timeout", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: [{ id: "sub1" }, { id: "sub2" }] },
          },
        },
      ];

      // First call hangs indefinitely (simulating timeout), second succeeds
      vi.mocked(enhancedNotion.pagesRetrieve)
        .mockImplementationOnce(
          async () => new Promise(() => {}) // Never resolves
        )
        .mockResolvedValueOnce({ id: "sub2", properties: {} });

      const result = await sortAndExpandNotionData(data);

      // Should skip timed-out page but include successful one
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("API call timeout")
      );
      expect(result.length).toBeGreaterThanOrEqual(1);

      consoleWarnSpy.mockRestore();
    }, 15000); // 15s timeout to allow for 10s code timeout

    it("should handle sub-page fetch error gracefully", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: [{ id: "sub1" }, { id: "sub2" }] },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve)
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValueOnce({ id: "sub2", properties: {} });

      const result = await sortAndExpandNotionData(data);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping sub-page sub1")
      );
      expect(result).toHaveLength(2); // parent + sub2

      consoleWarnSpy.mockRestore();
    });

    it("should handle invalid API response", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: [{ id: "sub1" }] },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue(null as any);

      const result = await sortAndExpandNotionData(data);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid response from pagesRetrieve")
      );
      expect(result).toHaveLength(1); // Only parent

      consoleWarnSpy.mockRestore();
    });

    it("should insert sub-pages after parent and sort by Order when present", async () => {
      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Order: { number: 1 },
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: [{ id: "sub1" }, { id: "sub2" }] },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve)
        .mockResolvedValueOnce({ id: "sub1", properties: {} })
        .mockResolvedValueOnce({
          id: "sub2",
          properties: { Order: { number: 2 } },
        });

      const result = await sortAndExpandNotionData(data);

      expect(result.map((r) => r.id)).toEqual(["parent", "sub2", "sub1"]);
    });

    it("should dedupe duplicate Sub-item relations", async () => {
      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": {
              relation: [{ id: "sub1" }, { id: "sub1" }, { id: "sub2" }],
            },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockImplementation(
        async ({ page_id }) => ({ id: page_id, properties: {} })
      );

      const result = await sortAndExpandNotionData(data);

      expect(result.map((r) => r.id)).toEqual(["parent", "sub1", "sub2"]);
      expect(vi.mocked(enhancedNotion.pagesRetrieve)).toHaveBeenCalledTimes(2);
    });

    it("should log progress every 10 items", async () => {
      const relations = Array.from({ length: 15 }, (_, i) => ({
        id: `sub${i}`,
      }));

      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: relations },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockImplementation(
        async ({ page_id }) => ({ id: page_id })
      );

      await sortAndExpandNotionData(data);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fetched 10/15")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fetched 15/15")
      );
    });

    it("should handle Name property as fallback for parentTitle", async () => {
      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Name: { title: [{ plain_text: "Parent Name" }] },
            "Sub-item": { relation: [{ id: "sub1" }] },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue({
        id: "sub1",
        properties: {},
      });

      const result = await sortAndExpandNotionData(data);

      expect(result).toHaveLength(2);
    });

    it("should use 'Unknown' when no title or name exists", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            "Sub-item": { relation: [{ id: "sub1" }] },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockRejectedValue(
        new Error("Not found")
      );

      await sortAndExpandNotionData(data);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('parent: "Unknown"')
      );

      consoleWarnSpy.mockRestore();
    });

    it("should log success rate and duration", async () => {
      const data = [
        {
          id: "parent",
          url: "url",
          properties: {
            Title: { title: [{ plain_text: "Parent" }] },
            "Sub-item": { relation: [{ id: "sub1" }] },
          },
        },
      ];

      vi.mocked(enhancedNotion.pagesRetrieve).mockResolvedValue({
        id: "sub1",
      });

      await sortAndExpandNotionData(data);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Fetched 1\/1 sub-pages \(100\.0%\) in [\d.]+s/)
      );
    });

    it("should log each item URL", async () => {
      const data = [
        { id: "1", url: "https://notion.so/page1" },
        { id: "2", url: "https://notion.so/page2" },
      ];

      await sortAndExpandNotionData(data);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Item 1:",
        "https://notion.so/page1"
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Item 2:",
        "https://notion.so/page2"
      );
    });
  });

  describe("fetchNotionPage", () => {
    let enhancedNotion: any;

    beforeEach(async () => {
      const notionModule = await import("./notionClient");
      enhancedNotion = notionModule.enhancedNotion;
      vi.clearAllMocks();
    });

    it("should fetch page content successfully", async () => {
      const mockResponse = {
        results: [{ id: "block1", type: "paragraph" }],
        has_more: false,
      };

      vi.mocked(enhancedNotion.blocksChildrenList).mockResolvedValue(
        mockResponse
      );

      const result = await fetchNotionPage();

      expect(result).toEqual(mockResponse);
      expect(enhancedNotion.blocksChildrenList).toHaveBeenCalledWith({
        block_id: "test-db-id",
      });
    });

    it("should handle and rethrow errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const error = new Error("API error");
      vi.mocked(enhancedNotion.blocksChildrenList).mockRejectedValue(error);

      await expect(fetchNotionPage()).rejects.toThrow("API error");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch Notion page blocks")
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("API error")
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("fetchNotionBlocks", () => {
    let enhancedNotion: any;
    let consoleLogSpy: any;

    beforeEach(async () => {
      const notionModule = await import("./notionClient");
      enhancedNotion = notionModule.enhancedNotion;
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.clearAllMocks();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should fetch blocks without pagination", async () => {
      vi.mocked(enhancedNotion.blocksChildrenList).mockResolvedValue({
        results: [
          { id: "block1", type: "paragraph", has_children: false },
          { id: "block2", type: "heading_1", has_children: false },
        ],
        has_more: false,
        next_cursor: null,
      });

      const result = await fetchNotionBlocks("test-block-id");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("block1");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fetched 2 blocks")
      );
    });

    it("should handle pagination for blocks", async () => {
      vi.mocked(enhancedNotion.blocksChildrenList)
        .mockResolvedValueOnce({
          results: [{ id: "block1", has_children: false }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [{ id: "block2", has_children: false }],
          has_more: false,
          next_cursor: null,
        });

      const result = await fetchNotionBlocks("test-block-id");

      expect(result).toHaveLength(2);
      expect(enhancedNotion.blocksChildrenList).toHaveBeenCalledTimes(2);
    });

    it("should recursively fetch nested blocks", async () => {
      vi.mocked(enhancedNotion.blocksChildrenList)
        .mockResolvedValueOnce({
          results: [{ id: "parent-block", type: "toggle", has_children: true }],
          has_more: false,
          next_cursor: null,
        })
        .mockResolvedValueOnce({
          results: [
            { id: "child-block", type: "paragraph", has_children: false },
          ],
          has_more: false,
          next_cursor: null,
        });

      const result = await fetchNotionBlocks("test-block-id");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("parent-block");
      expect((result[0] as any).children).toHaveLength(1);
      expect((result[0] as any).children[0].id).toBe("child-block");
    });

    it("should stop at safety limit and warn", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      vi.mocked(enhancedNotion.blocksChildrenList).mockResolvedValue({
        results: [{ id: "block", has_children: false }],
        has_more: true,
        next_cursor: "cursor",
      });

      await fetchNotionBlocks("test-block-id");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("safety limit exceeded")
      );
      expect(enhancedNotion.blocksChildrenList).toHaveBeenCalledTimes(100);

      consoleWarnSpy.mockRestore();
    });

    it("should handle non-array results", async () => {
      vi.mocked(enhancedNotion.blocksChildrenList).mockResolvedValue({
        results: null as any,
        has_more: false,
        next_cursor: null,
      });

      const result = await fetchNotionBlocks("test-block-id");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it("should handle and rethrow errors", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const error = new Error("Block fetch error");
      vi.mocked(enhancedNotion.blocksChildrenList).mockRejectedValue(error);

      await expect(fetchNotionBlocks("test-block-id")).rejects.toThrow(
        "Block fetch error"
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error fetching Notion blocks:",
        error
      );

      consoleErrorSpy.mockRestore();
    });

    it("should pass start_cursor when paginating", async () => {
      vi.mocked(enhancedNotion.blocksChildrenList)
        .mockResolvedValueOnce({
          results: [{ id: "block1", has_children: false }],
          has_more: true,
          next_cursor: "cursor-abc",
        })
        .mockResolvedValueOnce({
          results: [{ id: "block2", has_children: false }],
          has_more: false,
          next_cursor: null,
        });

      await fetchNotionBlocks("test-block-id");

      expect(enhancedNotion.blocksChildrenList).toHaveBeenNthCalledWith(2, {
        block_id: "test-block-id",
        page_size: 100,
        start_cursor: "cursor-abc",
      });
    });

    it("should log pagination status", async () => {
      vi.mocked(enhancedNotion.blocksChildrenList)
        .mockResolvedValueOnce({
          results: [{ id: "block1", has_children: false }],
          has_more: true,
          next_cursor: "cursor-1",
        })
        .mockResolvedValueOnce({
          results: [{ id: "block2", has_children: false }],
          has_more: false,
          next_cursor: null,
        });

      await fetchNotionBlocks("test-block-id");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("(more pages available)")
      );
    });
  });
});
