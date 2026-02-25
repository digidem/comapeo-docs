import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { executeJob } from "./job-executor";
import { destroyJobTracker, getJobTracker } from "./job-tracker";
import * as fetchRunner from "./fetch-job-runner";
import * as fetchLock from "./fetch-job-lock";
import * as jobPersistence from "./job-persistence";

const DATA_DIR = join(process.cwd(), ".jobs-data");

function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

describe("job-executor fetch lifecycle", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
    delete process.env.JOB_TIMEOUT_MS;
    vi.restoreAllMocks();
  });

  it("logs structured lifecycle events for completed fetch jobs", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.spyOn(jobPersistence, "createJobLogger").mockReturnValue(logger);
    vi.spyOn(fetchRunner, "runFetchJob").mockResolvedValue({
      success: true,
      terminal: {
        pagesProcessed: 1,
        pagesSkipped: 0,
        pagesTransitioned: 0,
        commitHash: null,
        failedPageIds: [],
        warnings: [
          {
            type: "status_changed",
            pageId: "page-1",
            message: "Page is no longer Ready to publish",
          },
        ],
      },
    });
    const releaseSpy = vi
      .spyOn(fetchLock, "releaseFetchJobLock")
      .mockImplementation(() => {});

    const tracker = getJobTracker();
    const jobId = tracker.createJob("fetch-ready");
    const onComplete = vi.fn();

    await executeJob("fetch-ready", {
      jobId,
      onProgress: vi.fn(),
      onComplete,
    });

    expect(logger.info).toHaveBeenCalledWith(
      "job_started",
      expect.objectContaining({
        jobId,
        type: "fetch-ready",
      })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "job_warning",
      expect.objectContaining({
        jobId,
        type: "fetch-ready",
        pageId: "page-1",
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      "job_completed",
      expect.objectContaining({
        jobId,
        type: "fetch-ready",
      })
    );
    expect(releaseSpy).toHaveBeenCalledWith(jobId);
    expect(onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        warnings: expect.any(Array),
      }),
      undefined
    );
  });

  it("emits JOB_TIMEOUT terminal failure and timeout lifecycle logs", async () => {
    process.env.JOB_TIMEOUT_MS = "100";

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    vi.spyOn(jobPersistence, "createJobLogger").mockReturnValue(logger);
    vi.spyOn(fetchRunner, "runFetchJob").mockImplementation(
      async ({ signal, timeoutMs }) => {
        const timeoutSeconds = Math.floor(timeoutMs / 1000);
        return await new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              resolve({
                success: false,
                error: `Job execution timed out after ${timeoutSeconds} seconds`,
                terminal: {
                  pagesProcessed: 0,
                  pagesSkipped: 0,
                  pagesTransitioned: 0,
                  commitHash: null,
                  failedPageIds: [],
                  warnings: [],
                  error: {
                    code: "JOB_TIMEOUT",
                    message: `Job execution timed out after ${timeoutSeconds} seconds`,
                  },
                },
              });
            },
            { once: true }
          );
        });
      }
    );
    const releaseSpy = vi
      .spyOn(fetchLock, "releaseFetchJobLock")
      .mockImplementation(() => {});

    const tracker = getJobTracker();
    const jobId = tracker.createJob("fetch-all");
    const onComplete = vi.fn();

    await executeJob("fetch-all", {
      jobId,
      onProgress: vi.fn(),
      onComplete,
    });

    expect(logger.error).toHaveBeenCalledWith(
      "job_timeout",
      expect.objectContaining({
        jobId,
        type: "fetch-all",
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      "job_failed",
      expect.objectContaining({
        jobId,
        type: "fetch-all",
        code: "JOB_TIMEOUT",
      })
    );
    expect(releaseSpy).toHaveBeenCalledWith(jobId);
    expect(onComplete).toHaveBeenCalledWith(
      false,
      expect.objectContaining({
        errorEnvelope: expect.objectContaining({
          code: "JOB_TIMEOUT",
        }),
      }),
      expect.stringContaining("timed out")
    );
  });
});
