/**
 * GitHub status reporter for job completion callbacks
 * Reports job status to GitHub commits via the Status API
 */

interface GitHubStatusOptions {
  owner: string;
  repo: string;
  sha: string;
  token: string;
  context?: string;
  targetUrl?: string;
}

export type GitHubStatusState = "pending" | "success" | "failure" | "error";

interface GitHubStatusResponse {
  id: number;
  state: GitHubStatusState;
  description: string;
  context: string;
  creator: {
    login: string;
    id: number;
  };
  created_at: string;
  updated_at: string;
}

interface GitHubStatusError {
  message: string;
  documentation_url?: string;
}

/**
 * Report status to GitHub commit
 *
 * @param options - GitHub status options
 * @param state - Status state (pending, success, failure, error)
 * @param description - Human-readable description
 * @returns Promise with the status response
 */
export async function reportGitHubStatus(
  options: GitHubStatusOptions,
  state: GitHubStatusState,
  description: string
): Promise<GitHubStatusResponse> {
  const {
    owner,
    repo,
    sha,
    token,
    context = "comapeo-docs/job",
    targetUrl,
  } = options;

  const url = `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`;

  const body = {
    state,
    description: description.substring(0, 140), // GitHub limit
    context,
    target_url: targetUrl,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error: GitHubStatusError = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new GitHubStatusError(
      `GitHub API error: ${error.message}`,
      response.status,
      error
    );
  }

  return response.json() as Promise<GitHubStatusResponse>;
}

/**
 * Custom error for GitHub status API failures
 */
export class GitHubStatusError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly githubError?: GitHubStatusError
  ) {
    super(message);
    this.name = "GitHubStatusError";
  }

  /**
   * Check if error is retryable (rate limit, server error)
   */
  isRetryable(): boolean {
    return (
      this.statusCode === 403 ||
      this.statusCode === 429 ||
      this.statusCode >= 500
    );
  }
}

/**
 * Report job completion status to GitHub
 *
 * @param options - GitHub status options
 * @param success - Whether the job succeeded
 * @param jobType - Type of job that was executed
 * @param details - Additional details about the job result
 * @returns Promise with the status response
 */
export async function reportJobCompletion(
  options: GitHubStatusOptions,
  success: boolean,
  jobType: string,
  details?: {
    duration?: number;
    error?: string;
    output?: string;
  }
): Promise<GitHubStatusResponse | null> {
  const state: GitHubStatusState = success ? "success" : "failure";
  let description = success
    ? `Job ${jobType} completed successfully`
    : `Job ${jobType} failed`;

  if (details?.duration) {
    const duration = Math.round(details.duration);
    description += success ? ` in ${duration}ms` : ` after ${duration}ms`;
  }

  if (details?.error && !success) {
    description = `Job ${jobType} failed: ${details.error}`.substring(0, 140);
  }

  try {
    return await reportGitHubStatus(options, state, description);
  } catch (error) {
    // Log error but don't fail the job if GitHub status fails
    if (error instanceof GitHubStatusError) {
      console.error(
        `[GitHub Status] Failed to report status: ${error.message}`,
        error.githubError
      );
    } else {
      console.error(
        `[GitHub Status] Unexpected error reporting status:`,
        error
      );
    }
    return null;
  }
}

/**
 * Extract GitHub context from environment variables
 *
 * Expected environment variables:
 * - GITHUB_TOKEN: GitHub personal access token
 * - GITHUB_REPOSITORY: owner/repo format (e.g., "digidem/comapeo-docs")
 * - GITHUB_SHA: Commit SHA to report status on
 *
 * @returns GitHub status options or null if missing required values
 */
export function getGitHubContextFromEnv(): GitHubStatusOptions | null {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;

  if (!token || !repository || !sha) {
    return null;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    console.error(
      `[GitHub Status] Invalid GITHUB_REPOSITORY format: ${repository}`
    );
    return null;
  }

  return {
    owner,
    repo,
    sha,
    token,
    context: process.env.GITHUB_STATUS_CONTEXT || "comapeo-docs/job",
  };
}

/**
 * Validate GitHub status options
 */
export function validateGitHubOptions(
  options: GitHubStatusOptions | null
): options is GitHubStatusOptions {
  if (!options) {
    return false;
  }

  const { owner, repo, sha, token } = options;

  if (!owner || !repo || !sha || !token) {
    console.error(
      "[GitHub Status] Missing required options: owner, repo, sha, token"
    );
    return false;
  }

  // Validate SHA format (40 character hex or abbreviated)
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) {
    console.error(`[GitHub Status] Invalid SHA format: ${sha}`);
    return false;
  }

  return true;
}
