/**
 * Tests for GitHub status reporter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  reportGitHubStatus,
  reportJobCompletion,
  GitHubStatusError,
  validateGitHubOptions,
  getGitHubContextFromEnv,
  type GitHubStatusOptions,
} from "./github-status";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("github-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_STATUS_CONTEXT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("reportGitHubStatus", () => {
    const validOptions: GitHubStatusOptions = {
      owner: "digidem",
      repo: "comapeo-docs",
      sha: "abc123def456",
      token: "test-token",
    };

    it("should report success status to GitHub", async () => {
      const mockResponse = {
        id: 12345,
        state: "success",
        description: "Test completed successfully",
        context: "comapeo-docs/job",
        creator: { login: "test-user", id: 67890 },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await reportGitHubStatus(
        validOptions,
        "success",
        "Test completed successfully"
      );

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/digidem/comapeo-docs/statuses/abc123def456",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          }),
          body: expect.stringContaining('"state":"success"'),
        })
      );
    });

    it("should report failure status to GitHub", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12346, state: "failure" }),
      });

      const result = await reportGitHubStatus(
        validOptions,
        "failure",
        "Test failed"
      );

      expect(result.state).toBe("failure");
    });

    it("should include custom context if provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12347, state: "success" }),
      });

      await reportGitHubStatus(
        { ...validOptions, context: "custom-context" },
        "success",
        "Test"
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.context).toBe("custom-context");
    });

    it("should include target URL if provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12348, state: "success" }),
      });

      await reportGitHubStatus(
        { ...validOptions, targetUrl: "https://example.com/build/123" },
        "success",
        "Test"
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.target_url).toBe("https://example.com/build/123");
    });

    it("should truncate description to 140 characters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 12349, state: "success" }),
      });

      const longDescription = "a".repeat(200);
      await reportGitHubStatus(validOptions, "success", longDescription);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description.length).toBeLessThanOrEqual(140);
    });

    it("should throw GitHubStatusError on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Bad credentials" }),
      });

      await expect(
        reportGitHubStatus(validOptions, "success", "Test")
      ).rejects.toThrow(GitHubStatusError);
    });

    it("should handle malformed API error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      await expect(
        reportGitHubStatus(validOptions, "success", "Test")
      ).rejects.toThrow(GitHubStatusError);
    });
  });

  describe("GitHubStatusError", () => {
    it("should identify retryable errors correctly", () => {
      const rateLimitError = new GitHubStatusError("Rate limited", 429);
      expect(rateLimitError.isRetryable()).toBe(true);

      const serverError = new GitHubStatusError("Server error", 500);
      expect(serverError.isRetryable()).toBe(true);

      const clientError = new GitHubStatusError("Not found", 404);
      expect(clientError.isRetryable()).toBe(false);
    });
  });

  describe("reportJobCompletion", () => {
    const validOptions: GitHubStatusOptions = {
      owner: "digidem",
      repo: "comapeo-docs",
      sha: "abc123",
      token: "test-token",
    };

    it("should report successful job completion", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, state: "success" }),
      });

      const result = await reportJobCompletion(
        validOptions,
        true,
        "notion:fetch"
      );

      expect(result).toBeDefined();
      expect(result?.state).toBe("success");
    });

    it("should report failed job completion", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 2, state: "failure" }),
      });

      const result = await reportJobCompletion(
        validOptions,
        false,
        "notion:fetch"
      );

      expect(result).toBeDefined();
      expect(result?.state).toBe("failure");
    });

    it("should include duration in description when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 3, state: "success" }),
      });

      await reportJobCompletion(validOptions, true, "notion:fetch", {
        duration: 1500,
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description).toContain("1500ms");
    });

    it("should include error in description when job fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 4, state: "failure" }),
      });

      await reportJobCompletion(validOptions, false, "notion:fetch", {
        error: "Connection failed",
      });

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.description).toContain("failed");
      expect(body.description).toContain("Connection failed");
    });

    it("should return null on GitHub API failure without throwing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Unauthorized" }),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await reportJobCompletion(
        validOptions,
        true,
        "notion:fetch"
      );

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("should return null on unexpected error without throwing", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await reportJobCompletion(
        validOptions,
        true,
        "notion:fetch"
      );

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("getGitHubContextFromEnv", () => {
    it("should return options when all env vars are set", () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "digidem/comapeo-docs";
      process.env.GITHUB_SHA = "abc123def456";

      const result = getGitHubContextFromEnv();

      expect(result).toEqual({
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "abc123def456",
        token: "test-token",
        context: "comapeo-docs/job",
      });
    });

    it("should use custom context from env var", () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "digidem/comapeo-docs";
      process.env.GITHUB_SHA = "abc123";
      process.env.GITHUB_STATUS_CONTEXT = "my-custom-context";

      const result = getGitHubContextFromEnv();

      expect(result?.context).toBe("my-custom-context");
    });

    it("should return null when required env vars are missing", () => {
      process.env.GITHUB_TOKEN = "test-token";
      // Missing GITHUB_REPOSITORY and GITHUB_SHA

      const result = getGitHubContextFromEnv();

      expect(result).toBeNull();
    });

    it("should return null for invalid repository format", () => {
      process.env.GITHUB_TOKEN = "test-token";
      process.env.GITHUB_REPOSITORY = "invalid-format";
      process.env.GITHUB_SHA = "abc123";

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = getGitHubContextFromEnv();

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("validateGitHubOptions", () => {
    it("should return true for valid options", () => {
      const options: GitHubStatusOptions = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "abc123def456",
        token: "test-token",
      };

      expect(validateGitHubOptions(options)).toBe(true);
    });

    it("should return false for null options", () => {
      expect(validateGitHubOptions(null)).toBe(false);
    });

    it("should return false when required fields are missing", () => {
      const invalidOptions = {
        owner: "digidem",
        // missing repo, sha, token
      } as unknown as GitHubStatusOptions;

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(validateGitHubOptions(invalidOptions)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("should return false for invalid SHA format", () => {
      const invalidOptions: GitHubStatusOptions = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "invalid-sha!",
        token: "test-token",
      };

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(validateGitHubOptions(invalidOptions)).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("should accept abbreviated SHA (7 characters)", () => {
      const options: GitHubStatusOptions = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "abc123d",
        token: "test-token",
      };

      expect(validateGitHubOptions(options)).toBe(true);
    });

    it("should accept full 40 character SHA", () => {
      const options: GitHubStatusOptions = {
        owner: "digidem",
        repo: "comapeo-docs",
        sha: "a".repeat(40),
        token: "test-token",
      };

      expect(validateGitHubOptions(options)).toBe(true);
    });
  });
});
