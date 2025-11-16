import chalk from "chalk";

/**
 * LRU Cache implementation with size limit
 * Least Recently Used items are evicted when capacity is reached
 */
export class LRUCache<T> {
  private cache = new Map<string, T>();
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = Math.max(1, maxSize);
  }

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    // Remove if exists (will re-add at end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Validate and parse cache size from environment variable
 *
 * @returns Validated cache size (min: 1, max: 10000, default: 1000)
 */
export function validateCacheSize(): number {
  const defaultSize = 1000;
  const envValue = process.env.NOTION_CACHE_MAX_SIZE;

  if (!envValue) return defaultSize;

  const parsed = Number.parseInt(envValue, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(
      chalk.yellow(
        `⚠️  Invalid NOTION_CACHE_MAX_SIZE: "${envValue}", using default: ${defaultSize}`
      )
    );
    return defaultSize;
  }

  if (parsed > 10000) {
    console.warn(
      chalk.yellow(
        `⚠️  NOTION_CACHE_MAX_SIZE: ${parsed} exceeds maximum 10000, using maximum`
      )
    );
    return 10000;
  }

  return parsed;
}

/**
 * Build a cache key from ID and optional last edited timestamp
 *
 * @param id - The resource ID
 * @param lastEdited - Optional last edited timestamp
 * @returns Cache key string
 */
export const buildCacheKey = (id: string, lastEdited?: string | null): string =>
  `${id}:${lastEdited ?? "unknown"}`;
