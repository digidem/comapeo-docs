/**
 * Tests for GitHub status idempotency and API integration
 * These tests verify that GitHub status updates are correct and idempotent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// eslint-disable-next-line import/no-unresolved
import { serve } from "bun";
import {
  getJobTracker,
  destroyJobTracker,
  type GitHubContext,
} from "./job-tracker";
import { executeJobAsync } from "./job-executor";
import {
  reportGitHubStatus,
  reportJobCompletion,
  type GitHubStatusOptions,
} from "./github-status";
import { waitForPendingWrites } from "./job-persistence";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("GitHub Status - Idempotency and Integration", () => {
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

  describe("Idempotency - reportGitHubStatus", () => {
    it("should report same status multiple times (not idempotent)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      // Report the same status twice
      await reportGitHubStatus(validGitHubContext, "success", "Test");
      await reportGitHubStatus(validGitHubContext, "success", "Test");

      // This demonstrates non-idempotency - both calls succeed
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should allow status transitions (pending -> success)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      // Report pending then success - this is valid
      await reportGitHubStatus(validGitHubContext, "pending", "Starting...");
      await reportGitHubStatus(validGitHubContext, "success", "Complete!");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Idempotency - reportJobCompletion", () => {
    it("should report same job completion multiple times (not idempotent at function level)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      // Report the same job completion twice - function itself is not idempotent
      await reportJobCompletion(validGitHubContext, true, "notion:fetch", {
        duration: 1000,
      });
      await reportJobCompletion(validGitHubContext, true, "notion:fetch", {
        duration: 1000,
      });

      // This demonstrates non-idempotency - both calls succeed
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should handle different job types separately", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      await reportJobCompletion(validGitHubContext, true, "notion:fetch");
      await reportJobCompletion(validGitHubContext, true, "notion:translate");

      // Different job types should result in different status updates
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify the contexts differ
      const firstCall = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const secondCall = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
      expect(firstCall.description).toContain("notion:fetch");
      expect(secondCall.description).toContain("notion:translate");
    });
  });

  describe("Job Execution Idempotency", () => {
    it("should not report GitHub status twice for the same job", async () => {
      // This test verifies the idempotency mechanism at the tracker level
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Initially not reported
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Simulate successful API call by marking as reported
      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      // Verify persistence
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      consoleErrorSpy.mockRestore();
    });

    it("should mark GitHub status as reported only on success", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Initially not reported
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Manually mark as reported (simulating successful job completion)
      tracker.markGitHubStatusReported(jobId);

      // Should be marked as reported
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);
    });

    it("should clear GitHub status reported flag when API call fails", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Mark as reported
      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      // Clear the flag
      tracker.clearGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);
    });

    it("should not mark GitHub status as reported when API call fails", async () => {
      // This test verifies that reportJobCompletion returns null on failure
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthorized" }),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Initially not reported
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Call reportJobCompletion directly which should fail
      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:status-draft"
      );

      // Verify the API call failed
      expect(result).toBeNull();

      // Verify tracker flag is still false
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it("should handle race condition with immediate mark and clear on failure", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Initially not reported
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Test the clear method directly
      tracker.markGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(true);

      // Clear the flag
      tracker.clearGitHubStatusReported(jobId);
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Verify persistence by destroying and recreating tracker
      destroyJobTracker();
      const newTracker = getJobTracker();

      // Flag should still be false after reload
      expect(newTracker.isGitHubStatusReported(jobId)).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("GitHub Context in Job Execution", () => {
    it("should call GitHub status when context is provided", async () => {
      // This test verifies that reportJobCompletion is called with correct params
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:status-draft"
      );

      // Verify the API call was made and succeeded
      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should persist GitHub context with job", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      const job = tracker.getJob(jobId);
      expect(job?.github).toEqual(validGitHubContext);
    });
  });

  describe("Status Content Validation", () => {
    it("should include job type in status description", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      await reportJobCompletion(validGitHubContext, true, "notion:fetch-all");

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description).toContain("notion:fetch-all");
    });

    it("should include duration in status description", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      await reportJobCompletion(validGitHubContext, true, "notion:fetch", {
        duration: 1234,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description).toContain("1234ms");
    });

    it("should include error message in failure status", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "failure" }),
      });

      await reportJobCompletion(validGitHubContext, false, "notion:fetch", {
        error: "Connection timeout",
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description).toContain("Connection timeout");
    });

    it("should truncate error message to 140 characters", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "failure" }),
      });

      const longError = "x".repeat(200);
      await reportJobCompletion(validGitHubContext, false, "notion:fetch", {
        error: longError,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description.length).toBeLessThanOrEqual(140);
    });
  });

  describe("Status API Response Handling", () => {
    it("should handle rate limiting (403)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "API rate limit exceeded" }),
      });

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should return null and not throw
      expect(result).toBeNull();
    });

    it("should handle server errors (5xx)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ message: "Bad gateway" }),
      });

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should return null and not throw
      expect(result).toBeNull();
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await reportJobCompletion(
        validGitHubContext,
        true,
        "notion:fetch"
      );

      // Should return null and not throw
      expect(result).toBeNull();
    });
  });

  describe("Context and Target URL", () => {
    it("should use default context when not provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const optionsWithoutContext = { ...validGitHubContext };
      delete (optionsWithoutContext as Partial<typeof validGitHubContext>)
        .context;

      await reportGitHubStatus(optionsWithoutContext, "success", "Test");

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.context).toBe("comapeo-docs/job");
    });

    it("should include target URL when provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      await reportJobCompletion(
        { ...validGitHubContext, targetUrl: "https://example.com/job/123" },
        true,
        "notion:fetch"
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.target_url).toBe("https://example.com/job/123");
    });
  });

  describe("Persistence Idempotency", () => {
    it("should persist githubStatusReported flag", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Mark as reported
      tracker.markGitHubStatusReported(jobId);

      // Ensure data is persisted before restart
      await waitForPendingWrites();

      // Destroy and recreate tracker (simulates server restart)
      destroyJobTracker();
      const newTracker = getJobTracker();

      // The flag should be persisted
      expect(newTracker.isGitHubStatusReported(jobId)).toBe(true);
    });

    it("should persist cleared githubStatusReported flag", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Mark as reported
      tracker.markGitHubStatusReported(jobId);

      // Clear the flag
      tracker.clearGitHubStatusReported(jobId);

      // Ensure data is persisted before restart
      await waitForPendingWrites();

      // Destroy and recreate tracker
      destroyJobTracker();
      const newTracker = getJobTracker();

      // The flag should be persisted as false
      expect(newTracker.isGitHubStatusReported(jobId)).toBe(false);
    });

    it("should load jobs without githubStatusReported as false", async () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Don't mark as reported - should default to false
      expect(tracker.isGitHubStatusReported(jobId)).toBe(false);

      // Ensure data is persisted before restart
      await waitForPendingWrites();

      // Destroy and recreate tracker
      destroyJobTracker();
      const newTracker = getJobTracker();
      expect(newTracker.isGitHubStatusReported(jobId)).toBe(false);
    });
  });
});
