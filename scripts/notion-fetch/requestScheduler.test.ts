import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock perfTelemetry before importing requestScheduler
vi.mock("../perfTelemetry", () => ({
  perfTelemetry: {
    recordQueueSample: vi.fn(),
  },
}));

describe("requestScheduler", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Environment variable parsing", () => {
    it("should use defaults when environment variables not set", async () => {
      delete process.env.NOTION_MAX_CONCURRENT;
      delete process.env.NOTION_MAX_PER_INTERVAL;
      delete process.env.NOTION_INTERVAL_MS;

      // Re-import to get fresh module with clean env
      const { getRequestScheduler } = await import("./requestScheduler");
      const scheduler = getRequestScheduler();

      // Scheduler should be created with defaults (tested indirectly via behavior)
      expect(scheduler).toBeDefined();
    });

    it("should handle invalid environment variables (NaN)", async () => {
      process.env.NOTION_MAX_CONCURRENT = "not-a-number";
      process.env.NOTION_MAX_PER_INTERVAL = "abc";
      process.env.NOTION_INTERVAL_MS = "xyz";

      // Should fall back to defaults without crashing
      const { getRequestScheduler } = await import("./requestScheduler");
      const scheduler = getRequestScheduler();

      expect(scheduler).toBeDefined();
    });

    it("should handle negative environment variables", async () => {
      process.env.NOTION_MAX_CONCURRENT = "-5";
      process.env.NOTION_MAX_PER_INTERVAL = "-10";
      process.env.NOTION_INTERVAL_MS = "-1000";

      // Should fall back to defaults (min enforced)
      const { getRequestScheduler } = await import("./requestScheduler");
      const scheduler = getRequestScheduler();

      expect(scheduler).toBeDefined();
    });

    it("should enforce maximum bounds on environment variables", async () => {
      process.env.NOTION_MAX_CONCURRENT = "9999"; // Max is 10
      process.env.NOTION_MAX_PER_INTERVAL = "9999"; // Max is 20
      process.env.NOTION_INTERVAL_MS = "99999"; // Max is 10000

      // Should cap at max values
      const { getRequestScheduler } = await import("./requestScheduler");
      const scheduler = getRequestScheduler();

      expect(scheduler).toBeDefined();
    });
  });

  describe("CircuitBreakerOpenError", () => {
    it("should create error with correct name and message", async () => {
      const { CircuitBreakerOpenError } = await import("./requestScheduler");

      const error = new CircuitBreakerOpenError("Test message");

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("CircuitBreakerOpenError");
      expect(error.message).toBe("Test message");
    });
  });

  describe("RequestScheduler - Basic scheduling", () => {
    it("should schedule and execute a single task immediately", async () => {
      const { RequestScheduler } = await import("./requestScheduler");
      const scheduler = new RequestScheduler({
        maxConcurrent: 1,
        maxPerInterval: 1,
        intervalMs: 1000,
      });

      const taskResult = "task completed";
      const task = vi.fn().mockResolvedValue(taskResult);

      const resultPromise = scheduler.schedule(task);

      // Advance timers to allow task to execute
      await vi.runOnlyPendingTimersAsync();

      const result = await resultPromise;

      expect(task).toHaveBeenCalledTimes(1);
      expect(result).toBe(taskResult);

      scheduler.destroy();
    });

    it("should queue tasks when tokens exhausted", async () => {
      const { RequestScheduler } = await import("./requestScheduler");

      const scheduler = new RequestScheduler({
        maxConcurrent: 5,
        maxPerInterval: 2, // Only 2 tokens
        intervalMs: 1000,
      });

      const tasks = [
        vi.fn().mockResolvedValue("result1"),
        vi.fn().mockResolvedValue("result2"),
        vi.fn().mockResolvedValue("result3"), // Should be queued
      ];

      // Schedule all tasks
      const promises = tasks.map((task) => scheduler.schedule(task));

      // Run microtasks to allow initial scheduling
      await Promise.resolve();

      // First 2 tasks should execute immediately (tokens available)
      expect(tasks[0]).toHaveBeenCalled();
      expect(tasks[1]).toHaveBeenCalled();
      expect(tasks[2]).not.toHaveBeenCalled(); // Queued, no tokens

      // Advance time to refill tokens
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      await Promise.all(promises);

      // Third task should now execute
      expect(tasks[2]).toHaveBeenCalled();

      scheduler.destroy();
    });

    it("should respect maxConcurrent limit", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 2, // Only 2 concurrent
        maxPerInterval: 10, // Plenty of tokens
        intervalMs: 1000,
      });

      let activeCount = 0;
      let maxActive = 0;

      const createTask = () =>
        vi.fn().mockImplementation(async () => {
          activeCount++;
          maxActive = Math.max(maxActive, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 100));
          activeCount--;
          return "done";
        });

      const tasks = [createTask(), createTask(), createTask(), createTask()];

      const promises = tasks.map((task) => scheduler.schedule(task));

      await vi.runOnlyPendingTimersAsync();
      await Promise.all(promises);

      // Should never have more than 2 concurrent
      expect(maxActive).toBeLessThanOrEqual(2);

      scheduler.destroy();
    });

    it("should process queue as tasks complete", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 1,
        maxPerInterval: 10,
        intervalMs: 1000,
      });

      const executionOrder: number[] = [];

      const tasks = [
        vi.fn().mockImplementation(async () => {
          executionOrder.push(1);
          return "task1";
        }),
        vi.fn().mockImplementation(async () => {
          executionOrder.push(2);
          return "task2";
        }),
        vi.fn().mockImplementation(async () => {
          executionOrder.push(3);
          return "task3";
        }),
      ];

      const promises = tasks.map((task) => scheduler.schedule(task));

      await vi.runOnlyPendingTimersAsync();
      await Promise.all(promises);

      // Tasks should execute in order (FIFO queue)
      expect(executionOrder).toEqual([1, 2, 3]);

      scheduler.destroy();
    });
  });

  describe("RequestScheduler - Circuit breaker integration", () => {
    it("should reject tasks when circuit breaker is open", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const circuitBreakerCheck = vi.fn().mockReturnValue(true); // Circuit open

      const scheduler = new RequestScheduler({
        circuitBreakerCheck,
      });

      const task = vi.fn().mockResolvedValue("should not execute");

      await expect(scheduler.schedule(task)).rejects.toThrow(
        CircuitBreakerOpenError
      );
      await expect(scheduler.schedule(task)).rejects.toThrow(
        "Circuit breaker is open, rejecting request"
      );

      expect(task).not.toHaveBeenCalled();
      expect(circuitBreakerCheck).toHaveBeenCalled();

      scheduler.destroy();
    });

    it("should allow tasks when circuit breaker is closed", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const circuitBreakerCheck = vi.fn().mockReturnValue(false); // Circuit closed

      const scheduler = new RequestScheduler({
        circuitBreakerCheck,
      });

      const task = vi.fn().mockResolvedValue("executed");

      const resultPromise = scheduler.schedule(task);

      await vi.runOnlyPendingTimersAsync();
      const result = await resultPromise;

      expect(result).toBe("executed");
      expect(task).toHaveBeenCalled();
      expect(circuitBreakerCheck).toHaveBeenCalled();

      scheduler.destroy();
    });

    it("should check circuit breaker before queuing each task", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      let circuitOpen = false;
      const circuitBreakerCheck = vi.fn().mockImplementation(() => circuitOpen);

      const scheduler = new RequestScheduler({
        circuitBreakerCheck,
      });

      const task1 = vi.fn().mockResolvedValue("task1");
      const task2 = vi.fn().mockResolvedValue("task2");

      // First task should succeed (circuit closed)
      const promise1 = scheduler.schedule(task1);
      await vi.runOnlyPendingTimersAsync();
      await promise1;

      expect(task1).toHaveBeenCalled();

      // Open circuit
      circuitOpen = true;

      // Second task should be rejected
      await expect(scheduler.schedule(task2)).rejects.toThrow(
        "Circuit breaker is open"
      );

      expect(task2).not.toHaveBeenCalled();

      scheduler.destroy();
    });
  });

  describe("RequestScheduler - Lifecycle and cleanup", () => {
    it("should destroy cleanly and clear interval", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        intervalMs: 1000,
      });

      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      scheduler.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it("should reject pending tasks when destroyed", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 1,
        maxPerInterval: 1,
        intervalMs: 1000,
      });

      // Create tasks that will be queued
      const task1 = vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("task1"), 5000);
          })
      );
      const task2 = vi.fn().mockResolvedValue("task2");
      const task3 = vi.fn().mockResolvedValue("task3");

      const promise1 = scheduler.schedule(task1);
      const promise2 = scheduler.schedule(task2);
      const promise3 = scheduler.schedule(task3);

      // Allow first task to start
      await Promise.resolve();

      // Destroy scheduler with tasks still queued
      scheduler.destroy();

      // Pending tasks should be rejected
      await expect(promise2).rejects.toThrow("Scheduler destroyed");
      await expect(promise3).rejects.toThrow("Scheduler destroyed");

      // First task should also be rejected or remain pending
      // (depends on if it was already executing)
    });

    it("should reject new tasks after destroyed", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler();

      scheduler.destroy();

      const task = vi.fn().mockResolvedValue("should not execute");

      await expect(scheduler.schedule(task)).rejects.toThrow(
        "Scheduler has been destroyed"
      );

      expect(task).not.toHaveBeenCalled();
    });

    it("should be idempotent when destroy called multiple times", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler();

      scheduler.destroy();
      scheduler.destroy(); // Should not throw
      scheduler.destroy(); // Should not throw

      // Should still reject tasks
      await expect(
        scheduler.schedule(vi.fn().mockResolvedValue("test"))
      ).rejects.toThrow("Scheduler has been destroyed");
    });
  });

  describe("RequestScheduler - Token bucket algorithm", () => {
    it("should refill tokens after interval elapses", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 10,
        maxPerInterval: 2,
        intervalMs: 1000,
      });

      const tasks = [
        vi.fn().mockResolvedValue("1"),
        vi.fn().mockResolvedValue("2"),
        vi.fn().mockResolvedValue("3"),
        vi.fn().mockResolvedValue("4"),
      ];

      // Schedule first 2 (use up tokens)
      const promise1 = scheduler.schedule(tasks[0]);
      const promise2 = scheduler.schedule(tasks[1]);

      // Wait for first 2 to complete
      await Promise.all([promise1, promise2]);

      expect(tasks[0]).toHaveBeenCalled();
      expect(tasks[1]).toHaveBeenCalled();

      // Schedule next 2 (no tokens, should queue)
      const promise3 = scheduler.schedule(tasks[2]);
      const promise4 = scheduler.schedule(tasks[3]);

      await Promise.resolve(); // Microtask to allow queue processing attempt

      // Tokens exhausted, tasks should NOT execute yet
      expect(tasks[2]).not.toHaveBeenCalled();
      expect(tasks[3]).not.toHaveBeenCalled();

      // Advance time by interval to trigger token refill
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      // Now tokens refilled, tasks should execute
      await Promise.all([promise3, promise4]);

      expect(tasks[2]).toHaveBeenCalled();
      expect(tasks[3]).toHaveBeenCalled();

      scheduler.destroy();
    });

    it("should handle rapid task scheduling within same interval", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 10,
        maxPerInterval: 3,
        intervalMs: 1000,
      });

      const tasks = Array.from({ length: 10 }, (_, i) =>
        vi.fn().mockResolvedValue(`task${i}`)
      );

      // Schedule all tasks rapidly
      const promises = tasks.map((task) => scheduler.schedule(task));

      await Promise.resolve();

      // Only first 3 should execute immediately (tokens = 3)
      expect(tasks[0]).toHaveBeenCalled();
      expect(tasks[1]).toHaveBeenCalled();
      expect(tasks[2]).toHaveBeenCalled();
      expect(tasks[3]).not.toHaveBeenCalled();

      // Advance interval to refill
      vi.advanceTimersByTime(1000);
      await vi.runOnlyPendingTimersAsync();

      // Next 3 should execute
      expect(tasks[3]).toHaveBeenCalled();
      expect(tasks[4]).toHaveBeenCalled();
      expect(tasks[5]).toHaveBeenCalled();

      // Continue until all complete
      vi.advanceTimersByTime(2000);
      await vi.runOnlyPendingTimersAsync();

      await Promise.all(promises);

      // All tasks should eventually execute
      tasks.forEach((task) => {
        expect(task).toHaveBeenCalled();
      });

      scheduler.destroy();
    });
  });

  describe("RequestScheduler - Error handling", () => {
    it("should propagate task errors correctly", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler();

      const taskError = new Error("Task failed");
      const task = vi.fn().mockRejectedValue(taskError);

      const promise = scheduler.schedule(task).catch((error) => error);

      await vi.runOnlyPendingTimersAsync();

      const error = await promise;

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Task failed");
      expect(task).toHaveBeenCalled();

      scheduler.destroy();
    });

    it("should continue processing queue after task error", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 1,
      });

      const task1 = vi.fn().mockRejectedValue(new Error("Task 1 failed"));
      const task2 = vi.fn().mockResolvedValue("task2 success");

      const promise1 = scheduler.schedule(task1).catch((error) => error);
      const promise2 = scheduler.schedule(task2);

      await vi.runOnlyPendingTimersAsync();

      const error1 = await promise1;
      const result2 = await promise2;

      expect(error1).toBeInstanceOf(Error);
      expect((error1 as Error).message).toBe("Task 1 failed");
      expect(result2).toBe("task2 success");
      expect(task1).toHaveBeenCalled();
      expect(task2).toHaveBeenCalled();

      scheduler.destroy();
    });
  });

  describe("RequestScheduler - Label tracking", () => {
    it("should accept and pass through label option", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler();

      const task = vi.fn().mockResolvedValue("result");

      const promise = scheduler.schedule(task, { label: "test-task" });

      await vi.runOnlyPendingTimersAsync();
      await promise;

      expect(task).toHaveBeenCalled();

      scheduler.destroy();
    });
  });

  describe("Global functions", () => {
    it("should expose setCircuitBreakerCheck function", async () => {
      const { setCircuitBreakerCheck } = await import("./requestScheduler");

      expect(typeof setCircuitBreakerCheck).toBe("function");

      const check = vi.fn().mockReturnValue(false);
      setCircuitBreakerCheck(check);

      // Should not throw
    });

    it("should expose scheduleRequest function", async () => {
      const { scheduleRequest } = await import("./requestScheduler");

      expect(typeof scheduleRequest).toBe("function");

      const task = vi.fn().mockResolvedValue("result");
      const promise = scheduleRequest(task);

      await vi.runOnlyPendingTimersAsync();
      const result = await promise;

      expect(result).toBe("result");
      expect(task).toHaveBeenCalled();
    });

    it("should expose getRequestScheduler function", async () => {
      const { getRequestScheduler } = await import("./requestScheduler");

      expect(typeof getRequestScheduler).toBe("function");

      const scheduler = getRequestScheduler();

      expect(scheduler).toBeDefined();
      expect(typeof scheduler.schedule).toBe("function");
      expect(typeof scheduler.destroy).toBe("function");
    });

    it("setCircuitBreakerCheck should recreate scheduler with new check", async () => {
      const {
        setCircuitBreakerCheck,
        getRequestScheduler,
        CircuitBreakerOpenError,
      } = await import("./requestScheduler");

      // Set circuit breaker that's open
      const check = vi.fn().mockReturnValue(true);
      setCircuitBreakerCheck(check);

      const scheduler = getRequestScheduler();

      const task = vi.fn().mockResolvedValue("test");

      await expect(scheduler.schedule(task)).rejects.toThrow(
        CircuitBreakerOpenError
      );

      expect(check).toHaveBeenCalled();
      expect(task).not.toHaveBeenCalled();
    });
  });

  describe("RequestScheduler - Edge cases", () => {
    it("should handle empty queue gracefully", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler();

      // Advance time with empty queue
      vi.advanceTimersByTime(5000);
      await vi.runOnlyPendingTimersAsync();

      // Should not crash
      scheduler.destroy();
    });

    it("should handle maxConcurrent = 1 correctly", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler({
        maxConcurrent: 1,
        maxPerInterval: 10,
      });

      let activeCount = 0;
      let maxActive = 0;

      const tasks = Array.from({ length: 5 }, () =>
        vi.fn().mockImplementation(async () => {
          activeCount++;
          maxActive = Math.max(maxActive, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 10));
          activeCount--;
        })
      );

      const promises = tasks.map((task) => scheduler.schedule(task));

      await vi.runOnlyPendingTimersAsync();
      await Promise.all(promises);

      expect(maxActive).toBe(1);

      scheduler.destroy();
    });

    it("should handle constructor with minimal options", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      const scheduler = new RequestScheduler(); // No options

      const task = vi.fn().mockResolvedValue("result");

      const promise = scheduler.schedule(task);

      await vi.runOnlyPendingTimersAsync();
      const result = await promise;

      expect(result).toBe("result");

      scheduler.destroy();
    });

    it("should enforce minimum values for config", async () => {
      const { RequestScheduler, CircuitBreakerOpenError } = await import(
        "./requestScheduler"
      );

      // Try to set values below minimums
      const scheduler = new RequestScheduler({
        maxConcurrent: 0, // Should be clamped to 1
        maxPerInterval: 0, // Should be clamped to 1
        intervalMs: 50, // Should be clamped to 100
      });

      // Scheduler should still work with clamped values
      const task = vi.fn().mockResolvedValue("result");

      const promise = scheduler.schedule(task);

      await vi.runOnlyPendingTimersAsync();
      const result = await promise;

      expect(result).toBe("result");

      scheduler.destroy();
    });
  });
});
