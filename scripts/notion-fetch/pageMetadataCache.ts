import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Project root directory, exported for consistent path resolution across modules.
 */
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * Normalize a file path to an absolute path for consistent comparison.
 * Handles both absolute and relative paths, resolving relative paths
 * against PROJECT_ROOT.
 *
 * Important: Paths like "/docs/intro.md" are treated as project-relative
 * (not filesystem absolute) unless they start with PROJECT_ROOT.
 *
 * @param filePath - The path to normalize (can be absolute or relative)
 * @returns Absolute, normalized path
 */
export function normalizePath(filePath: string): string {
  if (!filePath) {
    return "";
  }

  // Check if this is a truly absolute path (starts with PROJECT_ROOT)
  // Paths like "/docs/intro.md" on Unix look absolute but are actually
  // project-relative paths that should be resolved against PROJECT_ROOT
  const resolvedPath = path.resolve(filePath);
  if (resolvedPath.startsWith(PROJECT_ROOT)) {
    return resolvedPath;
  }

  // For all other paths (including /docs/... on Unix), treat as project-relative
  // Strip leading slash if present (common in stored paths like "/docs/...")
  const cleanPath = filePath.replace(/^\//, "");
  return path.resolve(PROJECT_ROOT, cleanPath);
}

/**
 * Current cache schema version.
 * Bump this when making breaking changes to the cache format.
 */
export const CACHE_VERSION = "1.0";

/**
 * Path to the page metadata cache file
 */
export const PAGE_METADATA_CACHE_PATH = path.join(
  PROJECT_ROOT,
  ".cache",
  "page-metadata.json"
);

/**
 * Metadata for a single processed page
 */
export interface PageMetadata {
  /** Notion's last_edited_time for the page */
  lastEdited: string;
  /** Path to the generated output file(s), relative to project root */
  outputPaths: string[];
  /** ISO timestamp when we processed this page */
  processedAt: string;
  /** Whether the generated content still contains S3 URLs */
  containsS3?: boolean;
}

/**
 * Full page metadata cache structure
 */
export interface PageMetadataCache {
  /** Schema version for migration handling */
  version: string;
  /** Hash of all critical script files */
  scriptHash: string;
  /** ISO timestamp of the last sync run */
  lastSync: string;
  /** Map of page ID to metadata */
  pages: Record<string, PageMetadata>;
}

/**
 * Result of determining sync mode
 */
export interface SyncModeResult {
  /** Whether a full rebuild is required */
  fullRebuild: boolean;
  /** Reason for the sync mode decision */
  reason: string;
  /** Loaded cache (null if not available or invalid) */
  cache: PageMetadataCache | null;
}

/**
 * Load the page metadata cache from disk.
 * Returns null if cache doesn't exist, is invalid, or has wrong version.
 */
export function loadPageMetadataCache(): PageMetadataCache | null {
  try {
    if (!fs.existsSync(PAGE_METADATA_CACHE_PATH)) {
      return null;
    }

    const raw = fs.readFileSync(PAGE_METADATA_CACHE_PATH, "utf-8");
    const cache = JSON.parse(raw) as PageMetadataCache;

    // Validate structure
    if (!cache.version || !cache.scriptHash || !cache.pages) {
      return null;
    }

    // Check version compatibility
    if (cache.version !== CACHE_VERSION) {
      return null;
    }

    return cache;
  } catch {
    return null;
  }
}

/**
 * Save the page metadata cache to disk.
 * Creates the .cache directory if it doesn't exist.
 * Uses atomic write pattern (write to temp, then rename) to prevent corruption.
 */
export function savePageMetadataCache(cache: PageMetadataCache): void {
  const cacheDir = path.dirname(PAGE_METADATA_CACHE_PATH);

  // Ensure .cache directory exists
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const json = JSON.stringify(cache, null, 2);
  const tempPath = `${PAGE_METADATA_CACHE_PATH}.tmp`;

  // Write to temp file first, then rename for atomic operation
  fs.writeFileSync(tempPath, json, "utf-8");
  fs.renameSync(tempPath, PAGE_METADATA_CACHE_PATH);
}

/**
 * Create a new empty cache with the given script hash
 */
export function createEmptyCache(scriptHash: string): PageMetadataCache {
  return {
    version: CACHE_VERSION,
    scriptHash,
    lastSync: new Date().toISOString(),
    pages: {},
  };
}

/**
 * Determine the sync mode based on cache state and script hash.
 *
 * @param currentScriptHash - Hash computed from current script files
 * @param forceRebuild - Whether --force flag was passed
 */
export function determineSyncMode(
  currentScriptHash: string,
  forceRebuild: boolean
): SyncModeResult {
  // Force flag always triggers full rebuild
  if (forceRebuild) {
    return {
      fullRebuild: true,
      reason: "--force flag specified",
      cache: null,
    };
  }

  // Try to load existing cache
  const cache = loadPageMetadataCache();

  // No cache means first run
  if (!cache) {
    return {
      fullRebuild: true,
      reason: "No existing cache found (first run or cache cleared)",
      cache: null,
    };
  }

  // Check if scripts have changed
  if (cache.scriptHash !== currentScriptHash) {
    return {
      fullRebuild: true,
      reason: "Script files have changed since last sync",
      cache: null,
    };
  }

  // Cache is valid and scripts unchanged - can use incremental sync
  return {
    fullRebuild: false,
    reason: "Cache valid, using incremental sync",
    cache,
  };
}

/**
 * Filter pages to only those that need processing.
 * Returns pages that are new or have been edited since last sync.
 *
 * @param pages - All pages from Notion
 * @param cache - Loaded page metadata cache
 */
export function filterChangedPages<
  T extends { id: string; last_edited_time: string },
>(pages: T[], cache: PageMetadataCache | null): T[] {
  if (!cache) {
    return pages; // No cache, process all
  }

  return pages.filter((page) => {
    const cached = cache.pages[page.id];

    // New page - not in cache
    if (!cached) {
      return true;
    }

    // If any expected outputs are missing, force regeneration
    if (hasMissingOutputs(cache, page.id)) {
      return true;
    }

    // Compare timestamps
    const notionTime = new Date(page.last_edited_time).getTime();
    const cachedTime = new Date(cached.lastEdited).getTime();

    // Changed if Notion's edit time is newer
    return notionTime > cachedTime;
  });
}

/**
 * Find pages that were deleted from Notion (exist in cache but not in current pages).
 *
 * @param currentPageIds - Set of page IDs currently in Notion
 * @param cache - Loaded page metadata cache
 * @returns Array of deleted page IDs and their output paths
 */
export function findDeletedPages(
  currentPageIds: Set<string>,
  cache: PageMetadataCache | null
): Array<{ pageId: string; outputPaths: string[] }> {
  if (!cache) {
    return [];
  }

  // Safety guard: an empty currentPageIds set likely means the fetch returned
  // no results (e.g., temporary API failure). Treat this as "no deletions"
  // to avoid wiping all cached pages.
  if (currentPageIds.size === 0) {
    return [];
  }

  const deleted: Array<{ pageId: string; outputPaths: string[] }> = [];

  for (const [pageId, metadata] of Object.entries(cache.pages)) {
    if (!currentPageIds.has(pageId)) {
      deleted.push({
        pageId,
        outputPaths: metadata.outputPaths,
      });
    }
  }

  return deleted;
}

/**
 * Determine whether any cached output files for a page are missing on disk.
 * Missing outputs should trigger regeneration even if the Notion timestamp
 * hasn't changed (e.g., manual deletion or previous failed write).
 *
 * Uses normalizePath for consistent path resolution across different
 * execution environments (CI vs local, different working directories).
 *
 * NOTE: Returns true for empty outputPaths arrays as this indicates
 * the page was cached but no outputs were successfully written.
 */
export function hasMissingOutputs(
  cache: PageMetadataCache | null,
  pageId: string
): boolean {
  if (!cache) {
    return false;
  }

  const cached = cache.pages[pageId];
  if (!cached || !cached.outputPaths) {
    return false;
  }

  // Empty outputPaths means no outputs were written - treat as missing
  if (cached.outputPaths.length === 0) {
    return true;
  }

  return cached.outputPaths.some((outputPath) => {
    if (!outputPath) {
      return true;
    }

    // Use normalizePath for consistent resolution
    const absolutePath = normalizePath(outputPath);
    return !fs.existsSync(absolutePath);
  });
}

/**
 * Update cache with a processed page's metadata.
 * This should be called after successfully processing each page.
 *
 * Paths are normalized before storage to ensure consistent comparison
 * across different execution environments (CI vs local).
 *
 * @param cache - Cache to update (mutated in place)
 * @param pageId - Notion page ID
 * @param lastEdited - Notion's last_edited_time
 * @param outputPaths - Paths to generated files
 */
export function updatePageInCache(
  cache: PageMetadataCache,
  pageId: string,
  lastEdited: string,
  outputPaths: string[],
  containsS3?: boolean
): void {
  const existing = cache.pages[pageId];
  const mergedOutputs = new Set<string>();

  // Existing paths are already normalized from previous runs
  if (existing?.outputPaths?.length) {
    for (const p of existing.outputPaths) {
      if (p) {
        mergedOutputs.add(p);
      }
    }
  }

  // Normalize new paths for consistent storage and comparison
  for (const p of outputPaths) {
    if (p) {
      const normalized = normalizePath(p);
      if (normalized) {
        mergedOutputs.add(normalized);
      }
    }
  }

  const latestLastEdited =
    existing &&
    new Date(existing.lastEdited).getTime() > new Date(lastEdited).getTime()
      ? existing.lastEdited
      : lastEdited;

  cache.pages[pageId] = {
    lastEdited: latestLastEdited,
    outputPaths: Array.from(mergedOutputs),
    processedAt: new Date().toISOString(),
    containsS3,
  };
}

/**
 * Remove a page from the cache (e.g., after deleting orphaned files).
 *
 * @param cache - Cache to update (mutated in place)
 * @param pageId - Notion page ID to remove
 */
export function removePageFromCache(
  cache: PageMetadataCache,
  pageId: string
): void {
  delete cache.pages[pageId];
}

/**
 * Get statistics about the cache
 */
export function getCacheStats(cache: PageMetadataCache | null): {
  totalPages: number;
  lastSync: string | null;
} {
  if (!cache) {
    return {
      totalPages: 0,
      lastSync: null,
    };
  }

  return {
    totalPages: Object.keys(cache.pages).length,
    lastSync: cache.lastSync,
  };
}
