import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withTimeout,
  withTimeoutFallback,
  processBatch,
  TimeoutError,
} from "./timeoutUtils";

describe("timeoutUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("withTimeout", () => {
    it("should resolve with value when promise completes before timeout", async () => {
      const promise = Promise.resolve("success");
      const resultPromise = withTimeout(promise, 1000, "test operation");

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe("success");
    });

    it("should reject with TimeoutError when promise exceeds timeout", async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve("too slow"), 2000);
      });

      const resultPromise = withTimeout(promise, 1000, "slow operation");

      await vi.advanceTimersByTimeAsync(1001);

      await expect(resultPromise).rejects.toThrow(TimeoutError);
      await expect(resultPromise).rejects.toThrow(
        'Operation "slow operation" timed out after 1000ms'
      );
    });

    it("should include operation name in TimeoutError", async () => {
      const promise = new Promise(() => {
        /* never resolves */
      });
      const resultPromise = withTimeout(promise, 500, "critical task");

      await vi.advanceTimersByTimeAsync(501);

      await expect(resultPromise).rejects.toMatchObject({
        name: "TimeoutError",
        operation: "critical task",
      });
    });

    it("should clear timeout when promise resolves", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const promise = Promise.resolve("quick");

      await withTimeout(promise, 5000, "test");
      await vi.runAllTimersAsync();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should clear timeout when promise rejects", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const promise = Promise.reject(new Error("failed"));

      const resultPromise = withTimeout(promise, 5000, "test");
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow("failed");
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should propagate original error when promise rejects before timeout", async () => {
      const originalError = new Error("original failure");
      const promise = Promise.reject(originalError);

      const resultPromise = withTimeout(promise, 5000, "test");
      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow(originalError);
    });
  });

  describe("withTimeoutFallback", () => {
    it("should return result when promise completes before timeout", async () => {
      const promise = Promise.resolve("success");
      const resultPromise = withTimeoutFallback(
        promise,
        1000,
        "fallback",
        "test operation"
      );

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe("success");
    });

    it("should return fallback when promise times out", async () => {
      const promise = new Promise(() => {
        /* never resolves */
      });
      const resultPromise = withTimeoutFallback(
        promise,
        1000,
        "fallback value",
        "slow operation"
      );

      await vi.advanceTimersByTimeAsync(1001);
      const result = await resultPromise;

      expect(result).toBe("fallback value");
    });

    it("should log warning when timeout occurs", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();
      const promise = new Promise(() => {
        /* never resolves */
      });

      const resultPromise = withTimeoutFallback(
        promise,
        500,
        "fallback",
        "image processing"
      );

      await vi.advanceTimersByTimeAsync(501);
      await resultPromise;

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("image processing timed out after 500ms")
      );
    });

    it("should throw non-timeout errors", async () => {
      const error = new Error("network failure");
      const promise = Promise.reject(error);

      const resultPromise = withTimeoutFallback(
        promise,
        1000,
        "fallback",
        "test"
      );

      await vi.runAllTimersAsync();

      await expect(resultPromise).rejects.toThrow("network failure");
    });

    it("should support complex fallback types", async () => {
      const fallbackObject = { status: "failed", data: null };
      const promise = new Promise(() => {
        /* never resolves */
      });

      const resultPromise = withTimeoutFallback(
        promise,
        100,
        fallbackObject,
        "api call"
      );

      await vi.advanceTimersByTimeAsync(101);
      const result = await resultPromise;

      expect(result).toEqual(fallbackObject);
    });
  });

  describe("processBatch", () => {
    it("should process items in batches respecting maxConcurrent", async () => {
      const items = [1, 2, 3, 4, 5];
      const processingOrder: number[] = [];
      const activeCount = { current: 0, max: 0 };

      const processor = async (item: number) => {
        activeCount.current++;
        activeCount.max = Math.max(activeCount.max, activeCount.current);
        processingOrder.push(item);

        await new Promise((resolve) => setTimeout(resolve, 10));

        activeCount.current--;
        return item * 2;
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 2,
      });

      await vi.runAllTimersAsync();
      const results = await resultPromise;

      expect(activeCount.max).toBeLessThanOrEqual(2);
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    });

    it("should apply timeout to each item when configured", async () => {
      const items = [1, 2, 3];
      const processor = async (item: number) => {
        if (item === 2) {
          // Item 2 takes too long
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return item;
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 3,
        timeoutMs: 1000,
        operation: "processing",
      });

      await vi.advanceTimersByTimeAsync(1001);
      const results = await resultPromise;

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(results[2].status).toBe("fulfilled");

      if (results[1].status === "rejected") {
        expect(results[1].reason).toBeInstanceOf(TimeoutError);
      }
    });

    it("should handle all items failing", async () => {
      const items = [1, 2, 3];
      const processor = async () => {
        throw new Error("processing failed");
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 2,
      });

      await vi.runAllTimersAsync();
      const results = await resultPromise;

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === "rejected")).toBe(true);
    });

    it("should handle mixed success and failure", async () => {
      const items = [1, 2, 3, 4];
      const processor = async (item: number) => {
        if (item % 2 === 0) {
          throw new Error(`Item ${item} failed`);
        }
        return item * 2;
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 2,
      });

      await vi.runAllTimersAsync();
      const results = await resultPromise;

      expect(results).toHaveLength(4);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(results[2].status).toBe("fulfilled");
      expect(results[3].status).toBe("rejected");
    });

    it("should process empty array", async () => {
      const processor = vi.fn();
      const results = await processBatch([], processor, { maxConcurrent: 3 });

      expect(results).toHaveLength(0);
      expect(processor).not.toHaveBeenCalled();
    });

    it("should provide correct index to processor", async () => {
      const items = ["a", "b", "c"];
      const indices: number[] = [];

      const processor = async (_item: string, index: number) => {
        indices.push(index);
        return index;
      };

      await processBatch(items, processor, { maxConcurrent: 2 });
      await vi.runAllTimersAsync();

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should handle batch size larger than array", async () => {
      const items = [1, 2];
      const processor = async (item: number) => item * 2;

      const results = await processBatch(items, processor, {
        maxConcurrent: 10,
      });

      await vi.runAllTimersAsync();

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    });

    it("should process without timeout when not configured", async () => {
      const items = [1, 2, 3];
      const processor = async (item: number) => {
        // All items take a long time but should still complete
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return item;
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 2,
        // No timeoutMs configured
      });

      await vi.advanceTimersByTimeAsync(10000);
      const results = await resultPromise;

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    });
  });

  describe("TimeoutError", () => {
    it("should create error with correct properties", () => {
      const error = new TimeoutError("Test timeout", "test-op");

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("TimeoutError");
      expect(error.message).toBe("Test timeout");
      expect(error.operation).toBe("test-op");
    });

    it("should be catchable as TimeoutError", async () => {
      const promise = new Promise(() => {
        /* never resolves */
      });

      const resultPromise = withTimeout(promise, 100, "test");

      await vi.advanceTimersByTimeAsync(101);

      try {
        await resultPromise;
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        if (error instanceof TimeoutError) {
          expect(error.operation).toBe("test");
        }
      }
    });
  });
});
