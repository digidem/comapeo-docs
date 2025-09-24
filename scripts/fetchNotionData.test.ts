import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installTestNotionEnv } from "./test-utils";

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
});
