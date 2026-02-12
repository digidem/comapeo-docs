import { beforeEach, describe, expect, it, vi } from "vitest";

const { openMock, rmMock } = vi.hoisted(() => ({
  openMock: vi.fn(),
  rmMock: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );

  return {
    ...actual,
    open: openMock,
    rm: rmMock,
  };
});

import { acquireRepoLock } from "./content-repo";

function createErrnoError(
  code: string,
  message: string
): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe("acquireRepoLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    rmMock.mockResolvedValue(undefined);
  });

  it("retries when lock contention returns EEXIST", async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);

    openMock
      .mockRejectedValueOnce(createErrnoError("EEXIST", "already locked"))
      .mockRejectedValueOnce(createErrnoError("EEXIST", "already locked"))
      .mockResolvedValue({ close: closeMock });

    const lockPromise = acquireRepoLock("/tmp/test.lock");

    await vi.advanceTimersByTimeAsync(400);

    const lock = await lockPromise;
    expect(openMock).toHaveBeenCalledTimes(3);

    await lock.release();

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenCalledWith("/tmp/test.lock", { force: true });
  });

  it("fails fast for non-EEXIST lock errors", async () => {
    openMock.mockRejectedValueOnce(
      createErrnoError("EACCES", "permission denied")
    );

    await expect(acquireRepoLock("/tmp/forbidden.lock")).rejects.toThrow(
      "Failed to acquire repository lock: /tmp/forbidden.lock"
    );

    expect(openMock).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation while waiting for lock", async () => {
    openMock.mockRejectedValue(createErrnoError("EEXIST", "already locked"));

    const shouldAbort = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

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
