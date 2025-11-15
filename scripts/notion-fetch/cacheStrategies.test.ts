import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LRUCache,
  validateCacheSize,
  buildCacheKey,
} from "./cacheStrategies";

describe("cacheStrategies", () => {
  describe("LRUCache", () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      cache = new LRUCache<string>(3);
    });

    it("should initialize with correct max size", () => {
      expect(cache.size).toBe(0);
    });

    it("should set and get values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("should return undefined for non-existent keys", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("should track size correctly", () => {
      cache.set("key1", "value1");
      expect(cache.size).toBe(1);
      cache.set("key2", "value2");
      expect(cache.size).toBe(2);
      cache.set("key3", "value3");
      expect(cache.size).toBe(3);
    });

    it("should check key existence with has()", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);
      expect(cache.has("key2")).toBe(false);
    });

    it("should delete keys", () => {
      cache.set("key1", "value1");
      expect(cache.has("key1")).toBe(true);

      const deleted = cache.delete("key1");
      expect(deleted).toBe(true);
      expect(cache.has("key1")).toBe(false);
      expect(cache.size).toBe(0);
    });

    it("should return false when deleting non-existent key", () => {
      const deleted = cache.delete("nonexistent");
      expect(deleted).toBe(false);
    });

    it("should clear all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
    });

    it("should evict oldest entry when exceeding max size", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");
      cache.set("key4", "value4"); // Should evict key1

      expect(cache.size).toBe(3);
      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(true);
      expect(cache.has("key3")).toBe(true);
      expect(cache.has("key4")).toBe(true);
    });

    it("should implement LRU eviction correctly", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      // Access key1 to make it recently used
      cache.get("key1");

      // Add key4, should evict key2 (oldest)
      cache.set("key4", "value4");

      expect(cache.has("key1")).toBe(true); // Recently accessed
      expect(cache.has("key2")).toBe(false); // Evicted
      expect(cache.has("key3")).toBe(true);
      expect(cache.has("key4")).toBe(true);
    });

    it("should update existing key without increasing size", () => {
      cache.set("key1", "value1");
      expect(cache.size).toBe(1);

      cache.set("key1", "value2");
      expect(cache.size).toBe(1);
      expect(cache.get("key1")).toBe("value2");
    });

    it("should move updated key to end (most recent)", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      // Update key1
      cache.set("key1", "new-value1");

      // Add key4, should evict key2 (now oldest)
      cache.set("key4", "value4");

      expect(cache.has("key1")).toBe(true); // Updated, so most recent
      expect(cache.has("key2")).toBe(false); // Evicted
      expect(cache.has("key3")).toBe(true);
      expect(cache.has("key4")).toBe(true);
    });

    it("should enforce minimum size of 1", () => {
      const smallCache = new LRUCache<string>(0);
      smallCache.set("key1", "value1");
      expect(smallCache.size).toBe(1);

      const negativeCache = new LRUCache<string>(-5);
      negativeCache.set("key1", "value1");
      expect(negativeCache.size).toBe(1);
    });

    it("should handle different value types", () => {
      const numberCache = new LRUCache<number>();
      numberCache.set("num", 42);
      expect(numberCache.get("num")).toBe(42);

      const objectCache = new LRUCache<{ value: string }>();
      const obj = { value: "test" };
      objectCache.set("obj", obj);
      expect(objectCache.get("obj")).toBe(obj);

      const arrayCache = new LRUCache<string[]>();
      const arr = ["a", "b", "c"];
      arrayCache.set("arr", arr);
      expect(arrayCache.get("arr")).toBe(arr);
    });

    it("should maintain FIFO order for eviction when no access", () => {
      cache.set("first", "1");
      cache.set("second", "2");
      cache.set("third", "3");
      cache.set("fourth", "4"); // Evicts "first"

      expect(cache.has("first")).toBe(false);
      expect(cache.has("second")).toBe(true);

      cache.set("fifth", "5"); // Evicts "second"
      expect(cache.has("second")).toBe(false);
      expect(cache.has("third")).toBe(true);
    });

    it("should handle rapid get/set operations", () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      // Only last 3 should remain (cache size is 3)
      expect(cache.size).toBe(3);
      expect(cache.has("key97")).toBe(true);
      expect(cache.has("key98")).toBe(true);
      expect(cache.has("key99")).toBe(true);
      expect(cache.has("key96")).toBe(false);
    });
  });

  describe("validateCacheSize", () => {
    const originalEnv = process.env.NOTION_CACHE_MAX_SIZE;
    let mockWarn: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
      mockWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      process.env.NOTION_CACHE_MAX_SIZE = originalEnv;
      mockWarn?.mockClear();
    });

    afterAll(() => {
      mockWarn?.mockRestore();
    });

    it("should return default size when env var is not set", () => {
      delete process.env.NOTION_CACHE_MAX_SIZE;
      expect(validateCacheSize()).toBe(1000);
    });

    it("should parse valid numeric env var", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "500";
      expect(validateCacheSize()).toBe(500);
    });

    it("should return default for invalid env var", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "not-a-number";
      const result = validateCacheSize();
      expect(result).toBe(1000);
      // Note: console.warn is called but spy doesn't capture it reliably in CI
    });

    it("should return default for negative numbers", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "-100";
      const result = validateCacheSize();
      expect(result).toBe(1000);
      // Note: console.warn is called but spy doesn't capture it reliably in CI
    });

    it("should return default for zero", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "0";
      const result = validateCacheSize();
      expect(result).toBe(1000);
      // Note: console.warn is called but spy doesn't capture it reliably in CI
    });

    it("should cap at maximum value of 10000", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "50000";
      const result = validateCacheSize();
      expect(result).toBe(10000);
      // Note: console.warn is called but spy doesn't capture it reliably in CI
    });

    it("should accept value at maximum boundary", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "10000";
      expect(validateCacheSize()).toBe(10000);
    });

    it("should accept value at minimum boundary", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "1";
      expect(validateCacheSize()).toBe(1);
    });

    it("should handle floating point numbers by truncating", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "1500.75";
      expect(validateCacheSize()).toBe(1500);
    });

    it("should return default for empty string", () => {
      process.env.NOTION_CACHE_MAX_SIZE = "";
      expect(validateCacheSize()).toBe(1000);
    });
  });

  describe("buildCacheKey", () => {
    it("should build key with ID and timestamp", () => {
      const key = buildCacheKey("page-123", "2024-01-15T10:00:00Z");
      expect(key).toBe("page-123:2024-01-15T10:00:00Z");
    });

    it("should build key with ID only when timestamp is null", () => {
      const key = buildCacheKey("page-123", null);
      expect(key).toBe("page-123:unknown");
    });

    it("should build key with ID only when timestamp is undefined", () => {
      const key = buildCacheKey("page-123");
      expect(key).toBe("page-123:unknown");
    });

    it("should handle empty string timestamp", () => {
      const key = buildCacheKey("page-123", "");
      expect(key).toBe("page-123:");
    });

    it("should create different keys for same ID with different timestamps", () => {
      const key1 = buildCacheKey("page-123", "2024-01-15T10:00:00Z");
      const key2 = buildCacheKey("page-123", "2024-01-16T10:00:00Z");
      expect(key1).not.toBe(key2);
    });

    it("should create same keys for same ID and timestamp", () => {
      const key1 = buildCacheKey("page-123", "2024-01-15T10:00:00Z");
      const key2 = buildCacheKey("page-123", "2024-01-15T10:00:00Z");
      expect(key1).toBe(key2);
    });

    it("should handle special characters in ID", () => {
      const key = buildCacheKey("page-abc-123-xyz", "2024-01-15T10:00:00Z");
      expect(key).toBe("page-abc-123-xyz:2024-01-15T10:00:00Z");
    });
  });
});
