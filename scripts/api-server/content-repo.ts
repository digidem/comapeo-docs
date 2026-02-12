import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  open,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const DEFAULT_CONTENT_BRANCH = "content";
const DEFAULT_WORKDIR = "/workspace/repo";
const DEFAULT_COMMIT_MESSAGE_PREFIX = "content-bot:";
const DEFAULT_ALLOW_EMPTY_COMMITS = false;
const LOCK_RETRY_MS = 200;
const MAX_LOCK_WAIT_MS = 30 * 60 * 1000; // 30 minutes

export interface ContentRepoConfig {
  repoUrl: string;
  contentBranch: string;
  token: string;
  authorName: string;
  authorEmail: string;
  workdir: string;
  commitMessagePrefix: string;
  allowEmptyCommits: boolean;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

class ContentRepoError extends Error {
  constructor(
    message: string,
    readonly details?: string
  ) {
    super(message);
    this.name = "ContentRepoError";
  }
}

let cachedConfig: ContentRepoConfig | null = null;

function requireEnv(name: string): string {
  // eslint-disable-next-line security/detect-object-injection
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ContentRepoError(
      `Missing required environment variable: ${name}`
    );
  }
  return value;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function buildRemoteUrl(repoUrl: string): string {
  if (!repoUrl.startsWith("https://")) {
    throw new ContentRepoError("GITHUB_REPO_URL must be an HTTPS URL");
  }

  const url = new URL(repoUrl);
  // Ensure credentials are never persisted to disk in .git/config
  url.username = "";
  url.password = "";
  return url.toString();
}

function getConfig(): ContentRepoConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: ContentRepoConfig = {
    repoUrl: requireEnv("GITHUB_REPO_URL"),
    contentBranch:
      process.env.GITHUB_CONTENT_BRANCH?.trim() || DEFAULT_CONTENT_BRANCH,
    token: requireEnv("GITHUB_TOKEN"),
    authorName: requireEnv("GIT_AUTHOR_NAME"),
    authorEmail: requireEnv("GIT_AUTHOR_EMAIL"),
    workdir: process.env.WORKDIR?.trim() || DEFAULT_WORKDIR,
    commitMessagePrefix:
      process.env.COMMIT_MESSAGE_PREFIX?.trim() ||
      DEFAULT_COMMIT_MESSAGE_PREFIX,
    allowEmptyCommits: parseBool(
      process.env.ALLOW_EMPTY_COMMITS,
      DEFAULT_ALLOW_EMPTY_COMMITS
    ),
  };

  cachedConfig = config;
  return config;
}

