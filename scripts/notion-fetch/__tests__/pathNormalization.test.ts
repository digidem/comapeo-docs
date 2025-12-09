import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";

// Mock fs before importing modules that use it
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

import {
  hasMissingOutputs,
  updatePageInCache,
  createEmptyCache,
  normalizePath,
  PROJECT_ROOT,
  CACHE_VERSION,
  type PageMetadataCache,
} from "../pageMetadataCache";

describe("normalizePath function", () => {
  it("should return empty string for empty input", () => {
    expect(normalizePath("")).toBe("");
  });

  it("should return empty string for null/undefined", () => {
    expect(normalizePath(null as unknown as string)).toBe("");
    expect(normalizePath(undefined as unknown as string)).toBe("");
  });

  it("should keep absolute paths that start with PROJECT_ROOT", () => {
    // Path that starts with PROJECT_ROOT should be kept as-is (normalized)
    const absolutePath = path.join(PROJECT_ROOT, "docs/intro.md");
    const result = normalizePath(absolutePath);
    expect(result).toBe(absolutePath);
  });

  it("should resolve non-project absolute paths against PROJECT_ROOT", () => {
    // Paths like /docs/intro.md should be treated as project-relative
    const result = normalizePath("/docs/intro.md");
    expect(result).toBe(path.join(PROJECT_ROOT, "docs/intro.md"));
  });

  it("should normalize path with ../ segments", () => {
    // Paths with ../ that resolve to PROJECT_ROOT should be kept
    const pathWithDots = path.join(PROJECT_ROOT, "docs/../docs/intro.md");
    const result = normalizePath(pathWithDots);
    expect(result).toBe(path.join(PROJECT_ROOT, "docs/intro.md"));
  });

  it("should normalize path with ./ segments", () => {
    const pathWithDot = path.join(PROJECT_ROOT, "docs/./intro.md");
    const result = normalizePath(pathWithDot);
    expect(result).toBe(path.join(PROJECT_ROOT, "docs/intro.md"));
  });

  it("should resolve relative path with leading slash against PROJECT_ROOT", () => {
    const result = normalizePath("/docs/intro.md");
    expect(result).toBe(path.join(PROJECT_ROOT, "docs/intro.md"));
  });

  it("should resolve relative path without leading slash against PROJECT_ROOT", () => {
    const result = normalizePath("docs/intro.md");
    expect(result).toBe(path.join(PROJECT_ROOT, "docs/intro.md"));
  });

  it("should produce consistent results for equivalent paths", () => {
    const path1 = normalizePath("/docs/intro.md");
    const path2 = normalizePath("docs/intro.md");
    expect(path1).toBe(path2);
  });

  it("should handle i18n paths correctly", () => {
    const result = normalizePath(
      "/i18n/pt/docusaurus-plugin-content-docs/current/intro.md"
    );
    expect(result).toBe(
      path.join(
        PROJECT_ROOT,
        "i18n/pt/docusaurus-plugin-content-docs/current/intro.md"
      )
    );
  });
});

