import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectOptimalConcurrency,
  getResourceSummary,
  ResourceManager,
  getResourceManager,
  resetResourceManager,
  type ResourceProvider,
} from "./resourceManager";

describe("resourceManager", () => {
  const originalEnv = process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    delete process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE;
    resetResourceManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv) {
      process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE = originalEnv;
    } else {
      delete process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE;
    }
  });

  describe("detectOptimalConcurrency", () => {
    it("should respect minimum concurrency limits", () => {
      const lowResourceProvider: ResourceProvider = {
        getCpuCores: () => 1,
        getFreeMemoryGB: () => 0.1,
        getTotalMemoryGB: () => 1,
      };

      // Even with low resources, should not go below minimum
      expect(detectOptimalConcurrency("images", lowResourceProvider)).toBe(3);
      expect(detectOptimalConcurrency("pages", lowResourceProvider)).toBe(3);
      expect(detectOptimalConcurrency("blocks", lowResourceProvider)).toBe(5);
    });

    it("should respect maximum concurrency limits", () => {
      const highResourceProvider: ResourceProvider = {
        getCpuCores: () => 64,
        getFreeMemoryGB: () => 128,
        getTotalMemoryGB: () => 256,
      };

      // Even with high resources, should not go above maximum
      expect(detectOptimalConcurrency("images", highResourceProvider)).toBe(10);
      expect(detectOptimalConcurrency("pages", highResourceProvider)).toBe(15);
      expect(detectOptimalConcurrency("blocks", highResourceProvider)).toBe(30);
    });

    it("should calculate based on memory", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 16,
        getFreeMemoryGB: () => 4, // 4GB free
        getTotalMemoryGB: () => 16,
      };

      // Images: 4 * 0.7 / 0.5 = 5.6 -> 5 (clamped between 3 and 10)
      expect(detectOptimalConcurrency("images", provider)).toBe(5);
    });

    it("should calculate based on CPU cores", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 4, // Low CPU count will limit
        getFreeMemoryGB: () => 32,
        getTotalMemoryGB: () => 64,
      };

      // 4 * 0.75 = 3 (CPU limited)
      expect(detectOptimalConcurrency("images", provider)).toBe(3);
    });

    it("should use environment override when set", () => {
      process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE = "images:7,pages:12";

      const provider: ResourceProvider = {
        getCpuCores: () => 2,
        getFreeMemoryGB: () => 1,
        getTotalMemoryGB: () => 4,
      };

      expect(detectOptimalConcurrency("images", provider)).toBe(7);
      expect(detectOptimalConcurrency("pages", provider)).toBe(12);
      // blocks not overridden, should use calculated value
      expect(
        detectOptimalConcurrency("blocks", provider)
      ).toBeGreaterThanOrEqual(5);
    });

    it("should handle invalid environment override", () => {
      process.env.NOTION_FETCH_CONCURRENCY_OVERRIDE = "images:invalid";

      const provider: ResourceProvider = {
        getCpuCores: () => 8,
        getFreeMemoryGB: () => 8,
        getTotalMemoryGB: () => 16,
      };

      // Should fall back to calculated value
      expect(
        detectOptimalConcurrency("images", provider)
      ).toBeGreaterThanOrEqual(3);
    });
  });

  describe("getResourceSummary", () => {
    it("should return formatted resource summary", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 8,
        getFreeMemoryGB: () => 7.5,
        getTotalMemoryGB: () => 16,
      };

      const summary = getResourceSummary(provider);
      expect(summary).toContain("8 CPU cores");
      expect(summary).toContain("7.5");
      expect(summary).toContain("16.0");
    });
  });

  describe("ResourceManager", () => {
    it("should get concurrency for operation types", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 8,
        getFreeMemoryGB: () => 8,
        getTotalMemoryGB: () => 16,
      };

      const manager = new ResourceManager(provider);

      expect(manager.getConcurrency("images")).toBeGreaterThanOrEqual(3);
      expect(manager.getConcurrency("pages")).toBeGreaterThanOrEqual(3);
      expect(manager.getConcurrency("blocks")).toBeGreaterThanOrEqual(5);
    });

    it("should apply rate limit multiplier", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 8,
        getFreeMemoryGB: () => 8,
        getTotalMemoryGB: () => 16,
      };

      const manager = new ResourceManager(provider);
      const baseConcurrency = manager.getConcurrency("images");

      manager.setRateLimitMultiplier(0.5);
      const reducedConcurrency = manager.getConcurrency("images");

      expect(reducedConcurrency).toBeLessThanOrEqual(
        Math.ceil(baseConcurrency * 0.5)
      );
      expect(reducedConcurrency).toBeGreaterThanOrEqual(1);
    });

    it("should reset rate limit multiplier", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 8,
        getFreeMemoryGB: () => 8,
        getTotalMemoryGB: () => 16,
      };

      const manager = new ResourceManager(provider);
      const baseConcurrency = manager.getConcurrency("images");

      manager.setRateLimitMultiplier(0.5);
      manager.resetRateLimitMultiplier();

      expect(manager.getConcurrency("images")).toBe(baseConcurrency);
    });

    it("should clamp rate limit multiplier", () => {
      const manager = new ResourceManager();

      manager.setRateLimitMultiplier(2.0);
      expect(manager.getRateLimitMultiplier()).toBe(1.0);

      manager.setRateLimitMultiplier(0.01);
      expect(manager.getRateLimitMultiplier()).toBe(0.1);
    });

    it("should return resource summary", () => {
      const provider: ResourceProvider = {
        getCpuCores: () => 4,
        getFreeMemoryGB: () => 4,
        getTotalMemoryGB: () => 8,
      };

      const manager = new ResourceManager(provider);
      const summary = manager.getSummary();

      expect(summary).toContain("4 CPU cores");
    });
  });

  describe("global instance", () => {
    it("should return same instance", () => {
      const manager1 = getResourceManager();
      const manager2 = getResourceManager();

      expect(manager1).toBe(manager2);
    });

    it("should reset correctly", () => {
      const manager1 = getResourceManager();
      resetResourceManager();
      const manager2 = getResourceManager();

      expect(manager1).not.toBe(manager2);
    });
  });
});
