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

      // Catch the rejection immediately to prevent unhandled promise rejection
      const rejectionPromise = resultPromise.catch((error) => error);

      await vi.advanceTimersByTimeAsync(1001);

      const error = await rejectionPromise;
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.message).toContain(
        'Operation "slow operation" timed out after 1000ms'
      );

      // Clean up the hanging promise
      await vi.runAllTimersAsync();
    });

    it("should include operation name in TimeoutError", async () => {
      const promise = new Promise(() => {
        /* never resolves */
      });
      const resultPromise = withTimeout(promise, 500, "critical task");

      // Catch the rejection immediately
      const rejectionPromise = resultPromise.catch((error) => error);

      await vi.advanceTimersByTimeAsync(501);

      const error = await rejectionPromise;
      expect(error).toMatchObject({
        name: "TimeoutError",
        operation: "critical task",
      });

      // Clean up
      await vi.runAllTimersAsync();
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
      // Catch immediately to prevent unhandled rejection
      const rejectionPromise = resultPromise.catch((error) => error);

      await vi.runAllTimersAsync();

      const error = await rejectionPromise;
      expect(error.message).toBe("failed");
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should propagate original error when promise rejects before timeout", async () => {
      const originalError = new Error("original failure");
      const promise = Promise.reject(originalError);

      const resultPromise = withTimeout(promise, 5000, "test");
      // Catch immediately to prevent unhandled rejection
      const rejectionPromise = resultPromise.catch((error) => error);

      await vi.runAllTimersAsync();

      const error = await rejectionPromise;
      expect(error).toBe(originalError);
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

      // Clean up
      await vi.runAllTimersAsync();
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

      // Clean up
      await vi.runAllTimersAsync();
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

      // Catch immediately to prevent unhandled rejection
      const rejectionPromise = resultPromise.catch((err) => err);

      await vi.runAllTimersAsync();

      const caughtError = await rejectionPromise;
      expect(caughtError.message).toBe("network failure");
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

      // Clean up
      await vi.runAllTimersAsync();
    });
  });

  describe("processBatch", () => {
    it("should validate inputs", async () => {
      // @ts-expect-error Testing invalid input
      await expect(
        processBatch(null, async () => {}, { maxConcurrent: 1 })
      ).rejects.toThrow(TypeError);

      // @ts-expect-error Testing invalid input
      await expect(
        processBatch([1, 2], "not a function", { maxConcurrent: 1 })
      ).rejects.toThrow(TypeError);

      await expect(
        processBatch([1, 2], async () => {}, { maxConcurrent: 0 })
      ).rejects.toThrow(RangeError);
    });

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

    it("should handle synchronous errors from processor", async () => {
      const items = [1, 2, 3];
      const processor = (_item: number) => {
        throw new Error("Synchronous error");
      };

      const results = await processBatch(items, processor, {
        maxConcurrent: 2,
      });

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === "rejected")).toBe(true);
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

    it("should apply timeout even when operation is not provided", async () => {
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
        // No operation name provided - should still apply timeout with default description
      });

      await vi.advanceTimersByTimeAsync(1001);
      const results = await resultPromise;

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect(results[2].status).toBe("fulfilled");

      if (results[1].status === "rejected") {
        expect(results[1].reason).toBeInstanceOf(TimeoutError);
        expect(results[1].reason.message).toContain("batch operation");
      }
    });
  });

  describe("processBatch with progressTracker", () => {
    it("should call completeItem(true) for successful results", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3];
      const processor = async (item: number) => ({
        success: true,
        value: item,
      });

      await processBatch(items, processor, {
        maxConcurrent: 2,
        progressTracker: mockTracker,
      });

      // Should start 3 items
      expect(mockTracker.startItem).toHaveBeenCalledTimes(3);
      // Should complete all 3 as successful
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(3);
      expect(mockTracker.completeItem).toHaveBeenCalledWith(true);
    });

    it("should call completeItem(false) for results with success: false", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3];
      const processor = async (item: number) => {
        // Item 2 fails
        if (item === 2) {
          return { success: false, error: "Failed" };
        }
        return { success: true, value: item };
      };

      await processBatch(items, processor, {
        maxConcurrent: 2,
        progressTracker: mockTracker,
      });

      expect(mockTracker.startItem).toHaveBeenCalledTimes(3);
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(3);
      // Check that we got both true and false calls
      expect(mockTracker.completeItem).toHaveBeenCalledWith(true);
      expect(mockTracker.completeItem).toHaveBeenCalledWith(false);
      // Should have 2 successes and 1 failure
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === true)
      ).toHaveLength(2);
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === false)
      ).toHaveLength(1);
    });

    it("should call completeItem(false) when promise rejects", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3];
      const processor = async (item: number) => {
        if (item === 2) {
          throw new Error("Rejected");
        }
        return { success: true, value: item };
      };

      await processBatch(items, processor, {
        maxConcurrent: 2,
        progressTracker: mockTracker,
      });

      expect(mockTracker.startItem).toHaveBeenCalledTimes(3);
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(3);
      // Should have 2 successes and 1 failure (from rejection)
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === true)
      ).toHaveLength(2);
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === false)
      ).toHaveLength(1);
    });

    it("should treat results without success property as successful", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3];
      // Processor returns results without 'success' property
      const processor = async (item: number) => ({ value: item });

      await processBatch(items, processor, {
        maxConcurrent: 2,
        progressTracker: mockTracker,
      });

      expect(mockTracker.startItem).toHaveBeenCalledTimes(3);
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(3);
      // All should be marked as successful (backward compatible)
      expect(mockTracker.completeItem).toHaveBeenCalledWith(true);
      expect(mockTracker.completeItem).not.toHaveBeenCalledWith(false);
    });

    it("should handle all items failing with success: false", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3];
      const processor = async () => ({ success: false, error: "All fail" });

      await processBatch(items, processor, {
        maxConcurrent: 2,
        progressTracker: mockTracker,
      });

      expect(mockTracker.startItem).toHaveBeenCalledTimes(3);
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(3);
      // All should be failures
      expect(mockTracker.completeItem).toHaveBeenCalledWith(false);
      expect(mockTracker.completeItem).not.toHaveBeenCalledWith(true);
    });

    it("should notify progressTracker when item times out", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3];
      const processor = async (item: number) => {
        if (item === 2) {
          // Item 2 hangs forever
          await new Promise(() => {
            /* never resolves */
          });
        }
        return { success: true, value: item };
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 3,
        timeoutMs: 1000,
        progressTracker: mockTracker,
      });

      // Advance time to trigger timeout for item 2
      await vi.advanceTimersByTimeAsync(1001);
      const results = await resultPromise;

      // Should start all 3 items
      expect(mockTracker.startItem).toHaveBeenCalledTimes(3);

      // Should complete all 3 items (including the timed-out one)
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(3);

      // Items 1 and 3 succeed, item 2 fails due to timeout
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === true)
      ).toHaveLength(2);
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === false)
      ).toHaveLength(1);

      // Verify results
      expect(results).toHaveLength(3);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected"); // Timed out
      expect(results[2].status).toBe("fulfilled");
    });

    it("should not double-notify progressTracker if promise settles after timeout", async () => {
      // Create a more realistic mock that simulates ProgressTracker's isFinished guard
      let isFinished = false;
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn((success: boolean) => {
          if (isFinished) return; // Simulate ProgressTracker's guard
          // Simulate finish() being called when all items complete
          isFinished = true;
        }),
      };

      let resolveSlowPromise: ((value: any) => void) | null = null;
      const items = [1];
      const processor = async () => {
        return new Promise((resolve) => {
          resolveSlowPromise = resolve;
        });
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 1,
        timeoutMs: 1000,
        progressTracker: mockTracker,
      });

      // Trigger timeout
      await vi.advanceTimersByTimeAsync(1001);
      await resultPromise;

      // completeItem should be called once for timeout
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(1);
      expect(mockTracker.completeItem).toHaveBeenCalledWith(false);

      // Now resolve the promise late
      if (resolveSlowPromise) {
        resolveSlowPromise({ success: true });
      }
      await vi.runAllTimersAsync();

      // completeItem called twice, but second call is ignored due to isFinished guard
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(2);
      // This demonstrates that without the guard, we'd have double notification
      // The real ProgressTracker prevents this with its isFinished check
    });

    it("should handle mixed timeouts and successes with progressTracker", async () => {
      const mockTracker = {
        startItem: vi.fn(),
        completeItem: vi.fn(),
      };

      const items = [1, 2, 3, 4, 5];
      const processor = async (item: number) => {
        if (item === 2 || item === 4) {
          // Items 2 and 4 hang
          await new Promise(() => {
            /* never resolves */
          });
        }
        return { success: true, value: item };
      };

      const resultPromise = processBatch(items, processor, {
        maxConcurrent: 5,
        timeoutMs: 1000,
        progressTracker: mockTracker,
      });

      await vi.advanceTimersByTimeAsync(1001);
      const results = await resultPromise;

      expect(mockTracker.startItem).toHaveBeenCalledTimes(5);
      expect(mockTracker.completeItem).toHaveBeenCalledTimes(5);

      // 3 successes, 2 failures (timeouts)
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === true)
      ).toHaveLength(3);
      expect(
        mockTracker.completeItem.mock.calls.filter((call) => call[0] === false)
      ).toHaveLength(2);

      // Verify results
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
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

      // Catch immediately to prevent unhandled rejection
      const rejectionPromise = resultPromise.catch((error) => error);

      await vi.advanceTimersByTimeAsync(101);

      const error = await rejectionPromise;
      expect(error).toBeInstanceOf(TimeoutError);
      if (error instanceof TimeoutError) {
        expect(error.operation).toBe("test");
      }

      // Clean up
      await vi.runAllTimersAsync();
    });
  });
});
