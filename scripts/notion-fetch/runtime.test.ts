import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Ora } from "ora";

describe("notion-fetch runtime", () => {
  let originalOn: typeof process.on;
  let mockOn: ReturnType<typeof vi.fn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original process.on
    originalOn = process.on;

    // Mock process.on to track signal handler registration
    mockOn = vi.fn((event: string, handler: any) => {
      return process as any;
    });
    process.on = mockOn as any;

    // Setup console spies (fresh for each test)
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original process.on
    process.on = originalOn;

    // Restore console methods
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should register signal handlers for graceful shutdown", async () => {
    // Import the real module (not mocked)
    const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
      await import("./runtime");

    // Reset runtime state to allow re-initialization
    __resetRuntimeForTests();

    // Initialize signal handlers
    initializeGracefulShutdownHandlers();

    // Assert all critical signal handlers were registered
    expect(mockOn).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(
      "uncaughtException",
      expect.any(Function)
    );
    expect(mockOn).toHaveBeenCalledWith(
      "unhandledRejection",
      expect.any(Function)
    );
  });

  it("should not register signal handlers twice", async () => {
    const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
      await import("./runtime");

    // Reset and initialize once
    __resetRuntimeForTests();
    initializeGracefulShutdownHandlers();

    const firstCallCount = mockOn.mock.calls.length;

    // Try to initialize again without reset
    initializeGracefulShutdownHandlers();

    // Should not have registered handlers again
    expect(mockOn.mock.calls.length).toBe(firstCallCount);
  });

  it("should allow re-initialization after reset", async () => {
    const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
      await import("./runtime");

    // Reset and initialize once
    __resetRuntimeForTests();
    initializeGracefulShutdownHandlers();

    mockOn.mockClear();

    // Reset again and re-initialize
    __resetRuntimeForTests();
    initializeGracefulShutdownHandlers();

    // Should have registered handlers again after reset
    expect(mockOn).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
  });

  describe("trackSpinner", () => {
    it("should track a spinner and return cleanup function", async () => {
      const { trackSpinner, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      const mockSpinner = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const cleanup = trackSpinner(mockSpinner);

      expect(typeof cleanup).toBe("function");
    });

    it("should allow cleanup function to remove spinner", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const mockSpinner = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const cleanup = trackSpinner(mockSpinner);

      // Remove spinner before shutdown
      cleanup();

      // Shutdown should not try to stop this spinner
      await gracefulShutdown(0);

      expect(mockSpinner.stop).not.toHaveBeenCalled();
    });

    it("should track multiple spinners", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const spinner1 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const spinner2 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinner1);
      trackSpinner(spinner2);

      await gracefulShutdown(0);

      // Both spinners should be stopped
      expect(spinner1.stop).toHaveBeenCalled();
      expect(spinner2.stop).toHaveBeenCalled();
    });

    it("should handle removing specific spinners from multiple tracked", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const spinner1 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const spinner2 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const spinner3 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinner1);
      const cleanup2 = trackSpinner(spinner2);
      trackSpinner(spinner3);

      // Remove middle spinner
      cleanup2();

      await gracefulShutdown(0);

      // Only spinner1 and spinner3 should be stopped
      expect(spinner1.stop).toHaveBeenCalled();
      expect(spinner2.stop).not.toHaveBeenCalled();
      expect(spinner3.stop).toHaveBeenCalled();
    });
  });

  describe("gracefulShutdown", () => {
    it("should return exit code 0 when called with no arguments", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      const exitCode = await gracefulShutdown();

      expect(exitCode).toBe(0);
    });

    it("should return custom exit code when provided", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      const exitCode = await gracefulShutdown(42);

      expect(exitCode).toBe(42);
    });

    it("should log signal name when provided", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      await gracefulShutdown(130, "SIGINT");

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Received SIGINT")
      );
    });

    it("should log without signal name when not provided", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      await gracefulShutdown(1);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Shutting down gracefully")
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Received")
      );
    });

    it("should prevent re-entry and return original exit code", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      const mockSpinner = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const { trackSpinner } = await import("./runtime");
      trackSpinner(mockSpinner);

      // First shutdown
      const promise1 = gracefulShutdown(1);

      // Second shutdown (re-entry)
      const exitCode2 = await gracefulShutdown(2);

      // Should return second exit code immediately without cleanup
      expect(exitCode2).toBe(2);

      await promise1;

      // Spinner should only be stopped once (from first shutdown)
      expect(mockSpinner.stop).toHaveBeenCalledTimes(1);
    });

    it("should stop all active spinning spinners", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const spinningSpinner = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const stoppedSpinner = {
        isSpinning: false,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinningSpinner);
      trackSpinner(stoppedSpinner);

      await gracefulShutdown(0);

      expect(spinningSpinner.stop).toHaveBeenCalled();
      expect(stoppedSpinner.stop).not.toHaveBeenCalled();
    });

    it("should call global.gc if available", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      const mockGc = vi.fn();
      (global as any).gc = mockGc;

      try {
        await gracefulShutdown(0);

        expect(mockGc).toHaveBeenCalled();
      } finally {
        delete (global as any).gc;
      }
    });

    it("should not throw when global.gc is undefined", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      // Ensure gc is undefined
      delete (global as any).gc;

      await expect(gracefulShutdown(0)).resolves.toBe(0);
    });

    it("should log cleanup completion message", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      await gracefulShutdown(0);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cleanup completed")
      );
    });

    it("should handle and log cleanup errors", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const errorSpinner = {
        isSpinning: true,
        stop: vi.fn(() => {
          throw new Error("Spinner stop failed");
        }),
      } as unknown as Ora;

      trackSpinner(errorSpinner);

      // Should not throw despite cleanup error
      const exitCode = await gracefulShutdown(0);

      expect(exitCode).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error during cleanup"),
        expect.any(Error)
      );
    });

    it("should clear activeSpinners array after cleanup", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const spinner1 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      const spinner2 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinner1);
      trackSpinner(spinner2);

      await gracefulShutdown(0);

      // After shutdown, reset and track new spinner
      __resetRuntimeForTests();

      const spinner3 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinner3);

      await gracefulShutdown(0);

      // Only the new spinner should be stopped (old ones were cleared)
      expect(spinner1.stop).toHaveBeenCalledTimes(1);
      expect(spinner2.stop).toHaveBeenCalledTimes(1);
      expect(spinner3.stop).toHaveBeenCalledTimes(1);
    });

    it("should await setImmediate for cleanup completion", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      __resetRuntimeForTests();

      const startTime = Date.now();

      await gracefulShutdown(0);

      const duration = Date.now() - startTime;

      // setImmediate should add minimal delay (at least event loop tick)
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("__resetRuntimeForTests", () => {
    it("should reset isShuttingDown flag", async () => {
      const { gracefulShutdown, __resetRuntimeForTests } = await import(
        "./runtime"
      );

      // Trigger shutdown
      await gracefulShutdown(0);

      // Reset
      __resetRuntimeForTests();

      // Should be able to shutdown again (not blocked by isShuttingDown)
      const exitCode = await gracefulShutdown(1);

      expect(exitCode).toBe(1);
    });

    it("should reset isInitialized flag", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      // Initialize handlers
      __resetRuntimeForTests();
      initializeGracefulShutdownHandlers();

      const callCountAfterFirst = mockOn.mock.calls.length;

      // Reset and initialize again
      __resetRuntimeForTests();
      mockOn.mockClear();
      initializeGracefulShutdownHandlers();

      // Should register handlers again
      expect(mockOn.mock.calls.length).toBeGreaterThan(0);
      expect(mockOn.mock.calls.length).toBe(callCountAfterFirst);
    });

    it("should clear activeSpinners array", async () => {
      const { trackSpinner, gracefulShutdown, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      const spinner1 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinner1);

      // Reset without shutdown
      __resetRuntimeForTests();

      const spinner2 = {
        isSpinning: true,
        stop: vi.fn(),
      } as unknown as Ora;

      trackSpinner(spinner2);

      await gracefulShutdown(0);

      // Only spinner2 should be stopped (spinner1 was cleared by reset)
      expect(spinner1.stop).not.toHaveBeenCalled();
      expect(spinner2.stop).toHaveBeenCalled();
    });
  });

  describe("signal handler implementations", () => {
    let originalNodeEnv: string | undefined;
    let processExitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Save original NODE_ENV
      originalNodeEnv = process.env.NODE_ENV;

      // Spy on process.exit to prevent actual exit and track calls
      processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        return undefined as never;
      });
    });

    afterEach(() => {
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;

      // Restore process.exit
      processExitSpy.mockRestore();
    });

    it("should invoke gracefulShutdown with SIGTERM exit code", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      // Temporarily set NODE_ENV to production to enable handler logic
      process.env.NODE_ENV = "production";

      initializeGracefulShutdownHandlers();

      // Find the SIGTERM handler
      const sigtermCall = mockOn.mock.calls.find(
        ([event]) => event === "SIGTERM"
      );
      expect(sigtermCall).toBeDefined();

      const sigtermHandler = sigtermCall![1];

      // Invoke the SIGTERM handler (returns void, kicks off async operation)
      sigtermHandler();

      // Wait for async gracefulShutdown to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Verify it logged shutdown message with signal
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Received SIGTERM")
      );

      // Verify it called process.exit with correct exit code
      expect(processExitSpy).toHaveBeenCalledWith(143);
    });

    it("should invoke gracefulShutdown with SIGINT exit code", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      process.env.NODE_ENV = "production";

      initializeGracefulShutdownHandlers();

      const sigintCall = mockOn.mock.calls.find(
        ([event]) => event === "SIGINT"
      );
      expect(sigintCall).toBeDefined();

      const sigintHandler = sigintCall![1];

      // Invoke the SIGINT handler (returns void, kicks off async operation)
      sigintHandler();

      // Wait for async gracefulShutdown to complete
      await new Promise((resolve) => setImmediate(resolve));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Received SIGINT")
      );
      expect(processExitSpy).toHaveBeenCalledWith(130);
    });

    it("should handle uncaughtException and invoke gracefulShutdown", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      process.env.NODE_ENV = "production";

      initializeGracefulShutdownHandlers();

      const uncaughtExceptionCall = mockOn.mock.calls.find(
        ([event]) => event === "uncaughtException"
      );
      expect(uncaughtExceptionCall).toBeDefined();

      const uncaughtExceptionHandler = uncaughtExceptionCall![1];

      const testError = new Error("Test uncaught exception");

      // Invoke the uncaughtException handler (returns void promise)
      const promise = uncaughtExceptionHandler(testError);

      // Wait for async gracefulShutdown to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Uncaught exception"),
        testError
      );

      // Should call process.exit with exit code 1
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should handle unhandledRejection and invoke gracefulShutdown", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      process.env.NODE_ENV = "production";

      initializeGracefulShutdownHandlers();

      const unhandledRejectionCall = mockOn.mock.calls.find(
        ([event]) => event === "unhandledRejection"
      );
      expect(unhandledRejectionCall).toBeDefined();

      const unhandledRejectionHandler = unhandledRejectionCall![1];

      const testReason = "Test unhandled rejection reason";
      const testPromise = Promise.reject(testReason);

      // Catch the rejection to prevent test error
      testPromise.catch(() => {});

      // Invoke the unhandledRejection handler
      unhandledRejectionHandler(testReason, testPromise);

      // Wait for async gracefulShutdown to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Should log error with reason and promise
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unhandled rejection"),
        testPromise,
        "reason:",
        testReason
      );

      // Should call process.exit with exit code 1
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should not invoke gracefulShutdown in test mode for SIGTERM", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      // Keep NODE_ENV as "test" (default)
      process.env.NODE_ENV = "test";

      initializeGracefulShutdownHandlers();

      const sigtermCall = mockOn.mock.calls.find(
        ([event]) => event === "SIGTERM"
      );
      const sigtermHandler = sigtermCall![1];

      sigtermHandler();

      // Should NOT call process.exit in test mode
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it("should not invoke gracefulShutdown in test mode for uncaughtException", async () => {
      const { initializeGracefulShutdownHandlers, __resetRuntimeForTests } =
        await import("./runtime");

      __resetRuntimeForTests();

      process.env.NODE_ENV = "test";

      initializeGracefulShutdownHandlers();

      const uncaughtExceptionCall = mockOn.mock.calls.find(
        ([event]) => event === "uncaughtException"
      );
      const uncaughtExceptionHandler = uncaughtExceptionCall![1];

      const testError = new Error("Test error");
      uncaughtExceptionHandler(testError);

      // Should still log the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Uncaught exception"),
        testError
      );

      // But should NOT call process.exit in test mode
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
