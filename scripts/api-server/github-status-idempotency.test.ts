/**
 * Tests for GitHub status idempotency and API integration
 * These tests verify that GitHub status updates are correct and idempotent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// eslint-disable-next-line import/no-unresolved
import { serve } from "bun";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import { executeJobAsync } from "./job-executor";
import {
  reportGitHubStatus,
  reportJobCompletion,
  type GitHubStatusOptions,
} from "./github-status";

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
    it("should report same job completion multiple times (not idempotent)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      // Report the same job completion twice
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

  describe("GitHub Context in Job Execution", () => {
    it("should not call GitHub status when context is not provided", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:status-draft");

      // Execute without GitHub context
      executeJobAsync("notion:status-draft", jobId, {}, undefined);

      // Wait for job to complete
      await vi.waitUntil(
        () =>
          tracker.getJob(jobId)?.status === "completed" ||
          tracker.getJob(jobId)?.status === "failed",
        { timeout: 5000 }
      );

      // GitHub status should not be called since no context was provided
      expect(mockFetch).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should call GitHub status when context is provided", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const tracker = getJobTracker();
      const jobId = tracker.createJob(
        "notion:status-draft",
        validGitHubContext
      );

      // Execute with GitHub context
      executeJobAsync("notion:status-draft", jobId, {}, validGitHubContext);

      // Wait for job to complete
      await vi.waitUntil(
        () =>
          tracker.getJob(jobId)?.status === "completed" ||
          tracker.getJob(jobId)?.status === "failed",
        { timeout: 5000 }
      );

      // GitHub status should be called
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
});
