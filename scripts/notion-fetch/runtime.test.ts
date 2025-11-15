import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("notion-fetch runtime", () => {
  let originalOn: typeof process.on;
  let mockOn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Save original process.on
    originalOn = process.on;

    // Mock process.on to track signal handler registration
    mockOn = vi.fn((event: string, handler: any) => {
      return process as any;
    });
    process.on = mockOn as any;
  });

  afterEach(() => {
    // Restore original process.on
    process.on = originalOn;
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
});
