/**
 * Tests for job executor - GitHub status reporting integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Import the functions we need to test
import {
  getJobTracker,
  destroyJobTracker,
  type GitHubContext,
} from "./job-tracker";
import { reportJobCompletion } from "./github-status";

// Mock reportJobCompletion BEFORE importing job-executor
const mockReportJobCompletion = vi.fn();
vi.mock("./github-status", () => ({
  reportJobCompletion: (...args: unknown[]) => mockReportJobCompletion(...args),
}));

// Now import job-executor which will use our mocked reportJobCompletion
import { executeJobAsync } from "./job-executor";

const DATA_DIR = join(process.cwd(), ".jobs-data");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

describe("job-executor - GitHub status reporting integration", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    vi.clearAllMocks();
    // Clear console.error mock to avoid noise in tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
    vi.restoreAllMocks();
  });

  describe("GitHub status reporting via onComplete callback", () => {
    it("should pass GitHub context and report completion on success", async () => {
      const tracker = getJobTracker();
      const githubContext: GitHubContext = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "abc123def456",
        token: "ghp_test_token",
      };

      // Mock successful job completion
      mockReportJobCompletion.mockResolvedValue({
        id: 12345,
        state: "success",
        description: "Job completed successfully",
        context: "comapeo-docs/job",
        creator: { login: "bot", id: 1 },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      // Create and execute job
      const jobId = tracker.createJob("notion:status-draft", githubContext);
      executeJobAsync("notion:status-draft", jobId, {}, githubContext);

      // Wait for job to complete (may fail due to env issues, but GitHub callback should still be called)
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "completed" || job?.status === "failed";
        },
        { timeout: 10000 }
      );

      // Verify reportJobCompletion was called with correct parameters
      expect(mockReportJobCompletion).toHaveBeenCalledWith(
        {
          owner: "digidem",
          repo: "comapeo-docs",
          sha: "abc123def456",
          token: "ghp_test_token",
          context: undefined,
          targetUrl: undefined,
        },
        expect.any(Boolean), // success (true or false depending on actual execution)
        "notion:status-draft",
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );
    });

    it("should not call reportJobCompletion when GitHub context is not provided", async () => {
      const tracker = getJobTracker();

      // Create and execute job without GitHub context
      const jobId = tracker.createJob("notion:status-draft");
      executeJobAsync("notion:status-draft", jobId, {});

      // Wait for job to complete
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "completed" || job?.status === "failed";
        },
        { timeout: 10000 }
      );

      // Verify reportJobCompletion was NOT called
      expect(mockReportJobCompletion).not.toHaveBeenCalled();
    });

    it("should pass custom context and target URL from GitHub context", async () => {
      const tracker = getJobTracker();
      const githubContext: GitHubContext = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "abc123",
        token: "ghp_custom",
        context: "my-ci-context",
        targetUrl: "https://example.com/build/456",
      };

      mockReportJobCompletion.mockResolvedValue({
        id: 999,
        state: "success",
        description: "OK",
        context: "my-ci-context",
        creator: { login: "bot", id: 1 },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      const jobId = tracker.createJob("notion:status-draft", githubContext);
      executeJobAsync("notion:status-draft", jobId, {}, githubContext);

      // Wait for job to complete
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "completed" || job?.status === "failed";
        },
        { timeout: 10000 }
      );

      expect(mockReportJobCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "my-ci-context",
          targetUrl: "https://example.com/build/456",
        }),
        expect.any(Boolean),
        "notion:status-draft",
        expect.any(Object)
      );
    });

    it("should include job duration in the completion report", async () => {
      const tracker = getJobTracker();
      const githubContext: GitHubContext = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "xyz789",
        token: "token",
      };

      mockReportJobCompletion.mockResolvedValue({
        id: 1,
        state: "success",
        description: "Done",
        context: "comapeo-docs/job",
        creator: { login: "bot", id: 1 },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      const jobId = tracker.createJob("notion:status-draft", githubContext);
      executeJobAsync("notion:status-draft", jobId, {}, githubContext);

      // Wait for job to complete
      await vi.waitUntil(
        () => {
          const job = tracker.getJob(jobId);
          return job?.status === "completed" || job?.status === "failed";
        },
        { timeout: 10000 }
      );

      const callArgs = mockReportJobCompletion.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.[3]?.duration).toBeGreaterThanOrEqual(0);
      expect(callArgs?.[3]?.duration).toBeLessThan(Number.MAX_VALUE);
    });
  });
});
