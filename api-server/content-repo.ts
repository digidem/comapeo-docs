import { spawn } from "node:child_process";
import {
  chmod,
  cp,
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
const DEFAULT_WORKDIR = "/app";
const DEFAULT_COMMIT_MESSAGE_PREFIX = "content-bot:";
const DEFAULT_ALLOW_EMPTY_COMMITS = false;
const LOCK_RETRY_MS = 200;
const MAX_LOCK_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const STALE_LOCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const GENERATED_PATH_SPECS = ["docs/", "i18n/", "static/images/"] as const;

type ContentRepoErrorCode =
  | "DIRTY_WORKING_TREE"
  | "PUSH_FAILED"
  | "CONTENT_GENERATION_FAILED"
  | "BRANCH_MISSING"
  | "JOB_TIMEOUT";

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

export class ContentRepoError extends Error {
  constructor(
    message: string,
    readonly details?: string,
    readonly code?: ContentRepoErrorCode
  ) {
    super(message);
    this.name = "ContentRepoError";
  }
}

let cachedConfig: ContentRepoConfig | null = null;
let initPromise: Promise<void> | null = null;

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

export async function isContentRepoWorkingTreeDirty(): Promise<boolean> {
  const config = getConfig();
  const gitDir = resolve(config.workdir, ".git");
  if (!(await pathExists(gitDir))) {
    return false;
  }

  const status = await runGit(["status", "--porcelain"], {
    cwd: config.workdir,
    errorPrefix: "Failed to inspect repository status",
  });

  return status.stdout.trim().length > 0;
}

function isGitExitCode(error: unknown, code: number): boolean {
  if (!(error instanceof ContentRepoError)) {
    return false;
  }
  return error.message.includes(`exit code ${code}`);
}

async function restoreAndCleanGeneratedPaths(workdir: string): Promise<void> {
  try {
    await runGit(
      [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        ...GENERATED_PATH_SPECS,
      ],
      {
        cwd: workdir,
        errorPrefix: "Failed to restore generated paths",
      }
    );
  } catch {
    // Best effort to restore tracked generated files.
  }

  try {
    await runGit(["clean", "-fd", ...GENERATED_PATH_SPECS], {
      cwd: workdir,
      errorPrefix: "Failed to clean generated paths",
    });
  } catch {
    // Best effort to clean untracked generated files.
  }
}

async function ensureRemoteContentBranchExists(workdir: string): Promise<void> {
  try {
    await runGit(["rev-parse", "--verify", "refs/remotes/origin/content"], {
      cwd: workdir,
      errorPrefix: "origin/content branch not found",
    });
  } catch {
    throw new ContentRepoError(
      "origin/content branch does not exist. Bootstrap it manually: `git push origin main:content`",
      undefined,
      "BRANCH_MISSING"
    );
  }
}

async function deleteGeneratedPathsForFullSync(workdir: string): Promise<void> {
  await rm(resolve(workdir, "docs"), { recursive: true, force: true });
  await rm(resolve(workdir, "static", "images"), {
    recursive: true,
    force: true,
  });

  const i18nRoot = resolve(workdir, "i18n");
  if (!(await pathExists(i18nRoot))) {
    return;
  }

  const locales = await readdir(i18nRoot);
  await Promise.all(
    locales.map(async (locale) => {
      await rm(resolve(i18nRoot, locale, "docusaurus-plugin-content-docs"), {
        recursive: true,
        force: true,
      });
    })
  );
}

export async function assertCleanWorkingTree(force: boolean): Promise<void> {
  await initializeContentRepo();
  const config = getConfig();
  const status = await runGit(["status", "--porcelain"], {
    cwd: config.workdir,
    errorPrefix: "Failed to inspect repository status",
  });
  if (!status.stdout.trim()) {
    return;
  }

  if (!force) {
    throw new ContentRepoError(
      "Working tree is dirty. Re-run with force=true to clean generated paths only.",
      status.stdout.trim(),
      "DIRTY_WORKING_TREE"
    );
  }

  await restoreAndCleanGeneratedPaths(config.workdir);
}

export async function prepareContentBranchForFetch(
  mode: "fetch-ready" | "fetch-all"
): Promise<{
  remoteRef: string;
}> {
  await initializeContentRepo();
  const config = getConfig();

  await runGit(
    [
      "fetch",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
      `+refs/heads/${config.contentBranch}:refs/remotes/origin/${config.contentBranch}`,
    ],
    {
      cwd: config.workdir,
      auth: true,
      errorPrefix: "Failed to fetch main/content branches",
    }
  );
  await ensureRemoteContentBranchExists(config.workdir);

  await runGit(
    ["checkout", "-B", config.contentBranch, `origin/${config.contentBranch}`],
    {
      cwd: config.workdir,
      errorPrefix: "Failed to checkout content branch",
    }
  );

  const remoteRef = (
    await runGit(["rev-parse", `origin/${config.contentBranch}`], {
      cwd: config.workdir,
      errorPrefix: "Failed to resolve origin/content ref",
    })
  ).stdout.trim();

  if (mode === "fetch-all") {
    await deleteGeneratedPathsForFullSync(config.workdir);
  }

  try {
    await runGit(["merge", "-X", "theirs", "origin/main"], {
      cwd: config.workdir,
      errorPrefix: "Failed to merge origin/main into content",
    });
  } catch (error) {
    console.warn(
      `[ContentRepo] Merge conflict detected while merging origin/main into content. Recovering by resetting content branch to origin/main. Error: ${error instanceof Error ? error.message : String(error)}`
    );
    try {
      await runGit(["merge", "--abort"], {
        cwd: config.workdir,
        errorPrefix: "Failed to abort merge",
      });
    } catch {
      // ignore abort error
    }

    // Automatically recover by bootstrapping the branch from origin/main
    await runGit(["reset", "--hard", "origin/main"], {
      cwd: config.workdir,
      errorPrefix:
        "Failed to reset content branch to origin/main during recovery",
    });

    // Force push the bootstrapped branch so the remote reflects origin/main
    // This prevents subsequent standard pushes from failing due to unrelated histories
    await runGit(["push", "origin", config.contentBranch, "--force"], {
      cwd: config.workdir,
      auth: true,
      errorPrefix: "Failed to force push recovered content branch",
    });
  }

  return { remoteRef };
}

export async function copyGeneratedContentFromTemp(
  tempDir: string
): Promise<void> {
  const config = getConfig();
  const targets = [
    {
      source: resolve(tempDir, "docs"),
      destination: resolve(config.workdir, "docs"),
    },
    {
      source: resolve(tempDir, "i18n"),
      destination: resolve(config.workdir, "i18n"),
    },
    {
      source: resolve(tempDir, "static", "images"),
      destination: resolve(config.workdir, "static", "images"),
    },
  ];

  try {
    for (const target of targets) {
      if (!(await pathExists(target.source))) {
        continue;
      }
      await mkdir(dirname(target.destination), { recursive: true });
      await cp(target.source, target.destination, {
        recursive: true,
        force: true,
      });
    }
  } catch (error) {
    await restoreAndCleanGeneratedPaths(config.workdir);
    throw new ContentRepoError(
      "Failed to copy generated content into repository",
      error instanceof Error ? error.message : String(error),
      "CONTENT_GENERATION_FAILED"
    );
  }
}

export async function stageGeneratedPaths(): Promise<void> {
  const config = getConfig();
  await runGit(["add", ...GENERATED_PATH_SPECS], {
    cwd: config.workdir,
    errorPrefix: "Failed to stage generated paths",
  });
}

export async function hasStagedGeneratedChanges(): Promise<boolean> {
  const config = getConfig();
  try {
    await runGit(["diff", "--cached", "--quiet"], {
      cwd: config.workdir,
      errorPrefix: "Failed to inspect staged changes",
    });
    return false;
  } catch (error) {
    if (isGitExitCode(error, 1)) {
      return true;
    }
    throw error;
  }
}

export async function hasHeadAdvancedSince(
  remoteRef: string
): Promise<boolean> {
  const config = getConfig();
  const head = (
    await runGit(["rev-parse", "HEAD"], {
      cwd: config.workdir,
      errorPrefix: "Failed to resolve HEAD",
    })
  ).stdout.trim();
  return head !== remoteRef;
}

export async function commitGeneratedChanges(message: string): Promise<string> {
  const config = getConfig();
  await runGit(["commit", "-m", message], {
    cwd: config.workdir,
    errorPrefix: "Failed to commit generated content",
  });
  return await getHeadCommitHash();
}

export async function getHeadCommitHash(): Promise<string> {
  const config = getConfig();
  return (
    await runGit(["rev-parse", "HEAD"], {
      cwd: config.workdir,
      errorPrefix: "Failed to resolve HEAD commit hash",
    })
  ).stdout.trim();
}

export async function resetToRemoteContentBranch(): Promise<void> {
  const config = getConfig();
  await runGit(
    ["checkout", "-B", config.contentBranch, `origin/${config.contentBranch}`],
    {
      cwd: config.workdir,
      errorPrefix: "Failed to reset local content branch",
    }
  );
  await restoreAndCleanGeneratedPaths(config.workdir);
}

export async function pushContentBranchWithRetry(): Promise<string> {
  const config = getConfig();

  const pushOnce = async () => {
    await runGit(["push", "origin", config.contentBranch], {
      cwd: config.workdir,
      auth: true,
      errorPrefix: "Failed to push content branch",
    });
  };

  try {
    await pushOnce();
    return await getHeadCommitHash();
  } catch (pushError) {
    try {
      await runGit(["fetch", "origin", "content"], {
        cwd: config.workdir,
        auth: true,
        errorPrefix: "Failed to fetch origin/content before push retry",
      });
      await runGit(["merge", "origin/content"], {
        cwd: config.workdir,
        errorPrefix: "Failed to merge origin/content before push retry",
      });
    } catch (mergeError) {
      try {
        await runGit(["merge", "--abort"], {
          cwd: config.workdir,
          errorPrefix: "Failed to abort retry merge",
        });
      } catch {
        // no-op
      }
      await resetToRemoteContentBranch();
      throw new ContentRepoError(
        "Push failed and retry merge failed",
        mergeError instanceof Error ? mergeError.message : String(mergeError),
        "PUSH_FAILED"
      );
    }

    try {
      await pushOnce();
      return await getHeadCommitHash();
    } catch (retryPushError) {
      await resetToRemoteContentBranch();
      throw new ContentRepoError(
        "Push failed after retry",
        retryPushError instanceof Error
          ? retryPushError.message
          : String(retryPushError),
        "PUSH_FAILED"
      );
    }
  }
}

export async function verifyRemoteHeadMatchesLocal(): Promise<void> {
  const config = getConfig();
  await runGit(["fetch", "origin", "content"], {
    cwd: config.workdir,
    auth: true,
    errorPrefix: "Failed to fetch origin/content for remote-head verification",
  });

  const remoteHead = (
    await runGit(["rev-parse", "origin/content"], {
      cwd: config.workdir,
      errorPrefix: "Failed to resolve origin/content head",
    })
  ).stdout.trim();
  const localHead = await getHeadCommitHash();

  if (remoteHead !== localHead) {
    await resetToRemoteContentBranch();
    throw new ContentRepoError(
      "origin/content changed before status transition",
      `origin/content=${remoteHead}, local=${localHead}`,
      "PUSH_FAILED"
    );
  }
}

export async function initializeContentRepo(): Promise<void> {
  if (initPromise) {
    return await initPromise;
  }

  initPromise = (async () => {
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

      // Ensure content output directories exist in the workdir.
      // notion-fetch writes to these via CONTENT_PATH/IMAGES_PATH/I18N_PATH env vars.
      await mkdir(resolve(config.workdir, "docs"), { recursive: true });
      await mkdir(resolve(config.workdir, "static", "images"), {
        recursive: true,
      });
      await mkdir(resolve(config.workdir, "i18n"), { recursive: true });
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
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return await initPromise;
}

export async function acquireRepoLock(
  lockPath: string,
  shouldAbort?: () => boolean
): Promise<{ release: () => Promise<void> }> {
  const start = Date.now();

  while (true) {
    assertNotAborted(shouldAbort);

    try {
      const lockFile = await open(lockPath, "wx");
      return {
        release: async () => {
          await lockFile.close();
          await rm(lockPath, { force: true });
        },
      };
    } catch (error) {
      const lockError = error as NodeJS.ErrnoException;

      if (lockError.code !== "EEXIST") {
        throw new ContentRepoError(
          `Failed to acquire repository lock: ${lockPath}`,
          lockError.message
        );
      }

      // Check if lock is stale (older than threshold)
      try {
        const lockStat = await stat(lockPath);
        const lockAge = Date.now() - lockStat.mtimeMs;
        if (lockAge > STALE_LOCK_THRESHOLD_MS) {
          console.warn(
            `Removing stale lock file (age: ${Math.floor(lockAge / 1000)}s): ${lockPath}`
          );
          await rm(lockPath, { force: true });
          continue; // retry immediately
        }
      } catch {
        // Lock file may have been released between our check and stat
        continue; // retry immediately
      }

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
    ),
    options.shouldAbort
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

    // Scope the status check to the same paths we will stage, so the no-op
    // detection is not confused by files written outside the content directories
    // (e.g. telemetry output files or any other working-tree noise).
    const status = await runGit(
      ["status", "--porcelain", "docs", "static/images", "i18n"],
      {
        cwd: config.workdir,
        errorPrefix: "Failed to inspect repository changes",
      }
    );

    if (!status.stdout.trim() && !config.allowEmptyCommits) {
      return { output, noOp: true };
    }

    // Stage only the content output directories that notion-fetch writes to.
    // Using specific paths instead of "-A" prevents accidentally committing
    // build artifacts if .gitignore is incomplete.
    await runGit(["add", "docs", "static/images", "i18n"], {
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
    jobType === "fetch-ready" ||
    jobType === "fetch-all" ||
    jobType === "notion:fetch" ||
    jobType === "notion:fetch-all" ||
    jobType === "notion:translate"
  );
}
