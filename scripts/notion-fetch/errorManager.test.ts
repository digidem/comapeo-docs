import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ErrorManager,
  ErrorCategory,
  getErrorManager,
  resetErrorManager,
} from "./errorManager";

describe("ErrorManager", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    resetErrorManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("classifyError", () => {
    it("should classify network errors as transient", () => {
      const manager = new ErrorManager();

      expect(manager.classifyError(new Error("ECONNRESET"))).toBe(
        ErrorCategory.TRANSIENT
      );
      expect(manager.classifyError(new Error("ETIMEDOUT"))).toBe(
        ErrorCategory.TRANSIENT
      );
      expect(manager.classifyError(new Error("socket hang up"))).toBe(
        ErrorCategory.TRANSIENT
      );
      expect(manager.classifyError(new Error("network error"))).toBe(
        ErrorCategory.TRANSIENT
      );
    });

    it("should classify rate limit errors as transient", () => {
      const manager = new ErrorManager();

      expect(manager.classifyError(new Error("429 Too Many Requests"))).toBe(
        ErrorCategory.TRANSIENT
      );
      expect(manager.classifyError(new Error("rate limit exceeded"))).toBe(
        ErrorCategory.TRANSIENT
      );
    });

    it("should classify server errors as transient", () => {
      const manager = new ErrorManager();

      expect(manager.classifyError(new Error("502 Bad Gateway"))).toBe(
        ErrorCategory.TRANSIENT
      );
      expect(manager.classifyError(new Error("503 Service Unavailable"))).toBe(
        ErrorCategory.TRANSIENT
      );
      expect(manager.classifyError(new Error("504 Gateway Timeout"))).toBe(
        ErrorCategory.TRANSIENT
      );
    });

    it("should classify client errors as permanent", () => {
      const manager = new ErrorManager();

      expect(manager.classifyError(new Error("404 Not Found"))).toBe(
        ErrorCategory.PERMANENT
      );
      expect(manager.classifyError(new Error("401 Unauthorized"))).toBe(
        ErrorCategory.PERMANENT
      );
      expect(manager.classifyError(new Error("403 Forbidden"))).toBe(
        ErrorCategory.PERMANENT
      );
    });

    it("should classify data errors as permanent", () => {
      const manager = new ErrorManager();

      expect(manager.classifyError(new Error("Invalid JSON"))).toBe(
        ErrorCategory.PERMANENT
      );
      expect(manager.classifyError(new Error("Parse error"))).toBe(
        ErrorCategory.PERMANENT
      );
      expect(manager.classifyError(new Error("malformed data"))).toBe(
        ErrorCategory.PERMANENT
      );
    });

    it("should classify unknown errors", () => {
      const manager = new ErrorManager();

      expect(manager.classifyError(new Error("Something went wrong"))).toBe(
        ErrorCategory.UNKNOWN
      );
      expect(manager.classifyError("string error")).toBe(ErrorCategory.UNKNOWN);
      expect(manager.classifyError(null)).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe("recordError", () => {
    it("should record errors with context", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("test-operation", new Error("Test error"), {
        pageId: "123",
      });

      const report = manager.getReport();
      expect(report.totalErrors).toBe(1);
      expect(report.errors[0].operation).toBe("test-operation");
      expect(report.errors[0].message).toBe("Test error");
      expect(report.errors[0].context?.pageId).toBe("123");
    });

    it("should handle non-Error objects", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("test", "string error");
      manager.recordError("test", { custom: "error" });
      manager.recordError("test", null);

      const report = manager.getReport();
      expect(report.totalErrors).toBe(3);
      expect(report.errors[0].message).toBe("string error");
    });

    it("should log errors to console by default", () => {
      const manager = new ErrorManager();

      manager.recordError("test", new Error("Test error"));

      expect(console.error).toHaveBeenCalled();
    });

    it("should not log when logErrors is false", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("test", new Error("Test error"));

      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("shouldRetry", () => {
    it("should retry transient errors", () => {
      const manager = new ErrorManager();

      const decision = manager.shouldRetry("test", new Error("ECONNRESET"), 0);

      expect(decision.retry).toBe(true);
      expect(decision.delayMs).toBeGreaterThan(0);
    });

    it("should not retry permanent errors", () => {
      const manager = new ErrorManager();

      const decision = manager.shouldRetry(
        "test",
        new Error("404 Not Found"),
        0
      );

      expect(decision.retry).toBe(false);
      expect(decision.reason).toContain("Permanent error");
    });

    it("should not retry after max attempts", () => {
      const manager = new ErrorManager({ maxRetries: 3 });

      const decision = manager.shouldRetry("test", new Error("ECONNRESET"), 3);

      expect(decision.retry).toBe(false);
      expect(decision.reason).toContain("Max retries");
    });

    it("should use exponential backoff", () => {
      const manager = new ErrorManager({ baseDelayMs: 1000 });
      const error = new Error("ECONNRESET");

      const delay0 = manager.shouldRetry("test", error, 0).delayMs;
      const delay1 = manager.shouldRetry("test", error, 1).delayMs;
      const delay2 = manager.shouldRetry("test", error, 2).delayMs;

      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay2).toBe(4000);
    });

    it("should cap delay at maxDelayMs", () => {
      const manager = new ErrorManager({
        baseDelayMs: 1000,
        maxDelayMs: 5000,
      });

      const decision = manager.shouldRetry("test", new Error("ECONNRESET"), 5);

      expect(decision.delayMs).toBeLessThanOrEqual(5000);
    });

    it("should limit retries for unknown errors", () => {
      const manager = new ErrorManager({ maxRetries: 5 });

      const decision = manager.shouldRetry(
        "test",
        new Error("Unknown issue"),
        2
      );

      expect(decision.retry).toBe(false);
      expect(decision.reason).toContain("Unknown error");
    });
  });

  describe("withRetry", () => {
    it("should succeed on first attempt", async () => {
      const manager = new ErrorManager({ logErrors: false });
      const fn = vi.fn().mockResolvedValue("success");

      const result = await manager.withRetry("test", fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry transient errors", async () => {
      const manager = new ErrorManager({
        logErrors: false,
        baseDelayMs: 1, // Fast retries for testing
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce("success");

      const result = await manager.withRetry("test", fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry permanent errors", async () => {
      const manager = new ErrorManager({ logErrors: false });
      const fn = vi.fn().mockRejectedValue(new Error("404 Not Found"));

      await expect(manager.withRetry("test", fn)).rejects.toThrow("404");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should throw after max retries", async () => {
      const manager = new ErrorManager({
        logErrors: false,
        maxRetries: 2,
        baseDelayMs: 1,
      });

      const fn = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

      await expect(manager.withRetry("test", fn)).rejects.toThrow("ECONNRESET");
      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe("getReport", () => {
    it("should generate correct statistics", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("op1", new Error("ECONNRESET"));
      manager.recordError("op1", new Error("ECONNRESET"));
      manager.recordError("op2", new Error("404 Not Found"));
      manager.recordError("op3", new Error("Unknown"));

      const report = manager.getReport();

      expect(report.totalErrors).toBe(4);
      expect(report.errorsByCategory[ErrorCategory.TRANSIENT]).toBe(2);
      expect(report.errorsByCategory[ErrorCategory.PERMANENT]).toBe(1);
      expect(report.errorsByCategory[ErrorCategory.UNKNOWN]).toBe(1);
      expect(report.errorsByOperation["op1"]).toBe(2);
      expect(report.errorsByOperation["op2"]).toBe(1);
    });

    it("should return top errors sorted by count", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("op1", new Error("Error A"));
      manager.recordError("op1", new Error("Error A"));
      manager.recordError("op1", new Error("Error A"));
      manager.recordError("op2", new Error("Error B"));

      const report = manager.getReport();

      expect(report.topErrors[0].count).toBe(3);
      expect(report.topErrors[0].message).toBe("Error A");
    });
  });

  describe("markResolved", () => {
    it("should mark errors as resolved", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("test", new Error("Test error"));
      expect(manager.getUnresolvedCount()).toBe(1);

      manager.markResolved("test");
      expect(manager.getUnresolvedCount()).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear all errors", () => {
      const manager = new ErrorManager({ logErrors: false });

      manager.recordError("test", new Error("Error 1"));
      manager.recordError("test", new Error("Error 2"));

      manager.clear();

      const report = manager.getReport();
      expect(report.totalErrors).toBe(0);
    });
  });

  describe("global instance", () => {
    it("should return same instance", () => {
      const manager1 = getErrorManager();
      const manager2 = getErrorManager();

      expect(manager1).toBe(manager2);
    });

    it("should reset correctly", () => {
      const manager1 = getErrorManager();
      resetErrorManager();
      const manager2 = getErrorManager();

      expect(manager1).not.toBe(manager2);
    });
  });
});
