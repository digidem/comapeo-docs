/**
 * Tests for job executor - timeout behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ChildProcess } from "node:child_process";

// Import the functions we need to test
import {
  getJobTracker,
  destroyJobTracker,
  type GitHubContext,
} from "./job-tracker";

// Mock child_process spawn
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  ChildProcess: class {},
}));

// Mock content-repo integration to keep timeout tests focused on process lifecycle
vi.mock("./content-repo", () => ({
  isContentMutatingJob: (jobType: string) =>
    jobType === "notion:fetch" ||
    jobType === "notion:fetch-all" ||
    jobType === "notion:translate",
  runContentTask: async (
    _taskName: string,
    _requestId: string,
    taskRunner: (workdir: string) => Promise<string>
  ) => {
    const output = await taskRunner(process.cwd());
    return { output, noOp: true };
  },
}));

// Mock github-status
vi.mock("./github-status", () => ({
  reportJobCompletion: vi.fn().mockResolvedValue(null),
}));

// Now import job-executor which will use our mocked spawn
import { executeJobAsync, JOB_COMMANDS } from "./job-executor";

const DATA_DIR = join(process.cwd(), ".jobs-data");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

/**
 * Create a mock child process that can be controlled
 */
function createMockChildProcess(): {
  process: Partial<ChildProcess>;
  emit: (event: string, data?: unknown) => void;
  kill: ReturnType<typeof vi.fn>;
} {
  const eventHandlers: Record<string, ((data?: unknown) => void)[]> = {};
  const killMock = vi.fn();

  const process: Partial<ChildProcess> = {
    stdout: {
      on: (event: string, handler: (data: Buffer) => void) => {
        // eslint-disable-next-line security/detect-object-injection
        if (!eventHandlers[event]) eventHandlers[event] = [];
        // eslint-disable-next-line security/detect-object-injection
        eventHandlers[event]?.push(handler);
        return process.stdout as any;
      },
    } as any,
    stderr: {
      on: (event: string, handler: (data: Buffer) => void) => {
        // eslint-disable-next-line security/detect-object-injection
        if (!eventHandlers[event]) eventHandlers[event] = [];
        // eslint-disable-next-line security/detect-object-injection
        eventHandlers[event]?.push(handler);
        return process.stderr as any;
      },
    } as any,
    on: (event: string, handler: (data?: unknown) => void) => {
      // eslint-disable-next-line security/detect-object-injection
      if (!eventHandlers[event]) eventHandlers[event] = [];
      // eslint-disable-next-line security/detect-object-injection
      eventHandlers[event]?.push(handler);
      return process as any;
    },
    kill: killMock,
    killed: false,
    pid: 12345,
    unref: vi.fn(),
  };

  const emit = (event: string, data?: unknown) => {
    // eslint-disable-next-line security/detect-object-injection
    const handlers = eventHandlers[event] || [];
    handlers.forEach((handler) => handler(data));
  };

  return { process, emit, kill: killMock };
}

/**
 * Create a mock child process that properly simulates the `killed` property behavior.
 * The Node.js `killed` property is set to true when kill() is called, regardless of
 * whether the process has actually exited.
 */
function createRealisticMockChildProcess(): {
  process: Partial<ChildProcess>;
  emit: (event: string, data?: unknown) => void;
  kill: ReturnType<typeof vi.fn>;
} {
  const eventHandlers: Record<string, ((data?: unknown) => void)[]> = {};
  const killMock = vi.fn();

  const process: Partial<ChildProcess> = {
    stdout: {
      on: (event: string, handler: (data: Buffer) => void) => {
        // eslint-disable-next-line security/detect-object-injection
        if (!eventHandlers[event]) eventHandlers[event] = [];
        // eslint-disable-next-line security/detect-object-injection
        eventHandlers[event]?.push(handler);
        return process.stdout as any;
      },
    } as any,
    stderr: {
      on: (event: string, handler: (data: Buffer) => void) => {
        // eslint-disable-next-line security/detect-object-injection
        if (!eventHandlers[event]) eventHandlers[event] = [];
        // eslint-disable-next-line security/detect-object-injection
        eventHandlers[event]?.push(handler);
        return process.stderr as any;
      },
    } as any,
    on: (event: string, handler: (data?: unknown) => void) => {
      // eslint-disable-next-line security/detect-object-injection
      if (!eventHandlers[event]) eventHandlers[event] = [];
      // eslint-disable-next-line security/detect-object-injection
      eventHandlers[event]?.push(handler);
      return process as any;
    },
    kill: killMock,
    get killed() {
      // Mimic Node.js behavior: killed is true if kill() was called
      return killMock.mock.calls.length > 0;
    },
    pid: 12345,
    unref: vi.fn(),
  };

  const emit = (event: string, data?: unknown) => {
    // eslint-disable-next-line security/detect-object-injection
    const handlers = eventHandlers[event] || [];
    handlers.forEach((handler) => handler(data));
  };

  return { process, emit, kill: killMock };
}

