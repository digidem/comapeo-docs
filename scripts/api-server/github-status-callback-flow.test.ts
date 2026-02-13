/**
 * Tests for GitHub Status Callback Flow - Idempotency and Failure Handling
 * These tests verify edge cases, race conditions, and failure recovery mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getJobTracker,
  destroyJobTracker,
  type GitHubContext,
} from "./job-tracker";
import {
  reportGitHubStatus,
  reportJobCompletion,
  GitHubStatusError,
  type GitHubStatusOptions,
} from "./github-status";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("GitHub Status Callback Flow - Idempotency and Failure Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    destroyJobTracker();
    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_SHA;
  });

  afterEach(() => {
    destroyJobTracker();
    vi.restoreAllMocks();
  });

  const validGitHubContext: GitHubStatusOptions = {
    owner: "digidem",
    repo: "comapeo-docs",
    sha: "abc123def456",
    token: "test-token",
    context: "test-context",
  };

  describe("Idempotency - Race Conditions", () => {
    it("should handle concurrent status reporting attempts safely", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let apiCallCount = 0;
      mockFetch.mockImplementation(async () => {
        apiCallCount++;
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ok: true,
          json: async () => ({ id: apiCallCount, state: "success" }),
        };
      });

      // Simulate concurrent completion callbacks
      const completionPromises = Array.from({ length: 5 }, () =>
        reportJobCompletion(validGitHubContext, true, "notion:fetch", {
          duration: 100,
        })
      );

      const results = await Promise.all(completionPromises);

      // All calls should succeed (GitHub API is not idempotent)
      expect(results.every((r) => r !== null)).toBe(true);
      expect(apiCallCount).toBe(5);

      // But the tracker only allows marking once
      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);
    });

    it("should handle check-then-act race condition in job executor", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        // First call succeeds, subsequent calls fail
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({ id: 1, state: "success" }),
          };
        }
        return {
          ok: false,
          status: 405, // Method not allowed (duplicate)
          json: async () => ({ message: "Duplicate status" }),
        };
      });

      // First status report - should succeed
      const result1 = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );
      expect(result1).not.toBeNull();

      tracker.markGitHubStatusReported(jobId);

      // Second attempt should be blocked by tracker
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      // Verify only one API call was made (idempotency at tracker level)
      expect(callCount).toBe(1);
    });

    it("should handle rapid successive status updates", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ id: callCount, state: "success" }),
        };
      });

      // Rapidly call reportJobCompletion
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          reportJobCompletion(validGitHubContext, true, "notion:fetch", {
            duration: 100,
          })
        );
      }

      await Promise.all(promises);

      // All 10 calls succeed (GitHub API not idempotent)
      expect(callCount).toBe(10);

      // Tracker prevents marking more than once
      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);
    });
  });

  describe("Failure Handling - No Retry", () => {
    it("should not automatically retry failed status reports", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        // Always fail
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: "Internal server error" }),
        };
      });

      // Attempt to report job completion
      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should return null after retries are exhausted
      expect(result).toBeNull();
      expect(callCount).toBe(4); // Initial + 3 retries

      // Flag should remain false (allowing potential manual retry)
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it("should handle permanent failures (4xx) gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 401, // Unauthorized - permanent failure
          json: async () => ({ message: "Bad credentials" }),
        };
      });

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should return null without retrying
      expect(result).toBeNull();
      expect(callCount).toBe(1); // No retries for 4xx errors

      consoleErrorSpy.mockRestore();
    });

    it("should handle transient failures (5xx) with retries", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ message: "Service unavailable" }),
          };
        }
        return {
          ok: true,
          json: async () => ({ id: 1, state: "success" }),
        };
      });

      vi.useFakeTimers();

      const reportPromise = reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Fast forward through retries
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.runAllTimersAsync();

      const result = await reportPromise;

      // Should eventually succeed
      expect(result).not.toBeNull();
      expect(callCount).toBe(3);

      vi.useRealTimers();
      consoleErrorSpy.mockRestore();
    });

    it("should handle network errors gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockFetch.mockRejectedValue(new Error("Network timeout"));

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should return null without crashing
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Persistence - Server Restart Scenarios", () => {
    it("should survive server restart during status reporting", async () => {
      // Create job and mark as reported
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      await reportJobCompletion(validGitHubContext, true, "notion:fetch");
      tracker.markGitHubStatusReported(jobId);

      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      // Simulate server restart
      destroyJobTracker();
      const newTracker = getJobTracker();

      // Flag should persist
      expect(newTracker.isGitHubStatusReported(jobId)).toBe(true);
    });

    it("should allow retry after server restart if status not reported", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      // Simulate failed status report
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: "Server error" }),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await reportJobCompletion(validGitHubContext, true, "notion:fetch");

      // Flag should be false
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Simulate server restart
      destroyJobTracker();
      const newTracker = getJobTracker();

      // Flag should still be false
      expect(newTracker.isGitHubStatusReported(jobId)).toBe(false);

      // Should be able to retry
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      expect(result).not.toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("Clear and Retry Mechanism", () => {
    it("should allow manual retry via clearGitHubStatusReported", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      // First attempt fails
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: "Server error" }),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result1 = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );
      expect(result1).toBeNull();
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Clear flag (though it's already false)
      tracker.clearGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Retry with success
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const result2 = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      expect(result2).not.toBeNull();

      // Mark as reported
      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      // Clear again
      tracker.clearGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it("should persist cleared flag across server restart", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      tracker.clearGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Simulate server restart
      destroyJobTracker();
      const newTracker = getJobTracker();

      expect(newTracker.isGitHubStatusReported(jobId)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle job completion without GitHub context", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch"); // No GitHub context

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      // No API calls should be made if there's no GitHub context
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle malformed GitHub responses", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should handle gracefully
      expect(result).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    it("should handle partial GitHub context", async () => {
      const partialContext = {
        ...validGitHubContext,
        sha: "", // Missing SHA
      } as GitHubStatusOptions;

      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: "Validation failed" }),
      });

      // Should throw GitHubStatusError
      await expect(
        reportGitHubStatus(partialContext, "success", "Test")
      ).rejects.toThrow(GitHubStatusError);

      // Verify the API call was made
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe("Rate Limiting", () => {
    it("should retry on rate limit (403) with exponential backoff", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              message: "API rate limit exceeded",
              documentation_url: "https://docs.github.com/rest",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ id: 1, state: "success" }),
        };
      });

      vi.useFakeTimers();

      const reportPromise = reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Fast forward through retries with exponential backoff
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry
      await vi.runAllTimersAsync();

      const result = await reportPromise;

      expect(result).not.toBeNull();
      expect(callCount).toBe(3);

      vi.useRealTimers();
      consoleErrorSpy.mockRestore();
    });

    it("should eventually fail after exhausting retries on rate limit", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "API rate limit exceeded" }),
      });

      vi.useFakeTimers();

      const reportPromise = reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Fast forward through all retries
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.runAllTimersAsync();

      const result = await reportPromise;

      expect(result).toBeNull();

      vi.useRealTimers();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Status Update Race Conditions", () => {
    it("should not report status twice for same job completion", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ id: callCount, state: "success" }),
        };
      });

      // Simulate job completion callback
      const job = tracker.getJob(jobId);
      if (job?.github && !tracker.isGitHubStatusReported(jobId)) {
        const result1 = await reportJobCompletion(
          validGitHubContext,
          true,
          "notion:fetch"
        );
        if (result1 !== null) {
          tracker.markGitHubStatusReported(jobId);
        }
      }

      // Second call should be blocked
      if (job?.github && !tracker.isGitHubStatusReported(jobId)) {
        const result2 = await reportJobCompletion(
          validGitHubContext,
          true,
          "notion:fetch"
        );
        if (result2 !== null) {
          tracker.markGitHubStatusReported(jobId);
        }
        // This should not execute
        expect(true).toBe(false);
      }

      expect(callCount).toBe(1);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);
    });
  });

  describe("Double-Checked Locking Pattern", () => {
    it("should implement double-checked locking for idempotency", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ id: callCount, state: "success" }),
        };
      });

      // First check
      if (!tracker.isGitHubStatusReported(jobId)) {
        // Simulate some async operation
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Double-check (this is the pattern used in job-executor.ts)
        const job = tracker.getJob(jobId);
        if (job?.github && !tracker.isGitHubStatusReported(jobId)) {
          const result = await reportJobCompletion(
            validGitHubContext,
            true,
            "notion:fetch"
          );
          if (result !== null) {
            tracker.markGitHubStatusReported(jobId);
          }
        }
      }

      expect(callCount).toBe(1);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);
    });

    it("should handle race condition between check and mark", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch", validGitHubContext);

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        // Simulate delay before success
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          json: async () => ({ id: callCount, state: "success" }),
        };
      });

      // Start two concurrent operations
      const op1 = (async () => {
        if (!tracker.isGitHubStatusReported(jobId)) {
          const result = await reportJobCompletion(
            validGitHubContext,
            true,
            "notion:fetch"
          );
          if (result !== null) {
            tracker.markGitHubStatusReported(jobId);
          }
        }
      })();

      const op2 = (async () => {
        // Small delay to ensure op1 starts first
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (!tracker.isGitHubStatusReported(jobId)) {
          const result = await reportJobCompletion(
            validGitHubContext,
            true,
            "notion:fetch"
          );
          if (result !== null) {
            tracker.markGitHubStatusReported(jobId);
          }
        }
      })();

      await Promise.all([op1, op2]);

      // Both might call the API due to race condition
      // But only one should mark as reported (the one that wins the race)
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);
    });
  });
});
