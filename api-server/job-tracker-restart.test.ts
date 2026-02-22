import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import { resolve } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";

const JOBS_DIR = resolve(process.cwd(), ".jobs-data");
const JOBS_FILE = resolve(JOBS_DIR, "jobs.json");

describe("Job Tracker - Server Restart", () => {
  beforeEach(() => {
    if (existsSync(JOBS_DIR)) {
      rmSync(JOBS_DIR, { recursive: true, force: true });
    }
    mkdirSync(JOBS_DIR, { recursive: true });
    destroyJobTracker();
  });

  afterEach(() => {
    if (existsSync(JOBS_DIR)) {
      rmSync(JOBS_DIR, { recursive: true, force: true });
    }
    destroyJobTracker();
  });

  it("marks in-flight jobs as SERVER_RESTART_ABORT on restart", async () => {
    const jobId = "test-job-123";
    const jobData = {
      id: jobId,
      type: "fetch-ready",
      status: "running",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    // jobs.json is an object with jobs array
    writeFileSync(JOBS_FILE, JSON.stringify({ jobs: [jobData] }));

    const tracker = getJobTracker();

    // Wait for async job loading to complete
    await tracker.waitForLoad();

    const job = tracker.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe("failed");
    expect(job?.result?.errorEnvelope?.code).toBe("SERVER_RESTART_ABORT");
    expect(job?.terminal?.error?.code).toBe("SERVER_RESTART_ABORT");
  });
});
