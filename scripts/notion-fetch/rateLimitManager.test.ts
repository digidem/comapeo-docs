import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RateLimitManager,
  getRateLimitManager,
  resetRateLimitManager,
} from "./rateLimitManager";

describe("RateLimitManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isRateLimited", () => {
    it("should return false initially", () => {
      const manager = new RateLimitManager();
      expect(manager.isRateLimited()).toBe(false);
    });

    it("should return true during backoff period", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit();

      expect(manager.isRateLimited()).toBe(true);
    });

    it("should return false after backoff period elapses", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit(); // 1 second backoff

      expect(manager.isRateLimited()).toBe(true);

      // Advance time past backoff period
      vi.advanceTimersByTime(1001);

      expect(manager.isRateLimited()).toBe(false);
    });

    it("should clear backoff when checking after period elapsed", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit();

      vi.advanceTimersByTime(1001);
      manager.isRateLimited(); // Should clear backoff

      expect(manager.getCurrentBackoff()).toBe(0);
    });
  });

  describe("getRemainingBackoff", () => {
    it("should return 0 when not rate limited", () => {
      const manager = new RateLimitManager();
      expect(manager.getRemainingBackoff()).toBe(0);
    });

    it("should return remaining time during backoff", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit(); // 1 second backoff

      expect(manager.getRemainingBackoff()).toBe(1000);

      vi.advanceTimersByTime(500);
      expect(manager.getRemainingBackoff()).toBe(500);

      vi.advanceTimersByTime(500);
      expect(manager.getRemainingBackoff()).toBe(0);
    });

    it("should not return negative values", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit();

      vi.advanceTimersByTime(2000);
      expect(manager.getRemainingBackoff()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("recordRateLimit", () => {
    it("should start with 1 second backoff", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit();

      expect(manager.getCurrentBackoff()).toBe(1000);
    });

    it("should use Retry-After header when provided", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit(5); // 5 seconds from header

      expect(manager.getCurrentBackoff()).toBe(5000);
    });

    it("should apply exponential backoff on subsequent hits", () => {
      const manager = new RateLimitManager();

      manager.recordRateLimit(); // 1s
      expect(manager.getCurrentBackoff()).toBe(1000);

      vi.advanceTimersByTime(1001);
      manager.recordRateLimit(); // 2s
      expect(manager.getCurrentBackoff()).toBe(2000);

      vi.advanceTimersByTime(2001);
      manager.recordRateLimit(); // 4s
      expect(manager.getCurrentBackoff()).toBe(4000);

      vi.advanceTimersByTime(4001);
      manager.recordRateLimit(); // 8s
      expect(manager.getCurrentBackoff()).toBe(8000);
    });

    it("should cap backoff at 60 seconds", () => {
      const manager = new RateLimitManager();

      // Simulate many consecutive rate limits
      for (let i = 0; i < 10; i++) {
        manager.recordRateLimit();
        vi.advanceTimersByTime(manager.getCurrentBackoff() + 1);
      }

      expect(manager.getCurrentBackoff()).toBeLessThanOrEqual(60000);
    });

    it("should prefer Retry-After header over exponential backoff", () => {
      const manager = new RateLimitManager();

      manager.recordRateLimit(); // 1s
      vi.advanceTimersByTime(1001);

      manager.recordRateLimit(10); // Header says 10s, ignore exponential 2s
      expect(manager.getCurrentBackoff()).toBe(10000);
    });

    it("should ignore invalid Retry-After values", () => {
      const manager = new RateLimitManager();

      manager.recordRateLimit(-5); // Invalid negative
      expect(manager.getCurrentBackoff()).toBe(1000); // Should use default

      vi.advanceTimersByTime(1001);
      manager.recordRateLimit(0); // Invalid zero
      expect(manager.getCurrentBackoff()).toBe(2000); // Should use exponential
    });

    it("should log warning when rate limit is hit", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const manager = new RateLimitManager();

      manager.recordRateLimit();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Rate limit hit")
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1.0s"));

      consoleSpy.mockRestore();
    });
  });

  describe("waitForBackoff", () => {
    it("should resolve immediately when not rate limited", async () => {
      const manager = new RateLimitManager();

      const promise = manager.waitForBackoff();
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBeUndefined();
    });

    it("should wait for backoff period to elapse", async () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit(); // 1s backoff

      const promise = manager.waitForBackoff();

      // Should not resolve immediately
      await vi.advanceTimersByTimeAsync(500);
      let resolved = false;
      promise
        .then(() => {
          resolved = true;
          return undefined;
        })
        .catch(() => {
          // Ignore errors in this check
        });
      await Promise.resolve(); // Flush microtasks
      expect(resolved).toBe(false);

      // Should resolve after full backoff
      await vi.advanceTimersByTimeAsync(500);
      await promise;
      expect(resolved).toBe(true);
    });

    it("should log when waiting for backoff", async () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const manager = new RateLimitManager();
      manager.recordRateLimit(2); // 2s backoff

      const promise = manager.waitForBackoff();
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Waiting")
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("2.0s"));

      consoleSpy.mockRestore();
    });
  });

  describe("reset", () => {
    it("should clear all rate limit state", () => {
      const manager = new RateLimitManager();
      manager.recordRateLimit();

      expect(manager.isRateLimited()).toBe(true);
      expect(manager.getCurrentBackoff()).toBe(1000);

      manager.reset();

      expect(manager.isRateLimited()).toBe(false);
      expect(manager.getCurrentBackoff()).toBe(0);
      expect(manager.getRemainingBackoff()).toBe(0);
    });
  });

  describe("getCurrentBackoff", () => {
    it("should return current backoff duration", () => {
      const manager = new RateLimitManager();

      expect(manager.getCurrentBackoff()).toBe(0);

      manager.recordRateLimit();
      expect(manager.getCurrentBackoff()).toBe(1000);

      vi.advanceTimersByTime(1001);
      manager.recordRateLimit();
      expect(manager.getCurrentBackoff()).toBe(2000);
    });
  });

  describe("global singleton", () => {
    afterEach(() => {
      resetRateLimitManager();
    });

    it("should return same instance on multiple calls", () => {
      const manager1 = getRateLimitManager();
      const manager2 = getRateLimitManager();

      expect(manager1).toBe(manager2);
    });

    it("should maintain state across calls", () => {
      const manager1 = getRateLimitManager();
      manager1.recordRateLimit();

      const manager2 = getRateLimitManager();
      expect(manager2.isRateLimited()).toBe(true);
    });

    it("should reset global instance", () => {
      const manager = getRateLimitManager();
      manager.recordRateLimit();

      expect(manager.isRateLimited()).toBe(true);

      resetRateLimitManager();

      expect(manager.isRateLimited()).toBe(false);
    });
  });

  describe("real-world scenarios", () => {
    it("should handle burst of rate limits with exponential backoff", () => {
      const manager = new RateLimitManager();

      // First hit
      manager.recordRateLimit();
      expect(manager.getCurrentBackoff()).toBe(1000);
      expect(manager.isRateLimited()).toBe(true);

      // Wait and hit again
      vi.advanceTimersByTime(1001);
      manager.recordRateLimit();
      expect(manager.getCurrentBackoff()).toBe(2000);

      // Wait and hit again
      vi.advanceTimersByTime(2001);
      manager.recordRateLimit();
      expect(manager.getCurrentBackoff()).toBe(4000);

      // All should respect rate limit
      expect(manager.isRateLimited()).toBe(true);
    });

    it("should handle Retry-After header correctly", () => {
      const manager = new RateLimitManager();

      // Notion API returns 429 with Retry-After: 30
      manager.recordRateLimit(30);
      expect(manager.getCurrentBackoff()).toBe(30000);
      expect(manager.getRemainingBackoff()).toBe(30000);

      // After 15 seconds
      vi.advanceTimersByTime(15000);
      expect(manager.getRemainingBackoff()).toBe(15000);
      expect(manager.isRateLimited()).toBe(true);

      // After full 30 seconds
      vi.advanceTimersByTime(15000);
      expect(manager.isRateLimited()).toBe(false);
    });

    it("should handle recovery after rate limit period", () => {
      const manager = new RateLimitManager();

      // Hit rate limit
      manager.recordRateLimit();
      expect(manager.isRateLimited()).toBe(true);

      // Wait for recovery
      vi.advanceTimersByTime(1001);
      expect(manager.isRateLimited()).toBe(false);

      // After successful recovery, backoff should reset to initial value
      // This allows the system to recover gracefully
      vi.advanceTimersByTime(10000); // Wait longer
      manager.recordRateLimit();
      // After recovery, should reset to initial backoff (1s)
      expect(manager.getCurrentBackoff()).toBe(1000);
    });
  });
});