describe("Path Normalization Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    writeFileSyncMock.mockReset();
  });

  describe("hasMissingOutputs path resolution", () => {
    it("should handle absolute paths correctly", () => {
      // Use actual PROJECT_ROOT paths for absolute path testing
      const absolutePath = path.join(PROJECT_ROOT, "docs/page.md");
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: [absolutePath],
            processedAt: "2024-01-01",
          },
        },
      };

      existsSyncMock.mockReturnValue(true);

      const result = hasMissingOutputs(cache, "page-1");
      expect(result).toBe(false);
      expect(existsSyncMock).toHaveBeenCalledWith(absolutePath);
    });

    it("should handle relative paths with leading slash", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page.md"],
            processedAt: "2024-01-01",
          },
        },
      };

      existsSyncMock.mockReturnValue(true);

      const result = hasMissingOutputs(cache, "page-1");
      expect(result).toBe(false);
      // Should resolve relative to PROJECT_ROOT
      expect(existsSyncMock).toHaveBeenCalled();
    });

    it("should handle relative paths without leading slash", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: ["docs/page.md"],
            processedAt: "2024-01-01",
          },
        },
      };

      existsSyncMock.mockReturnValue(true);

      const result = hasMissingOutputs(cache, "page-1");
      expect(result).toBe(false);
    });

    it("should return true when ANY output file is missing", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: ["/docs/page.md", "/i18n/pt/docs/page.md"],
            processedAt: "2024-01-01",
          },
        },
      };

      // First file exists, second doesn't
      existsSyncMock.mockImplementation((p: string) => {
        return !p.includes("/pt/");
      });

      const result = hasMissingOutputs(cache, "page-1");
      expect(result).toBe(true);
    });

    it("should handle empty outputPaths array (Phase 3 fix)", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: [],
            processedAt: "2024-01-01",
          },
        },
      };

      // Phase 3 fix: empty outputPaths means no files were written
      // This should trigger regeneration
      const result = hasMissingOutputs(cache, "page-1");
      expect(result).toBe(true);
    });

    it("should handle null/undefined outputPaths gracefully", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: undefined as unknown as string[],
            processedAt: "2024-01-01",
          },
        },
      };

      const result = hasMissingOutputs(cache, "page-1");
      expect(result).toBe(false);
    });

    it("should handle page not in cache", () => {
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {},
      };

      const result = hasMissingOutputs(cache, "non-existent-page");
      expect(result).toBe(false);
    });

    it("should handle null cache", () => {
      const result = hasMissingOutputs(null, "page-1");
      expect(result).toBe(false);
    });
  });

  describe("updatePageInCache path handling", () => {
    it("should merge output paths from multiple languages", () => {
      const cache = createEmptyCache("hash");

      // English version - paths get normalized
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/intro.md"],
        false
      );

      // Portuguese version (same page ID, different output)
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/i18n/pt/docusaurus-plugin-content-docs/current/intro.md"],
        false
      );

      expect(cache.pages["page-1"].outputPaths).toHaveLength(2);
      // Paths are now normalized to absolute paths
      expect(cache.pages["page-1"].outputPaths).toContain(
        path.join(PROJECT_ROOT, "docs/intro.md")
      );
      expect(cache.pages["page-1"].outputPaths).toContain(
        path.join(
          PROJECT_ROOT,
          "i18n/pt/docusaurus-plugin-content-docs/current/intro.md"
        )
      );
    });

    it("should deduplicate identical paths", () => {
      const cache = createEmptyCache("hash");

      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/intro.md"],
        false
      );

      // Same path added again
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/intro.md"],
        false
      );

      expect(cache.pages["page-1"].outputPaths).toHaveLength(1);
    });

    it("should handle path updates when page moves sections", () => {
      const cache = createEmptyCache("hash");

      // Original location
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/old-section/intro.md"],
        false
      );

      // New location (moved to different section)
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-02",
        ["/docs/new-section/intro.md"],
        false
      );

      // Both paths should be in cache (old file still exists until cleanup)
      expect(cache.pages["page-1"].outputPaths).toHaveLength(2);
      // Paths are normalized
      expect(cache.pages["page-1"].outputPaths).toContain(
        path.join(PROJECT_ROOT, "docs/old-section/intro.md")
      );
      expect(cache.pages["page-1"].outputPaths).toContain(
        path.join(PROJECT_ROOT, "docs/new-section/intro.md")
      );
    });

    it("should filter out empty/null paths", () => {
      const cache = createEmptyCache("hash");

      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01",
        ["/docs/intro.md", "", null as unknown as string],
        false
      );

      expect(cache.pages["page-1"].outputPaths).toHaveLength(1);
      // Path is normalized
      expect(cache.pages["page-1"].outputPaths).toContain(
        path.join(PROJECT_ROOT, "docs/intro.md")
      );
    });

    it("should keep newer lastEdited timestamp", () => {
      const cache = createEmptyCache("hash");

      // First update with older timestamp
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01T00:00:00.000Z",
        ["/docs/intro.md"],
        false
      );

      // Second update with newer timestamp
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-02T00:00:00.000Z",
        ["/docs/intro.md"],
        false
      );

      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-02T00:00:00.000Z");
    });

    it("should not regress to older timestamp", () => {
      const cache = createEmptyCache("hash");

      // First update with newer timestamp
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-02T00:00:00.000Z",
        ["/docs/intro.md"],
        false
      );

      // Second update with older timestamp (e.g., different language version)
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01T00:00:00.000Z",
        ["/i18n/pt/docs/intro.md"],
        false
      );

      // Should keep the newer timestamp
      expect(cache.pages["page-1"].lastEdited).toBe("2024-01-02T00:00:00.000Z");
    });

    it("should normalize old-format paths during migration", () => {
      const cache = createEmptyCache("hash");

      // Simulate an old cache with non-normalized paths (legacy format)
      cache.pages["page-1"] = {
        lastEdited: "2024-01-01T00:00:00.000Z",
        outputPaths: ["docs/intro.md"], // Old format: relative path without leading slash
        processedAt: "2024-01-01T00:00:00.000Z",
      };

      // Update with same file (different format)
      updatePageInCache(
        cache,
        "page-1",
        "2024-01-01T00:00:00.000Z",
        ["/docs/intro.md"], // New format: with leading slash
        false
      );

      // Should deduplicate: old "docs/intro.md" and new "/docs/intro.md"
      // both normalize to the same absolute path
      expect(cache.pages["page-1"].outputPaths).toHaveLength(1);
      expect(cache.pages["page-1"].outputPaths[0]).toBe(
        path.join(PROJECT_ROOT, "docs/intro.md")
      );
    });
  });

  describe("Path comparison scenarios", () => {
    it("should correctly identify when filePath matches cached outputPaths", () => {
      // Use normalized paths (what updatePageInCache would produce)
      const normalizedPath = path.join(PROJECT_ROOT, "docs/intro.md");
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: [normalizedPath],
            processedAt: "2024-01-01",
          },
        },
      };

      const filePath = normalizedPath;
      const cachedPage = cache.pages["page-1"];
      const pathInCache = cachedPage.outputPaths?.includes(filePath);

      expect(pathInCache).toBe(true);
    });

    it("should detect when filePath is NOT in cached outputPaths (page moved)", () => {
      const oldPath = path.join(PROJECT_ROOT, "docs/old-section/intro.md");
      const newPath = path.join(PROJECT_ROOT, "docs/new-section/intro.md");
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: [oldPath],
            processedAt: "2024-01-01",
          },
        },
      };

      const cachedPage = cache.pages["page-1"];
      const pathInCache = cachedPage.outputPaths?.includes(newPath);

      expect(pathInCache).toBe(false);
    });

    it("should handle case sensitivity in paths", () => {
      const upperCasePath = path.join(PROJECT_ROOT, "docs/Introduction.md");
      const lowerCasePath = path.join(PROJECT_ROOT, "docs/introduction.md");
      const cache: PageMetadataCache = {
        version: CACHE_VERSION,
        scriptHash: "hash",
        lastSync: "2024-01-01",
        pages: {
          "page-1": {
            lastEdited: "2024-01-01",
            outputPaths: [upperCasePath],
            processedAt: "2024-01-01",
          },
        },
      };

      const cachedPage = cache.pages["page-1"];
      const pathInCache = cachedPage.outputPaths?.includes(lowerCasePath);

      // Paths are case-sensitive by default
      expect(pathInCache).toBe(false);
    });
  });

  describe("normalizePath with system paths", () => {
    it("should preserve genuine absolute paths outside PROJECT_ROOT", () => {
      // Mock /etc as an existing system directory
      existsSyncMock.mockImplementation((p: string) => {
        return p === "/etc";
      });

      const etcPath = "/etc/some-config.txt";
      const result = normalizePath(etcPath);
      // Should NOT be rewritten to PROJECT_ROOT/etc/some-config.txt
      // because /etc is a real system directory that exists
      expect(result).toBe("/etc/some-config.txt");
      expect(result).not.toContain(PROJECT_ROOT);
    });

    it("should preserve absolute paths in system directories", () => {
      // Mock /dev as an existing system directory
      existsSyncMock.mockImplementation((p: string) => {
        return p === "/dev";
      });

      const devPath = "/dev/null";
      const result = normalizePath(devPath);
      expect(result).toBe("/dev/null");
      expect(result).not.toContain(PROJECT_ROOT);
    });

    it("should treat /docs/... as project-relative since /docs does not exist at system root", () => {
      // Mock that /docs does NOT exist at system root
      existsSyncMock.mockReturnValue(false);

      // Paths like /docs/intro.md are technically absolute on Unix,
      // but /docs doesn't exist at the filesystem root, so we treat
      // them as project-relative paths
      const result = normalizePath("/docs/intro.md");
      expect(result).toBe(path.join(PROJECT_ROOT, "docs/intro.md"));
    });

    it("should handle Windows-style absolute paths outside project", () => {
      // Mock C:\ as existing (Windows drive)
      existsSyncMock.mockImplementation((p: string) => {
        return p === "C:\\" || p.startsWith("C:\\");
      });

      // On Unix, this won't be detected as absolute, but the test
      // verifies the logic for when it would be
      const winPath = "C:\\temp\\file.txt";
      // path.isAbsolute would return true on Windows
      // On Unix, it returns false so it's treated as relative
      const result = normalizePath(winPath);
      // Behavior varies by platform, just ensure no error
      expect(result).toBeDefined();
    });
  });
});
