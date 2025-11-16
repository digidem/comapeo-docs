import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logProgress,
  loadWithCache,
  loadBlocksForPage,
  loadMarkdownForPage,
  type CacheLoaderConfig,
} from "./cacheLoaders";
import { LRUCache } from "./cacheStrategies";

describe("cacheLoaders", () => {
  describe("logProgress", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should log progress at index 0", () => {
      logProgress(0, 10, "Test", "Title");
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test 1/10")
      );
    });

    it("should log progress at last index", () => {
      logProgress(9, 10, "Test", "Title");
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test 10/10")
      );
    });

    it("should log progress at every 10th item", () => {
      logProgress(9, 100, "Test", "Title");
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test 10/100")
      );
    });

    it("should not log progress for intermediate items", () => {
      logProgress(5, 100, "Test", "Title");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should not log when total is 0", () => {
      logProgress(0, 0, "Test", "Title");
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it("should include prefix and title in log message", () => {
      logProgress(0, 5, "Fetching", "My Page");
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Fetching")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("My Page")
      );
    });
  });

  describe("loadWithCache", () => {
    type TestData = { value: string };

    let mainMap: Map<string, { key: string; data: TestData }>;
    let prefetchCache: LRUCache<TestData>;
    let inFlightMap: Map<string, Promise<TestData>>;
    let cacheHits: { value: number };
    let fetchCount: { value: number };
    let fetchFn: ReturnType<typeof vi.fn>;
    let normalizeResult: (result: any) => TestData;
    let config: CacheLoaderConfig<TestData>;

    beforeEach(() => {
      mainMap = new Map();
      prefetchCache = new LRUCache<TestData>(10);
      inFlightMap = new Map();
      cacheHits = { value: 0 };
      fetchCount = { value: 0 };
      fetchFn = vi.fn().mockResolvedValue({ value: "fetched" });
      normalizeResult = (result) => result;

      config = {
        mainMap,
        prefetchCache,
        inFlightMap,
        cacheHits,
        fetchCount,
        fetchFn,
        normalizeResult,
        logPrefix: "Test",
      };
    });

    it("should return normalized empty result when pageId is missing", async () => {
      const emptyNormalize = () => ({ value: "empty" });
      const result = await loadWithCache({}, 0, 1, "Test", {
        ...config,
        normalizeResult: emptyNormalize,
      });

      expect(result).toEqual({ data: { value: "empty" }, source: "cache" });
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("should return data from main map cache if key matches", async () => {
      const pageRecord = { id: "page-1", last_edited_time: "2024-01-01" };
      const cacheKey = "page-1:2024-01-01";
      const cachedData = { value: "cached" };

      mainMap.set("page-1", { key: cacheKey, data: cachedData });

      const result = await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(result).toEqual({ data: cachedData, source: "cache" });
      expect(cacheHits.value).toBe(1);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("should not use main map cache if key does not match", async () => {
      const pageRecord = { id: "page-1", last_edited_time: "2024-01-02" };
      const oldCacheKey = "page-1:2024-01-01";
      const oldData = { value: "old" };

      mainMap.set("page-1", { key: oldCacheKey, data: oldData });

      const result = await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(result.data).toEqual({ value: "fetched" });
      expect(result.source).toBe("fetched");
      expect(fetchFn).toHaveBeenCalledWith("page-1");
    });

    it("should return data from prefetch cache if available", async () => {
      const pageRecord = { id: "page-2", last_edited_time: "2024-01-01" };
      const cacheKey = "page-2:2024-01-01";
      const cachedData = { value: "prefetched" };

      prefetchCache.set(cacheKey, cachedData);

      const result = await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(result).toEqual({ data: cachedData, source: "cache" });
      expect(cacheHits.value).toBe(1);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(mainMap.get("page-2")).toEqual({
        key: cacheKey,
        data: cachedData,
      });
    });

    it("should fetch data when not in any cache", async () => {
      const pageRecord = { id: "page-3", last_edited_time: "2024-01-01" };

      const result = await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(result).toEqual({ data: { value: "fetched" }, source: "fetched" });
      expect(fetchCount.value).toBe(1);
      expect(fetchFn).toHaveBeenCalledWith("page-3");
    });

    it("should deduplicate concurrent requests for same cache key", async () => {
      const pageRecord = { id: "page-4", last_edited_time: "2024-01-01" };

      const promise1 = loadWithCache(pageRecord, 0, 1, "Test", config);
      const promise2 = loadWithCache(pageRecord, 0, 1, "Test", config);
      const promise3 = loadWithCache(pageRecord, 0, 1, "Test", config);

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(result1).toEqual({
        data: { value: "fetched" },
        source: "fetched",
      });
      expect(result2).toEqual({
        data: { value: "fetched" },
        source: "fetched",
      });
      expect(result3).toEqual({
        data: { value: "fetched" },
        source: "fetched",
      });
      expect(fetchFn).toHaveBeenCalledTimes(1); // Only one fetch despite 3 requests
    });

    it("should store fetched data in prefetch cache", async () => {
      const pageRecord = { id: "page-5", last_edited_time: "2024-01-01" };
      const cacheKey = "page-5:2024-01-01";

      await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(prefetchCache.has(cacheKey)).toBe(true);
      expect(prefetchCache.get(cacheKey)).toEqual({ value: "fetched" });
    });

    it("should store fetched data in main map", async () => {
      const pageRecord = { id: "page-6", last_edited_time: "2024-01-01" };
      const cacheKey = "page-6:2024-01-01";

      await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(mainMap.get("page-6")).toEqual({
        key: cacheKey,
        data: { value: "fetched" },
      });
    });

    it("should handle fetch errors and remove from prefetch cache", async () => {
      const pageRecord = { id: "page-7", last_edited_time: "2024-01-01" };
      const cacheKey = "page-7:2024-01-01";
      const errorFetchFn = vi.fn().mockRejectedValue(new Error("Fetch failed"));

      const errorConfig = { ...config, fetchFn: errorFetchFn };

      await expect(
        loadWithCache(pageRecord, 0, 1, "Test", errorConfig)
      ).rejects.toThrow("Fetch failed");

      expect(prefetchCache.has(cacheKey)).toBe(false);
    });

    it("should normalize fetched results", async () => {
      const pageRecord = { id: "page-8", last_edited_time: "2024-01-01" };
      const customNormalize = (result: any) => ({ value: result.raw });
      const customFetchFn = vi.fn().mockResolvedValue({ raw: "normalized" });

      const customConfig = {
        ...config,
        fetchFn: customFetchFn,
        normalizeResult: customNormalize,
      };

      const result = await loadWithCache(
        pageRecord,
        0,
        1,
        "Test",
        customConfig
      );

      expect(result.data).toEqual({ value: "normalized" });
    });

    it("should clean up in-flight map after fetch completes", async () => {
      const pageRecord = { id: "page-9", last_edited_time: "2024-01-01" };
      const cacheKey = "page-9:2024-01-01";

      await loadWithCache(pageRecord, 0, 1, "Test", config);

      expect(inFlightMap.has(cacheKey)).toBe(false);
    });

    it("should clean up in-flight map after fetch fails", async () => {
      const pageRecord = { id: "page-10", last_edited_time: "2024-01-01" };
      const cacheKey = "page-10:2024-01-01";
      const errorFetchFn = vi.fn().mockRejectedValue(new Error("Fetch failed"));

      const errorConfig = { ...config, fetchFn: errorFetchFn };

      await expect(
        loadWithCache(pageRecord, 0, 1, "Test", errorConfig)
      ).rejects.toThrow("Fetch failed");

      expect(inFlightMap.has(cacheKey)).toBe(false);
    });
  });

  describe("loadBlocksForPage", () => {
    it("should delegate to loadWithCache with correct configuration", async () => {
      const mainMap = new Map();
      const prefetchCache = new LRUCache<any[]>(10);
      const inFlightMap = new Map();
      const cacheHits = { value: 0 };
      const fetchCount = { value: 0 };

      const pageRecord = { id: "block-page", last_edited_time: "2024-01-01" };

      // Mock fetchNotionBlocks to avoid actual API calls
      const mockBlocks = [{ type: "paragraph", id: "block-1" }];
      vi.doMock("../fetchNotionData", () => ({
        fetchNotionBlocks: vi.fn().mockResolvedValue(mockBlocks),
      }));

      const result = await loadBlocksForPage(
        pageRecord,
        0,
        1,
        "Test",
        mainMap,
        prefetchCache,
        inFlightMap,
        cacheHits,
        fetchCount
      );

      expect(result.source).toBe("fetched");
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should normalize non-array results to empty array", async () => {
      const mainMap = new Map();
      const prefetchCache = new LRUCache<any[]>(10);
      const inFlightMap = new Map();
      const cacheHits = { value: 0 };
      const fetchCount = { value: 0 };

      // Mock fetchNotionBlocks to return non-array
      vi.doMock("../fetchNotionData", () => ({
        fetchNotionBlocks: vi.fn().mockResolvedValue(null),
      }));

      const pageRecord = { id: "null-page", last_edited_time: "2024-01-01" };

      const result = await loadBlocksForPage(
        pageRecord,
        0,
        1,
        "Test",
        mainMap,
        prefetchCache,
        inFlightMap,
        cacheHits,
        fetchCount
      );

      expect(result.data).toEqual([]);
    });
  });

  describe("loadMarkdownForPage", () => {
    it("should delegate to loadWithCache with correct configuration", async () => {
      const mainMap = new Map();
      const prefetchCache = new LRUCache<any>(10);
      const inFlightMap = new Map();
      const cacheHits = { value: 0 };
      const fetchCount = { value: 0 };

      const pageRecord = { id: "md-page", last_edited_time: "2024-01-01" };

      // Mock n2m.pageToMarkdown
      const mockMarkdown = { parent: "# Test" };
      vi.doMock("../notionClient", () => ({
        n2m: {
          pageToMarkdown: vi.fn().mockResolvedValue(mockMarkdown),
        },
      }));

      const result = await loadMarkdownForPage(
        pageRecord,
        0,
        1,
        "Test",
        mainMap,
        prefetchCache,
        inFlightMap,
        cacheHits,
        fetchCount
      );

      expect(result.source).toBe("fetched");
    });

    it("should normalize non-array, non-null results correctly", async () => {
      const mainMap = new Map();
      const prefetchCache = new LRUCache<any>(10);
      const inFlightMap = new Map();
      const cacheHits = { value: 0 };
      const fetchCount = { value: 0 };

      const pageRecord = { id: "obj-page", last_edited_time: "2024-01-01" };

      const mockResult = { parent: "content" };
      vi.doMock("../notionClient", () => ({
        n2m: {
          pageToMarkdown: vi.fn().mockResolvedValue(mockResult),
        },
      }));

      const result = await loadMarkdownForPage(
        pageRecord,
        0,
        1,
        "Test",
        mainMap,
        prefetchCache,
        inFlightMap,
        cacheHits,
        fetchCount
      );

      expect(result.data).toEqual(mockResult);
    });
  });
});
