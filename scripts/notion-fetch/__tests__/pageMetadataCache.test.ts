import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const {
  existsSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  mkdirSyncMock,
  renameSyncMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  renameSyncMock: vi.fn(),
}));
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
  hasMissingOutputs,
  CACHE_VERSION,
  PAGE_METADATA_CACHE_PATH,
  PROJECT_ROOT,
  type PageMetadataCache,
} from "../pageMetadataCache";

// Mock fs module
vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    default: {
      ...(actual as Record<string, unknown>),
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
      writeFileSync: writeFileSyncMock,
      mkdirSync: mkdirSyncMock,
      renameSync: renameSyncMock,
    },
    existsSync: existsSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
    mkdirSync: mkdirSyncMock,
    renameSync: renameSyncMock,
  };
});

describe("pageMetadataCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    renameSyncMock.mockReset();
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
      existsSyncMock.mockReturnValue(false);

      const result = loadPageMetadataCache();

      expect(result).toBeNull();
    });

    it("should return null for invalid JSON", () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue("not valid json");

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
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(oldVersionCache));

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
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(validCache));

      const result = loadPageMetadataCache();

      expect(result).toEqual(validCache);
    });
  });

  describe("savePageMetadataCache", () => {
    it("should create directory if needed", () => {
      existsSyncMock.mockReturnValue(false);

      const cache = createEmptyCache("hash");
      savePageMetadataCache(cache);

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it("should write formatted JSON using atomic write pattern", () => {
      existsSyncMock.mockReturnValue(true);

      const cache = createEmptyCache("hash");
      savePageMetadataCache(cache);

      // Should write to temp file first
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(".tmp"),
        expect.stringContaining('"version"'),
        "utf-8"
      );

      // Then rename to target path
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringContaining(".tmp"),
        expect.not.stringContaining(".tmp")
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
      existsSyncMock.mockReturnValue(false);

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
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(validCache));

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
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(JSON.stringify(validCache));

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
      // Mock files exist
      existsSyncMock.mockReturnValue(true);

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
            outputPaths: [path.join(PROJECT_ROOT, "docs/page-1.md")],
            processedAt: "",
          },
          "2": {
            lastEdited: "2024-01-02T00:00:00.000Z",
            outputPaths: [path.join(PROJECT_ROOT, "docs/page-2.md")],
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
      // Mock files exist
      existsSyncMock.mockReturnValue(true);

      const pages = [
        { id: "1", last_edited_time: "2024-01-01" },
        { id: "new", last_edited_time: "2024-01-01" },
      ];
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": {
            lastEdited: "2024-01-01",
            outputPaths: [path.join(PROJECT_ROOT, "docs/page-1.md")],
            processedAt: "",
          },
        },
      };

      const result = filterChangedPages(pages, cache);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("new");
    });

    it("should treat missing output files as changed", () => {
      const pages = [{ id: "1", last_edited_time: "2024-01-01T00:00:00.000Z" }];
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: ["docs/page-1.md"],
            processedAt: "",
          },
        },
      };

      existsSyncMock.mockReturnValue(false);

      const result = filterChangedPages(pages, cache);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });

  describe("hasMissingOutputs", () => {
    it("returns true when any cached output file is missing", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: ["docs/page-1.md", "docs/page-1.fr.md"],
            processedAt: "",
          },
        },
      };

      existsSyncMock.mockImplementation((p) => {
        if (typeof p === "string" && p.endsWith("page-1.fr.md")) {
          return false;
        }
        return true;
      });

      expect(hasMissingOutputs(cache, "1")).toBe(true);
    });

    it("returns false when page is not in cache", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {},
      };

      expect(hasMissingOutputs(cache, "non-existent")).toBe(false);
    });

    it("returns false when cache is null", () => {
      expect(hasMissingOutputs(null, "page-1")).toBe(false);
    });

    it("returns false when outputPaths is undefined", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: undefined as unknown as string[],
            processedAt: "",
          },
        },
      };

      expect(hasMissingOutputs(cache, "1")).toBe(false);
    });

    it("returns true when outputPaths is empty array (Phase 3 fix)", () => {
      // Empty outputPaths means no files were written - treat as missing
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
        },
      };

      expect(hasMissingOutputs(cache, "1")).toBe(true);
    });

    it("returns false when all output files exist", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-02",
        pages: {
          "1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: ["/docs/page-1.md", "/i18n/pt/docs/page-1.md"],
            processedAt: "",
          },
        },
      };

      existsSyncMock.mockReturnValue(true);

      expect(hasMissingOutputs(cache, "1")).toBe(false);
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

      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/test.md"],
        false
      );

      expect(cache.pages["page-1"]).toBeDefined();
      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-01");
      // Paths are normalized to absolute paths
      expect(cache.pages["page-1"].outputPaths).toEqual([
        path.join(PROJECT_ROOT, "docs/test.md"),
      ]);
    });

    it("should update existing page in cache", () => {
      const cache = createEmptyCache("hash");
      // Use normalized path for existing entry
      const oldPath = path.join(PROJECT_ROOT, "docs/old.md");
      cache.pages["page-1"] = {
        lastEdited: "2024-01-01",
        outputPaths: [oldPath],
        processedAt: "2024-01-01",
      };

      updatePageInCache(cache, "page-1", "2024-01-02", ["/docs/new.md"], false);

      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-02");
      expect(cache.pages["page-1"].outputPaths.sort()).toEqual(
        [path.join(PROJECT_ROOT, "docs/new.md"), oldPath].sort()
      );
    });

    it("should merge and deduplicate output paths across languages", () => {
      const cache = createEmptyCache("hash");

      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/page-1.md"],
        false
      );
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/fr/page-1.md", "/docs/page-1.md", "/docs/page-2.md"],
        false
      );

      // Paths are normalized to absolute paths
      expect(cache.pages["page-1"].outputPaths.sort()).toEqual(
        [
          path.join(PROJECT_ROOT, "docs/fr/page-1.md"),
          path.join(PROJECT_ROOT, "docs/page-1.md"),
          path.join(PROJECT_ROOT, "docs/page-2.md"),
        ].sort()
      );
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