describe("job-executor - timeout behavior", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    vi.clearAllMocks();
    // Clear console.error mock to avoid noise in tests
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Remove any JOB_TIMEOUT_MS env var override
    delete process.env.JOB_TIMEOUT_MS;
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
    vi.restoreAllMocks();
    delete process.env.JOB_TIMEOUT_MS;
  });

  describe("timeout configuration", () => {
    it("should use job-specific timeout for notion:fetch", () => {
      expect(JOB_COMMANDS["notion:fetch"].timeoutMs).toBe(5 * 60 * 1000); // 5 minutes
    });

    it("should use longer timeout for notion:fetch-all", () => {
      expect(JOB_COMMANDS["notion:fetch-all"].timeoutMs).toBe(60 * 60 * 1000); // 60 minutes
    });

    it("should use medium timeout for notion:translate", () => {
      expect(JOB_COMMANDS["notion:translate"].timeoutMs).toBe(30 * 60 * 1000); // 30 minutes
    });

    it("should use 5 minute timeout for notion:count-pages", () => {
      expect(JOB_COMMANDS["notion:count-pages"].timeoutMs).toBe(5 * 60 * 1000);
    });

    it("should use 5 minute timeout for status workflows", () => {
      expect(JOB_COMMANDS["notion:status-translation"].timeoutMs).toBe(
        5 * 60 * 1000
      );
      expect(JOB_COMMANDS["notion:status-draft"].timeoutMs).toBe(5 * 60 * 1000);
      expect(JOB_COMMANDS["notion:status-publish"].timeoutMs).toBe(
        5 * 60 * 1000
      );
      expect(JOB_COMMANDS["notion:status-publish-production"].timeoutMs).toBe(
        5 * 60 * 1000
      );
    });
  });

  describe("timeout execution", () => {
    it("should kill process with SIGTERM when timeout is reached", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      // Mock spawn to return our controlled process that never exits
      mockSpawn.mockReturnValue(mockChild.process);

      // Override timeout to 100ms for faster test
      process.env.JOB_TIMEOUT_MS = "100";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Wait for timeout to trigger (100ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify SIGTERM was sent
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should fail job if process doesn't emit close/error after SIGKILL", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      // Mock spawn to return our controlled process
      mockSpawn.mockReturnValue(mockChild.process);

      // Make kill() not actually mark process as killed
      mockChild.kill.mockImplementation((signal: string) => {
        // Don't update killed status - simulate unresponsive process
        return true;
      });

      // Override timeout to 100ms for faster test
      process.env.JOB_TIMEOUT_MS = "100";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Wait for timeout + SIGKILL delay + fail-safe delay (100ms + 5000ms + 1000ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 6300));

      // Verify both SIGTERM and SIGKILL were sent
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      // Verify fail-safe marks job as failed even without close/error events
      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.result?.error).toBe(
        "Job execution failed. Please check server logs for details."
      );
    });

    it("should send SIGKILL based on actual exit, not killed property", async () => {
      // This test verifies the fix for the timeout escalation bug.
      // The bug was that the code checked `childProcess.killed` which is true
      // as soon as kill() is called, not when the process actually exits.
      // The fix uses a dedicated `processExited` flag set by the close handler.

      const tracker = getJobTracker();
      const mockChild = createRealisticMockChildProcess();

      // Mock spawn to return our controlled process
      mockSpawn.mockReturnValue(mockChild.process);

      // Override timeout to 100ms for faster test
      process.env.JOB_TIMEOUT_MS = "100";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Wait for timeout + SIGKILL delay (100ms + 5000ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 5200));

      // With the fix, SIGKILL should be sent because processExited is false
      // (we never emitted a 'close' event)
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");

      // Verify the sequence: SIGTERM called before SIGKILL
      const sigtermCall = mockChild.kill.mock.calls.findIndex(
        (call) => call[0] === "SIGTERM"
      );
      const sigkillCall = mockChild.kill.mock.calls.findIndex(
        (call) => call[0] === "SIGKILL"
      );
      expect(sigtermCall).toBeGreaterThanOrEqual(0);
      expect(sigkillCall).toBeGreaterThan(sigtermCall);
    });

    it("should not send SIGKILL if process exits during grace period", async () => {
      // This test verifies that when a process exits after SIGTERM but before
      // the SIGKILL delay, no SIGKILL is sent.

      const tracker = getJobTracker();
      const mockChild = createRealisticMockChildProcess();

      // Mock spawn to return our controlled process
      mockSpawn.mockReturnValue(mockChild.process);

      // Override timeout to 100ms for faster test
      process.env.JOB_TIMEOUT_MS = "100";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Wait for timeout to trigger (just after 100ms)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // At this point SIGTERM has been sent (killed property is true)
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

      // Now simulate the process exiting gracefully during the grace period
      // (before the 5 second SIGKILL delay expires)
      mockChild.emit("close", 143); // 143 = SIGTERM exit code

      // Wait for the SIGKILL delay to pass (should NOT send SIGKILL now)
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Verify SIGKILL was NOT sent because process exited during grace period
      expect(mockChild.kill).not.toHaveBeenCalledWith("SIGKILL");

      // Verify job was marked as failed with timeout error
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "failed";
        },
        { timeout: 2000 }
      );

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.result?.error).toBe(
        "Job execution failed. Please check server logs for details."
      );
    });

    it("should not send SIGKILL if error event fires during timeout grace period", async () => {
      // This test verifies the fix for the critical bug where the error event
      // handler did not set processExited=true, causing SIGKILL to be sent
      // to already-dead processes when spawn fails during timeout escalation.

      const tracker = getJobTracker();
      const mockChild = createRealisticMockChildProcess();

      // Mock spawn to return our controlled process
      mockSpawn.mockReturnValue(mockChild.process);

      // Override timeout to 100ms for faster test
      process.env.JOB_TIMEOUT_MS = "100";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Wait for timeout to trigger (just after 100ms)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // At this point SIGTERM has been sent
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

      // Now simulate an error event firing during the grace period
      // (e.g., spawn fails, process disappears)
      mockChild.emit("error", new Error("Spawn failed"));

      // Wait for the SIGKILL delay to pass (should NOT send SIGKILL now)
      await new Promise((resolve) => setTimeout(resolve, 5100));

      // Verify SIGKILL was NOT sent because error event set processExited=true
      expect(mockChild.kill).not.toHaveBeenCalledWith("SIGKILL");

      // Verify job was marked as failed with error
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "failed";
        },
        { timeout: 2000 }
      );

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.result?.error).toBe(
        "Job execution failed. Please check server logs for details."
      );
    });

    it("should mark job as failed with timeout error message", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Override timeout to 100ms for faster test
      process.env.JOB_TIMEOUT_MS = "100";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Wait for timeout, then emit close event
      await new Promise((resolve) => setTimeout(resolve, 200));
      mockChild.emit("close", 143); // 143 = SIGTERM exit code

      // Wait for job to be marked as failed
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "failed";
        },
        { timeout: 2000 }
      );

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.result?.error).toBe(
        "Job execution failed. Please check server logs for details."
      );
    });

    it("should respect JOB_TIMEOUT_MS environment variable override", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set custom timeout
      process.env.JOB_TIMEOUT_MS = "200";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Before timeout - kill should not be called
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockChild.kill).not.toHaveBeenCalled();

      // After timeout - kill should be called
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("timeout clearing", () => {
    it("should clear timeout when job completes successfully", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set a longer timeout
      process.env.JOB_TIMEOUT_MS = "5000";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Complete job quickly
      mockChild.emit("close", 0);

      // Wait for job to be marked as completed
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "completed" || job?.status === "failed";
        },
        { timeout: 2000 }
      );

      // Wait a bit longer to ensure timeout doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Kill should not have been called since job completed
      expect(mockChild.kill).not.toHaveBeenCalled();
    });

    it("should clear timeout when job fails before timeout", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set a longer timeout
      process.env.JOB_TIMEOUT_MS = "5000";

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to start
      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Fail job quickly
      mockChild.emit("close", 1);

      // Wait for job to be marked as failed
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "failed";
        },
        { timeout: 2000 }
      );

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.result?.error).toBe(
        "Job execution failed. Please check server logs for details."
      );
    });
  });

  describe("different job type timeouts", () => {
    it("should use longer timeout for notion:fetch-all jobs", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Don't set JOB_TIMEOUT_MS - should use job-specific timeout
      const jobId = tracker.createJob("notion:fetch-all");
      executeJobAsync("notion:fetch-all", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // The default timeout for fetch-all is 60 minutes (3600000ms)
      // Verify it was configured correctly (we can't wait that long in a test)
      expect(JOB_COMMANDS["notion:fetch-all"].timeoutMs).toBe(60 * 60 * 1000);
    });

    it("should use shorter timeout for notion:status-draft jobs", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // The default timeout for status jobs is 5 minutes (300000ms)
      expect(JOB_COMMANDS["notion:status-draft"].timeoutMs).toBe(5 * 60 * 1000);
    });
  });

  describe("JOB_TIMEOUT_MS validation", () => {
    it("should fall back to job timeout when JOB_TIMEOUT_MS is NaN", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set invalid timeout (non-numeric)
      process.env.JOB_TIMEOUT_MS = "not-a-number";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "not-a-number" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should fall back to job timeout when JOB_TIMEOUT_MS is negative", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set invalid timeout (negative)
      process.env.JOB_TIMEOUT_MS = "-1000";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "-1000" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should fall back to job timeout when JOB_TIMEOUT_MS is zero", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set invalid timeout (zero)
      process.env.JOB_TIMEOUT_MS = "0";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "0" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should reject decimal JOB_TIMEOUT_MS and fall back to job timeout", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set timeout with decimal value - strict parsing should reject
      process.env.JOB_TIMEOUT_MS = "1000.5";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "1000.5" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs (fallback 5 minutes)
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should reject scientific notation JOB_TIMEOUT_MS and fall back to job timeout", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Strict parsing should reject scientific notation
      process.env.JOB_TIMEOUT_MS = "1e6";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "1e6" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs (fallback 5 minutes)
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should reject signed JOB_TIMEOUT_MS and fall back to job timeout", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Strict parsing should reject explicit plus signs
      process.env.JOB_TIMEOUT_MS = "+1000";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "+1000" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs (fallback 5 minutes)
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should fall back to job timeout when JOB_TIMEOUT_MS is Infinity", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set invalid timeout (Infinity string)
      process.env.JOB_TIMEOUT_MS = "Infinity";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JOB_TIMEOUT_MS: "Infinity" - must be positive integer'
      );

      // Wait to ensure no immediate timeout occurs
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should accept valid positive integer JOB_TIMEOUT_MS", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set valid timeout
      process.env.JOB_TIMEOUT_MS = "200";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // No warning should be logged
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // Before timeout - kill should not be called
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockChild.kill).not.toHaveBeenCalled();

      // After timeout - kill should be called
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

      consoleWarnSpy.mockRestore();
    });

    it("should cap JOB_TIMEOUT_MS to max bound when value is too large", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set timeout larger than max cap (2 hours)
      process.env.JOB_TIMEOUT_MS = "999999999";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'JOB_TIMEOUT_MS "999999999" exceeds max 7200000ms; capping to 7200000ms'
      );

      // Should not timeout quickly; capped timeout is still 2 hours
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(mockChild.kill).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it("should handle whitespace in JOB_TIMEOUT_MS", async () => {
      const tracker = getJobTracker();
      const mockChild = createMockChildProcess();

      mockSpawn.mockReturnValue(mockChild.process);

      // Set timeout with whitespace (parseInt handles this, but we should validate)
      process.env.JOB_TIMEOUT_MS = " 200 ";

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      await vi.waitFor(() => {
        expect(mockSpawn).toHaveBeenCalled();
      });

      // No warning should be logged (whitespace is valid for parseInt)
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      // After timeout - kill should be called
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");

      consoleWarnSpy.mockRestore();
    });
  });
});
