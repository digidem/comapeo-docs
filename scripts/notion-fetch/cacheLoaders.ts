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

import { isUrlExpiringSoon } from "./imageReplacer";

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
  /** Optional validator for fetched data. Returns true if valid. */
  validateResult?: (result: T) => boolean;
  /** Prefix for progress log messages */
  logPrefix: string;
}

/**
 * Helper to check if data contains expiring S3 URLs using recursive traversal
 * Avoids JSON.stringify overhead and regex DoS risks
 */
export function containsExpiringUrls(
  data: any,
  visited = new WeakSet()
): boolean {
  if (data === null || data === undefined) {
    return false;
  }

  // Check strings directly
  if (typeof data === "string") {
    return isUrlExpiringSoon(data);
  }

  // Skip non-objects
  if (typeof data !== "object") {
    return false;
  }

  // Handle circular references
  if (visited.has(data)) {
    return false;
  }
  visited.add(data);

  // Traverse Maps
  if (data instanceof Map) {
    for (const value of data.values()) {
      if (containsExpiringUrls(value, visited)) {
        return true;
      }
    }
    return false;
  }

  // Traverse Sets
  if (data instanceof Set) {
    for (const value of data.values()) {
      if (containsExpiringUrls(value, visited)) {
        return true;
      }
    }
    return false;
  }

  // Traverse arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      if (containsExpiringUrls(item, visited)) {
        return true;
      }
    }
    return false;
  }

  // Traverse object values
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (containsExpiringUrls(data[key], visited)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generic cache loader that handles:
 * 1. Main map cache lookup
 * 2. Prefetch cache lookup
 * 3. In-flight request deduplication
 * 4. Cache hit/miss tracking
 * 5. Validation and retry for fresh content
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
    // Data is already normalized when stored in prefetchCache (line 108)
    config.mainMap.set(pageId, { key: cacheKey, data: cached });
    return { data: cached, source: "cache" };
  }

  // Check in-flight requests or start new fetch
  let inFlight = config.inFlightMap.get(cacheKey);
  if (!inFlight) {
    config.fetchCount.value += 1;
    logProgress(pageIndex, totalCount, config.logPrefix, title);
    inFlight = (async () => {
      let attempts = 0;
      const MAX_ATTEMPTS = 3;
      let lastNormalized: T | null = null;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const result = await config.fetchFn(pageId);
          const normalized = config.normalizeResult(result);
          lastNormalized = normalized;

          if (config.validateResult) {
            const isValid = config.validateResult(normalized);
            if (!isValid) {
              if (attempts === MAX_ATTEMPTS) {
                console.warn(
                  chalk.yellow(
                    `    ⚠️  Content validation failed for "${title}" after ${MAX_ATTEMPTS} attempts; using latest result.`
                  )
                );
                config.prefetchCache.set(cacheKey, normalized);
                return normalized;
              }

              const delay = attempts * 1000; // Linear backoff: 1s, 2s
              console.warn(
                chalk.yellow(
                  `    ⚠️  Content validation failed for "${title}" (attempt ${attempts}/${MAX_ATTEMPTS}), retrying in ${delay}ms...`
                )
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          }

          // Validation passed
          config.prefetchCache.set(cacheKey, normalized);
          return normalized;
        } catch (error) {
          // If it was our validation error, just propagate it if we are out of retries
          // But if it was a fetch error, we might want to retry that too?
          // The current logic places the retry loop AROUND the fetch+validate.
          // So if fetch throws, we also want to separate network retry from validation retry?
          // Standard fetchFn likely has its own retries (notionClient.ts usually does).
          // Assuming fetchFn throws on permanent failure.
          // We will re-throw fetch errors immediately unless we want to use this loop for fetch retries too.
          // The previous code re-threw unexpected errors.
          // However, we want to respect the 'continue' for validation failures.

          // If strict validation error thrown above:
          if (
            error instanceof Error &&
            error.message.includes("Content validation failed")
          ) {
            throw error;
          }

          // If fetch error, we let it bubble up (assuming fetchFn manages its own resiliency usually,
          // OR if we want to use this loop for generic retries, we could 'continue' here too.
          // But instructions were specific about validation retry.
          throw error;
        }
      }

      throw new Error("Unexpected end of retry loop");
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
  // Result is already normalized by the inFlight promise
  config.mainMap.set(pageId, { key: cacheKey, data: result });
  return { data: result, source: "fetched" };
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
    validateResult: (blocks) => !containsExpiringUrls(blocks),
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
    validateResult: (markdown) => !containsExpiringUrls(markdown),
    logPrefix: "Converting markdown",
  });
}
