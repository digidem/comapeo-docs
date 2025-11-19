import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  loadPageMetadataCache,
  savePageMetadataCache,
  createEmptyCache,
  determineSyncMode,
  filterChangedPages,
  findDeletedPages,
  updatePageInCache,
  removePageFromCache,
  getCacheStats,
  CACHE_VERSION,
  PAGE_METADATA_CACHE_PATH,
  type PageMetadataCache,
} from "../pageMetadataCache";

// Mock fs module
vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe("pageMetadataCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createEmptyCache", () => {
    it("should create cache with correct structure", () => {
      const cache = createEmptyCache("test-hash-123");

      expect(cache.version).toBe(CACHE_VERSION);
      expect(cache.scriptHash).toBe("test-hash-123");
      expect(cache.lastSync).toBeDefined();
      expect(cache.pages).toEqual({});
    });
  });

  describe("loadPageMetadataCache", () => {
    it("should return null when cache file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadPageMetadataCache();

      expect(result).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("not valid json");

      const result = loadPageMetadataCache();

      expect(result).toBeNull();
    });

    it("should return null for wrong version", () => {
      const oldVersionCache = {
        version: "0.1",
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {},
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(oldVersionCache)
      );

      const result = loadPageMetadataCache();

      expect(result).toBeNull();
    });

    it("should load valid cache", () => {
      const validCache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "valid-hash",
        lastSync: "2024-01-01T00:00:00.000Z",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: ["/docs/test.md"],
            processedAt: "2024-01-01T00:00:00.000Z",
          },
        },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCache));

      const result = loadPageMetadataCache();

      expect(result).toEqual(validCache);
    });
  });

  describe("savePageMetadataCache", () => {
    it("should create directory if needed", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cache = createEmptyCache("hash");
      savePageMetadataCache(cache);

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it("should write formatted JSON", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const cache = createEmptyCache("hash");
      savePageMetadataCache(cache);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"version"'),
        "utf-8"
      );
    });
  });

  describe("determineSyncMode", () => {
    it("should return full rebuild when force is true", () => {
      const result = determineSyncMode("hash", true);

      expect(result.fullRebuild).toBe(true);
      expect(result.reason).toContain("--force");
      expect(result.cache).toBeNull();
    });

    it("should return full rebuild when no cache exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = determineSyncMode("hash", false);

      expect(result.fullRebuild).toBe(true);
      expect(result.reason).toContain("No existing cache");
    });

    it("should return full rebuild when script hash changed", () => {
      const validCache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "old-hash",
        lastSync: "2024-01-01T00:00:00.000Z",
        pages: {},
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCache));

      const result = determineSyncMode("new-hash", false);

      expect(result.fullRebuild).toBe(true);
      expect(result.reason).toContain("Script files have changed");
    });

    it("should return incremental sync when cache is valid", () => {
      const validCache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "same-hash",
        lastSync: "2024-01-01T00:00:00.000Z",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: [],
            processedAt: "2024-01-01",
          },
        },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCache));

      const result = determineSyncMode("same-hash", false);

      expect(result.fullRebuild).toBe(false);
      expect(result.cache).toEqual(validCache);
    });
  });

  describe("filterChangedPages", () => {
    it("should return all pages when cache is null", () => {
      const pages = [
        { id: "1", last_edited_time: "2024-01-01" },
        { id: "2", last_edited_time: "2024-01-02" },
      ];

      const result = filterChangedPages(pages, null);

      expect(result).toHaveLength(2);
    });

    it("should filter unchanged pages", () => {
      const pages = [
        { id: "1", last_edited_time: "2024-01-01T00:00:00.000Z" },
        { id: "2", last_edited_time: "2024-01-03T00:00:00.000Z" },
      ];
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: [],
            processedAt: "",
          },
          "2": {
            lastEdited: "2024-01-02T00:00:00.000Z",
            outputPaths: [],
            processedAt: "",
          },
        },
      };

      const result = filterChangedPages(pages, cache);

      // Page 1 is unchanged, page 2 is newer
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("2");
    });

    it("should include new pages not in cache", () => {
      const pages = [
        { id: "1", last_edited_time: "2024-01-01" },
        { id: "new", last_edited_time: "2024-01-01" },
      ];
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": { lastEdited: "2024-01-01", outputPaths: [], processedAt: "" },
        },
      };

      const result = filterChangedPages(pages, cache);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("new");
    });
  });

  describe("findDeletedPages", () => {
    it("should return empty array when cache is null", () => {
      const result = findDeletedPages(new Set(["1", "2"]), null);

      expect(result).toHaveLength(0);
    });

    it("should find pages in cache but not in current set", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "",
        pages: {
          "1": {
            lastEdited: "",
            outputPaths: ["/docs/one.md"],
            processedAt: "",
          },
          "2": {
            lastEdited: "",
            outputPaths: ["/docs/two.md"],
            processedAt: "",
          },
          "3": {
            lastEdited: "",
            outputPaths: ["/docs/three.md"],
            processedAt: "",
          },
        },
      };

      const result = findDeletedPages(new Set(["1"]), cache);

      expect(result).toHaveLength(2);
      expect(result.map((d) => d.pageId).sort()).toEqual(["2", "3"]);
    });
  });

  describe("updatePageInCache", () => {
    it("should add new page to cache", () => {
      const cache = createEmptyCache("hash");

      updatePageInCache(cache, "page-1", "2024-01-01", ["/docs/test.md"]);

      expect(cache.pages["page-1"]).toBeDefined();
      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-01");
      expect(cache.pages["page-1"].outputPaths).toEqual(["/docs/test.md"]);
    });

    it("should update existing page in cache", () => {
      const cache = createEmptyCache("hash");
      cache.pages["page-1"] = {
        lastEdited: "2024-01-01",
        outputPaths: ["/docs/old.md"],
        processedAt: "2024-01-01",
      };

      updatePageInCache(cache, "page-1", "2024-01-02", ["/docs/new.md"]);

      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-02");
      expect(cache.pages["page-1"].outputPaths).toEqual(["/docs/new.md"]);
    });
  });

  describe("removePageFromCache", () => {
    it("should remove page from cache", () => {
      const cache = createEmptyCache("hash");
      cache.pages["page-1"] = {
        lastEdited: "2024-01-01",
        outputPaths: [],
        processedAt: "",
      };

      removePageFromCache(cache, "page-1");

      expect(cache.pages["page-1"]).toBeUndefined();
    });
  });

  describe("getCacheStats", () => {
    it("should return zero for null cache", () => {
      const stats = getCacheStats(null);

      expect(stats.totalPages).toBe(0);
      expect(stats.lastSync).toBeNull();
    });

    it("should count pages correctly", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01T00:00:00.000Z",
        pages: {
          "1": { lastEdited: "", outputPaths: [], processedAt: "" },
          "2": { lastEdited: "", outputPaths: [], processedAt: "" },
        },
      };

      const stats = getCacheStats(cache);

      expect(stats.totalPages).toBe(2);
      expect(stats.lastSync).toBe("2024-01-01T00:00:00.000Z");
    });
  });
});
