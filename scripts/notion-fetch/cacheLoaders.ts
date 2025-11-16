/**
 * Cache loading utilities for Notion data fetching
 *
 * Provides generic caching infrastructure with:
 * - LRU prefetch cache integration
 * - In-flight request deduplication
 * - Cache hit/miss tracking
 * - Progress logging
 */

import chalk from "chalk";
import type { LRUCache } from "./cacheStrategies";
import { buildCacheKey } from "./cacheStrategies";
import { fetchNotionBlocks } from "../fetchNotionData";
import { n2m } from "../notionClient";

/**
 * Logs progress for data fetching operations
 * Throttles output to reduce noise: logs at index 0, last item, and every 10th item
 */
export function logProgress(
  index: number,
  total: number,
  prefix: string,
  title: string
): void {
  if (
    total > 0 &&
    (index === 0 ||
      index === total - 1 ||
      ((index + 1) % 10 === 0 && index + 1 < total))
  ) {
    console.log(
      chalk.gray(`    ${prefix} ${index + 1}/${total} for "${title}"`)
    );
  }
}

/**
 * Generic cache loader configuration
 */
export interface CacheLoaderConfig<T> {
  /** Main map cache for storing fetched data */
  mainMap: Map<string, { key: string; data: T }>;
  /** LRU prefetch cache */
  prefetchCache: LRUCache<T>;
  /** Tracks in-flight requests to prevent duplicate fetches */
  inFlightMap: Map<string, Promise<T>>;
  /** Counter for cache hits */
  cacheHits: { value: number };
  /** Counter for fetch operations */
  fetchCount: { value: number };
  /** Function to fetch data when not cached */
  fetchFn: (pageId: string) => Promise<T>;
  /** Normalizes fetched data to expected type */
  normalizeResult: (result: any) => T;
  /** Prefix for progress log messages */
  logPrefix: string;
}

/**
 * Generic cache loader that handles:
 * 1. Main map cache lookup
 * 2. Prefetch cache lookup
 * 3. In-flight request deduplication
 * 4. Cache hit/miss tracking
 *
 * @returns Object with fetched/cached data and source indicator
 */
export async function loadWithCache<T>(
  pageRecord: Record<string, any>,
  pageIndex: number,
  totalCount: number,
  title: string,
  config: CacheLoaderConfig<T>
): Promise<{ data: T; source: "cache" | "fetched" }> {
  const pageId = pageRecord?.id;
  if (!pageId) {
    return { data: config.normalizeResult([]), source: "cache" };
  }

  const cacheKey = buildCacheKey(pageId, pageRecord?.last_edited_time);

  // Check main map cache
  const existing = config.mainMap.get(pageId);
  if (existing && existing.key === cacheKey) {
    config.cacheHits.value += 1;
    return { data: existing.data, source: "cache" };
  }

  // Check prefetch cache
  if (config.prefetchCache.has(cacheKey)) {
    config.cacheHits.value += 1;
    const cached = config.prefetchCache.get(cacheKey);
    const normalized = config.normalizeResult(cached);
    config.mainMap.set(pageId, { key: cacheKey, data: normalized });
    return { data: normalized, source: "cache" };
  }

  // Check in-flight requests or start new fetch
  let inFlight = config.inFlightMap.get(cacheKey);
  if (!inFlight) {
    config.fetchCount.value += 1;
    logProgress(pageIndex, totalCount, config.logPrefix, title);
    inFlight = (async () => {
      const result = await config.fetchFn(pageId);
      const normalized = config.normalizeResult(result);
      config.prefetchCache.set(cacheKey, normalized);
      return normalized;
    })()
      .catch((error) => {
        config.prefetchCache.delete(cacheKey);
        throw error;
      })
      .finally(() => {
        config.inFlightMap.delete(cacheKey);
      });
    config.inFlightMap.set(cacheKey, inFlight);
  }

  const result = await inFlight;
  const normalized = config.normalizeResult(result);
  config.mainMap.set(pageId, { key: cacheKey, data: normalized });
  return { data: normalized, source: "fetched" };
}

/**
 * Specialized loader for fetching raw Notion blocks with caching
 */
export async function loadBlocksForPage(
  pageRecord: Record<string, any>,
  pageIndex: number,
  totalCount: number,
  title: string,
  blocksMap: Map<string, { key: string; data: any[] }>,
  blockPrefetchCache: LRUCache<any[]>,
  inFlightBlockFetches: Map<string, Promise<any[]>>,
  blockCacheHits: { value: number },
  blockFetchCount: { value: number }
): Promise<{ data: any[]; source: "cache" | "fetched" }> {
  return loadWithCache<any[]>(pageRecord, pageIndex, totalCount, title, {
    mainMap: blocksMap,
    prefetchCache: blockPrefetchCache,
    inFlightMap: inFlightBlockFetches,
    cacheHits: blockCacheHits,
    fetchCount: blockFetchCount,
    fetchFn: fetchNotionBlocks,
    normalizeResult: (result) => (Array.isArray(result) ? result : []),
    logPrefix: "Fetching blocks",
  });
}

/**
 * Specialized loader for fetching markdown from Notion pages with caching
 */
export async function loadMarkdownForPage(
  pageRecord: Record<string, any>,
  pageIndex: number,
  totalCount: number,
  title: string,
  markdownMap: Map<string, { key: string; data: any }>,
  markdownPrefetchCache: LRUCache<any>,
  inFlightMarkdownFetches: Map<string, Promise<any>>,
  markdownCacheHits: { value: number },
  markdownFetchCount: { value: number }
): Promise<{ data: any; source: "cache" | "fetched" }> {
  return loadWithCache<any>(pageRecord, pageIndex, totalCount, title, {
    mainMap: markdownMap,
    prefetchCache: markdownPrefetchCache,
    inFlightMap: inFlightMarkdownFetches,
    cacheHits: markdownCacheHits,
    fetchCount: markdownFetchCount,
    fetchFn: (pageId) => n2m.pageToMarkdown(pageId),
    normalizeResult: (result) =>
      Array.isArray(result) ? result : (result ?? []),
    logPrefix: "Converting markdown",
  });
}