async function withAskPass<T>(
  token: string,
  callback: (env: NodeJS.ProcessEnv) => Promise<T>
): Promise<T> {
  const helperPath = resolve(tmpdir(), `git-askpass-${randomUUID()}.sh`);
  const script = `#!/usr/bin/env sh\ncase "$1" in\n  *Username*) echo "x-access-token" ;;\n  *Password*) printf "%s" "$GIT_ASKPASS_TOKEN" ;;\n  *) echo "" ;;\nesac\n`;

  await writeFile(helperPath, script, { mode: 0o700 });
  await chmod(helperPath, 0o700);

  try {
    return await callback({
      ...process.env,
      GIT_ASKPASS: helperPath,
      GIT_ASKPASS_TOKEN: token,
      GIT_TERMINAL_PROMPT: "0",
    });
  } finally {
    await rm(helperPath, { force: true });
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; errorPrefix: string }
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(new ContentRepoError(`${options.errorPrefix}: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new ContentRepoError(
          `${options.errorPrefix} (exit code ${code})`,
          stderr.trim() || stdout.trim()
        )
      );
    });
  });
}

async function runGit(
  args: string[],
  options: { cwd: string; auth?: boolean; errorPrefix: string }
): Promise<CommandResult> {
  const config = getConfig();

  if (options.auth) {
    return await withAskPass(config.token, async (authEnv) =>
      runCommand("git", args, {
        cwd: options.cwd,
        env: authEnv,
        errorPrefix: options.errorPrefix,
      })
    );
  }

  return await runCommand("git", args, {
    cwd: options.cwd,
    env: process.env,
    errorPrefix: options.errorPrefix,
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function initializeContentRepo(): Promise<void> {
  const config = getConfig();
  await mkdir(dirname(config.workdir), { recursive: true });

  const gitDir = resolve(config.workdir, ".git");
  const hasGitRepo = await pathExists(gitDir);

  if (!hasGitRepo) {
    if (await pathExists(config.workdir)) {
      const existingEntries = await readdir(config.workdir);
      if (existingEntries.length > 0) {
        throw new ContentRepoError(
          "WORKDIR exists and is not a git repository",
          `Cannot clone into non-empty directory: ${config.workdir}`
        );
      }
    }

    await runGit(
      [
        "clone",
        "--branch",
        config.contentBranch,
        "--single-branch",
        "--depth",
        "1",
        buildRemoteUrl(config.repoUrl),
        config.workdir,
      ],
      {
        cwd: dirname(config.workdir),
        auth: true,
        errorPrefix: "Failed to clone content branch",
      }
    );
  }

  await runGit(["config", "user.name", config.authorName], {
    cwd: config.workdir,
    errorPrefix: "Failed to configure git author name",
  });

  await runGit(["config", "user.email", config.authorEmail], {
    cwd: config.workdir,
    errorPrefix: "Failed to configure git author email",
  });

  await runGit(
    ["remote", "set-url", "origin", buildRemoteUrl(config.repoUrl)],
    {
      cwd: config.workdir,
      errorPrefix: "Failed to configure git origin",
    }
  );
}

async function acquireRepoLock(
  lockPath: string
): Promise<{ release: () => Promise<void> }> {
  const start = Date.now();

  while (true) {
    try {
      const lockFile = await open(lockPath, "wx");
      return {
        release: async () => {
          await lockFile.close();
          await rm(lockPath, { force: true });
        },
      };
    } catch {
      if (Date.now() - start > MAX_LOCK_WAIT_MS) {
        throw new ContentRepoError(
          "Timed out waiting for repository lock",
          `Lock file: ${lockPath}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

export interface GitTaskResult {
  output: string;
  noOp: boolean;
  commitSha?: string;
}

interface RunContentTaskOptions {
  shouldAbort?: () => boolean;
}

function assertNotAborted(shouldAbort?: () => boolean): void {
  if (shouldAbort?.()) {
    throw new ContentRepoError("Job cancelled by user");
  }
}

export async function runContentTask(
  taskName: string,
  requestId: string,
  taskRunner: (workdir: string) => Promise<string>,
  options: RunContentTaskOptions = {}
): Promise<GitTaskResult> {
  const config = getConfig();
  await mkdir(dirname(config.workdir), { recursive: true });

  const lock = await acquireRepoLock(
    resolve(
      dirname(config.workdir),
      `.${basename(config.workdir)}.content-repo.lock`
    )
  );

  try {
    await initializeContentRepo();

    assertNotAborted(options.shouldAbort);

    await runGit(["fetch", "origin", config.contentBranch], {
      cwd: config.workdir,
      auth: true,
      errorPrefix: "Failed to sync repository from origin",
    });

    assertNotAborted(options.shouldAbort);

    await runGit(
      [
        "checkout",
        "-B",
        config.contentBranch,
        `origin/${config.contentBranch}`,
      ],
      {
        cwd: config.workdir,
        errorPrefix: "Failed to checkout content branch",
      }
    );

    await runGit(["reset", "--hard", `origin/${config.contentBranch}`], {
      cwd: config.workdir,
      errorPrefix: "Failed to reset local repository",
    });

    assertNotAborted(options.shouldAbort);

    await runGit(["clean", "-fd"], {
      cwd: config.workdir,
      errorPrefix: "Failed to clean local repository",
    });

    assertNotAborted(options.shouldAbort);

    const output = await taskRunner(config.workdir);

    assertNotAborted(options.shouldAbort);

    const status = await runGit(["status", "--porcelain"], {
      cwd: config.workdir,
      errorPrefix: "Failed to inspect repository changes",
    });

    if (!status.stdout.trim() && !config.allowEmptyCommits) {
      return { output, noOp: true };
    }

    await runGit(["add", "-A"], {
      cwd: config.workdir,
      errorPrefix: "Failed to stage content changes",
    });

    const timestamp = new Date().toISOString();
    const commitMessage = `${config.commitMessagePrefix} ${taskName} ${timestamp} [${requestId}]`;

    const commitArgs = ["commit", "-m", commitMessage];
    if (config.allowEmptyCommits) {
      commitArgs.push("--allow-empty");
    }

    await runGit(commitArgs, {
      cwd: config.workdir,
      errorPrefix: "Failed to commit content changes",
    });

    assertNotAborted(options.shouldAbort);

    await runGit(["push", "origin", config.contentBranch], {
      cwd: config.workdir,
      auth: true,
      errorPrefix: "Failed to push content changes",
    });

    const commitSha = (
      await runGit(["rev-parse", "HEAD"], {
        cwd: config.workdir,
        errorPrefix: "Failed to determine commit SHA",
      })
    ).stdout.trim();

    return { output, noOp: false, commitSha };
  } finally {
    await lock.release();
  }
}

export function isContentMutatingJob(jobType: string): boolean {
  return (
    jobType === "notion:fetch" ||
    jobType === "notion:fetch-all" ||
    jobType === "notion:translate"
  );
}
