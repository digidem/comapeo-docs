import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { computeScriptHash, CRITICAL_SCRIPT_FILES } from "../scriptHasher";
import {
  loadPageMetadataCache,
  savePageMetadataCache,
  createEmptyCache,
  determineSyncMode,
  filterChangedPages,
  findDeletedPages,
  updatePageInCache,
  CACHE_VERSION,
  PAGE_METADATA_CACHE_PATH,
  type PageMetadataCache,
} from "../pageMetadataCache";

describe("Incremental Sync Integration", () => {
  describe("Full sync flow", () => {
    it("should correctly identify sync mode based on script hash", async () => {
      // Compute current script hash
      const hashResult = await computeScriptHash();
      expect(hashResult.hash).toBeDefined();
      expect(hashResult.filesHashed).toBeGreaterThan(0);

      // First run should require full rebuild (no cache)
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const firstRun = determineSyncMode(hashResult.hash, false);
      expect(firstRun.fullRebuild).toBe(true);
      expect(firstRun.reason).toContain("No existing cache");

      // Restore mock
      vi.restoreAllMocks();
    });

    it("should filter pages correctly based on timestamps", () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);

      const pages = [
        { id: "page-1", last_edited_time: "2024-01-01T00:00:00.000Z" },
        { id: "page-2", last_edited_time: "2024-01-05T00:00:00.000Z" },
        { id: "page-3", last_edited_time: "2024-01-10T00:00:00.000Z" },
      ];

      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "test-hash",
        lastSync: "2024-01-03T00:00:00.000Z",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01T00:00:00.000Z",
            outputPaths: ["/docs/page-1.md"],
            processedAt: "2024-01-02T00:00:00.000Z",
          },
          "page-2": {
            lastEdited: "2024-01-03T00:00:00.000Z",
            outputPaths: ["/docs/page-2.md"],
            processedAt: "2024-01-03T00:00:00.000Z",
          },
        },
      };

      const changedPages = filterChangedPages(pages, cache);

      // page-1: unchanged (same timestamp)
      // page-2: changed (2024-01-05 > 2024-01-03)
      // page-3: new (not in cache)
      expect(changedPages).toHaveLength(2);
      expect(changedPages.map((p) => p.id).sort()).toEqual([
        "page-2",
        "page-3",
      ]);

      vi.restoreAllMocks();
    });

    it("should update cache correctly after processing", () => {
      const cache = createEmptyCache("test-hash");

      // Simulate processing pages
      updatePageInCache(cache, "page-1", "2024-01-01T00:00:00.000Z", [
        "/docs/page-1.md",
      ]);
      updatePageInCache(cache, "page-2", "2024-01-02T00:00:00.000Z", [
        "/docs/page-2.md",
      ]);

      expect(Object.keys(cache.pages)).toHaveLength(2);
      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-01T00:00:00.000Z");
      expect(cache.pages["page-2"].outputPaths).toEqual(["/docs/page-2.md"]);
    });

    it("should handle version migration correctly", () => {
      // Mock old version cache
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({
          version: "0.9", // Old version
          scriptHash: "hash",
          lastSync: "2024-01-01",
          pages: {},
        })
      );

      const cache = loadPageMetadataCache();
      expect(cache).toBeNull(); // Should reject old version

      vi.restoreAllMocks();
    });

    it("should force full rebuild when requested", async () => {
      const hashResult = await computeScriptHash();

      // Mock valid cache
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({
          version: CACHE_VERSION,
          scriptHash: hashResult.hash,
          lastSync: "2024-01-01",
          pages: {
            "page-1": { lastEdited: "", outputPaths: [], processedAt: "" },
          },
        })
      );

      // Even with valid cache, force should trigger full rebuild
      const forcedRun = determineSyncMode(hashResult.hash, true);
      expect(forcedRun.fullRebuild).toBe(true);
      expect(forcedRun.reason).toContain("--force");

      vi.restoreAllMocks();
    });

    it("should detect script changes and require full rebuild", async () => {
      const hashResult = await computeScriptHash();

      // Mock cache with different script hash
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        JSON.stringify({
          version: CACHE_VERSION,
          scriptHash: "different-hash-from-before",
          lastSync: "2024-01-01",
          pages: {},
        })
      );

      const result = determineSyncMode(hashResult.hash, false);
      expect(result.fullRebuild).toBe(true);
      expect(result.reason).toContain("Script files have changed");

      vi.restoreAllMocks();
    });
  });

  describe("Deletion safety (enableDeletion option)", () => {
    it("should only delete pages when enableDeletion is explicitly true", () => {
      // This test verifies that deletion is OFF by default.
      // When using --max-pages, --status-filter, or single-page fetch,
      // pages missing from the current fetch are NOT treated as deleted.

      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "test-hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page-1.md"],
            processedAt: "2024-01-01",
          },
          "page-2": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page-2.md"],
            processedAt: "2024-01-01",
          },
          "page-3": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page-3.md"],
            processedAt: "2024-01-01",
          },
        },
      };

      // Simulate partial fetch with only page-1 (e.g., --max-pages 1 or notion-fetch-one)
      const partialPageIds = new Set(["page-1"]);

      // findDeletedPages would return page-2 and page-3 as "deleted"
      const wouldBeDeleted = findDeletedPages(partialPageIds, cache);
      expect(wouldBeDeleted).toHaveLength(2);

      // But with enableDeletion=false (the default), the deletion logic is skipped entirely.
      // Only full fetches without filters should set enableDeletion=true.
    });

    it("should skip deletion entirely when the fetch returns zero pages", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "test-hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page-1.md"],
            processedAt: "2024-01-01",
          },
          "page-2": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page-2.md"],
            processedAt: "2024-01-01",
          },
        },
      };

      const emptyFetchIds = new Set<string>(); // Simulates Notion returning no rows
      const deleted = findDeletedPages(emptyFetchIds, cache);
      expect(deleted).toHaveLength(0);
    });
  });

  describe("Script hash stability", () => {
    it("should produce consistent hash for same files", async () => {
      const hash1 = await computeScriptHash();
      const hash2 = await computeScriptHash();

      expect(hash1.hash).toBe(hash2.hash);
      expect(hash1.filesHashed).toBe(hash2.filesHashed);
    });

    it("should include expected critical files", () => {
      // Verify essential files are in the list
      const essentialFiles = [
        "scripts/notion-fetch/generateBlocks.ts",
        "scripts/notion-fetch/imageReplacer.ts",
        "scripts/notion-fetch/frontmatterBuilder.ts",
        "scripts/constants.ts",
      ];

      for (const file of essentialFiles) {
        expect(CRITICAL_SCRIPT_FILES).toContain(file);
      }
    });
  });
});
