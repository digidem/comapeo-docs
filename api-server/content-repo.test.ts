import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  openMock,
  rmMock,
  statMock,
  mkdirMock,
  readdirMock,
  writeFileMock,
  chmodMock,
  spawnMock,
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  rmMock: vi.fn(),
  statMock: vi.fn(),
  mkdirMock: vi.fn(),
  readdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  chmodMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );

  return {
    ...actual,
    chmod: chmodMock,
    mkdir: mkdirMock,
    open: openMock,
    readdir: readdirMock,
    rm: rmMock,
    stat: statMock,
    writeFile: writeFileMock,
  };
});

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

function createErrnoError(
  code: string,
  message: string
): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function createSuccessfulProcess(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  queueMicrotask(() => {
    child.emit("close", 0);
  });

  return child;
}

describe("content-repo", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();

    rmMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    readdirMock.mockResolvedValue([]);
    writeFileMock.mockResolvedValue(undefined);
    chmodMock.mockResolvedValue(undefined);
    spawnMock.mockImplementation(() => createSuccessfulProcess());

    process.env = { ...originalEnv };
    process.env.GITHUB_REPO_URL = "https://github.com/comapeo/comapeo-docs.git";
    process.env.GITHUB_CONTENT_BRANCH = "content";
    process.env.GITHUB_TOKEN = "test-token";
    process.env.GIT_AUTHOR_NAME = "CoMapeo Bot";
    process.env.GIT_AUTHOR_EMAIL = "bot@example.com";
    process.env.WORKDIR = "/workspace/repo";
    process.env.COMMIT_MESSAGE_PREFIX = "content-bot:";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("acquireRepoLock", () => {
    it("retries when lock contention returns EEXIST", async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);

      openMock
        .mockRejectedValueOnce(createErrnoError("EEXIST", "already locked"))
        .mockRejectedValueOnce(createErrnoError("EEXIST", "already locked"))
        .mockResolvedValue({ close: closeMock });

      const { acquireRepoLock } = await import("./content-repo");
      const lockPromise = acquireRepoLock("/tmp/test.lock");

      await vi.advanceTimersByTimeAsync(400);

      const lock = await lockPromise;
      expect(openMock).toHaveBeenCalledTimes(3);

      await lock.release();

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(rmMock).toHaveBeenCalledWith("/tmp/test.lock", { force: true });
    });

    it("fails fast for non-EEXIST lock errors and keeps error details", async () => {
      openMock.mockRejectedValueOnce(
        createErrnoError("EACCES", "permission denied")
      );

      const { acquireRepoLock } = await import("./content-repo");

      let error: unknown;
      try {
        await acquireRepoLock("/tmp/forbidden.lock");
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toMatchObject({
        message: "Failed to acquire repository lock: /tmp/forbidden.lock",
        details: "permission denied",
        name: "ContentRepoError",
      });
      expect(openMock).toHaveBeenCalledTimes(1);
    });

    it("honors cancellation while waiting for lock", async () => {
      openMock.mockRejectedValue(createErrnoError("EEXIST", "already locked"));

      const shouldAbort = vi
        .fn<() => boolean>()
        .mockReturnValueOnce(false)
        .mockReturnValue(true);

      const { acquireRepoLock } = await import("./content-repo");
      const lockPromise = acquireRepoLock("/tmp/cancel.lock", shouldAbort);
      const rejectionExpectation = expect(lockPromise).rejects.toThrow(
        "Job cancelled by user"
      );

      await vi.advanceTimersByTimeAsync(200);

      await rejectionExpectation;
      expect(openMock).toHaveBeenCalledTimes(1);
      expect(rmMock).not.toHaveBeenCalled();
    });
  });

  describe("initializeContentRepo", () => {
    it("serializes concurrent initialization and runs clone flow once", async () => {
      statMock.mockImplementation(async (path: string) => {
        if (path === "/workspace/repo/.git" || path === "/workspace/repo") {
          throw createErrnoError("ENOENT", "not found");
        }
        return {};
      });

      const { initializeContentRepo } = await import("./content-repo");

      await Promise.all([initializeContentRepo(), initializeContentRepo()]);

      expect(spawnMock).toHaveBeenCalledTimes(4);
      expect(spawnMock).toHaveBeenNthCalledWith(
        1,
        "git",
        [
          "clone",
          "--branch",
          "content",
          "--single-branch",
          "--depth",
          "1",
          "https://github.com/comapeo/comapeo-docs.git",
          "/workspace/repo",
        ],
        expect.any(Object)
      );
    });
  });
});
