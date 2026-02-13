/**
 * Tests for job tracker
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getJobTracker,
  destroyJobTracker,
  type JobType,
  type JobStatus,
} from "./job-tracker";
import { setupTestEnvironment } from "./test-helpers";

// Run tests sequentially to avoid file system race conditions
describe("JobTracker", () => {
  let testEnv: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    // Set up isolated test environment
    testEnv = setupTestEnvironment();
    // Reset the job tracker after setting up environment
    destroyJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    // Clean up test environment
    testEnv.cleanup();
  });

  describe("createJob", () => {
    it("should create a new job and return a job ID", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe("string");

      const job = tracker.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
      expect(job?.type).toBe("notion:fetch");
      expect(job?.status).toBe("pending");
      expect(job?.createdAt).toBeInstanceOf(Date);
    });

    it("should create unique job IDs", () => {
      const tracker = getJobTracker();
      const jobId1 = tracker.createJob("notion:fetch");
      const jobId2 = tracker.createJob("notion:fetch-all");

      expect(jobId1).not.toBe(jobId2);
    });
  });

  describe("getJob", () => {
    it("should return a job by ID", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:translate");
      const job = tracker.getJob(jobId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(jobId);
    });

    it("should return undefined for non-existent job", () => {
      const tracker = getJobTracker();
      const job = tracker.getJob("non-existent-id");

      expect(job).toBeUndefined();
    });
  });

  describe("updateJobStatus", () => {
    it("should update job status to running", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      tracker.updateJobStatus(jobId, "running");

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("running");
      expect(job?.startedAt).toBeInstanceOf(Date);
    });

    it("should update job status to completed", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      tracker.updateJobStatus(jobId, "running");
      tracker.updateJobStatus(jobId, "completed", {
        success: true,
        output: "test output",
      });

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.completedAt).toBeInstanceOf(Date);
      expect(job?.result?.success).toBe(true);
      expect(job?.result?.output).toBe("test output");
    });

    it("should update job status to failed", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      tracker.updateJobStatus(jobId, "running");
      tracker.updateJobStatus(jobId, "failed", {
        success: false,
        error: "Test error",
      });

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.completedAt).toBeInstanceOf(Date);
      expect(job?.result?.success).toBe(false);
      expect(job?.result?.error).toBe("Test error");
    });

    it("should not update status for non-existent job", () => {
      const tracker = getJobTracker();

      expect(() => {
        tracker.updateJobStatus("non-existent-id", "running");
      }).not.toThrow();
    });
  });

  describe("updateJobProgress", () => {
    it("should update job progress", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch-all");

      tracker.updateJobProgress(jobId, 5, 10, "Processing page 5");

      const job = tracker.getJob(jobId);
      expect(job?.progress).toEqual({
        current: 5,
        total: 10,
        message: "Processing page 5",
      });
    });

    it("should not update progress for non-existent job", () => {
      const tracker = getJobTracker();

      expect(() => {
        tracker.updateJobProgress("non-existent-id", 5, 10, "Test");
      }).not.toThrow();
    });
  });

  describe("getAllJobs", () => {
    it("should return all jobs sorted by creation time (newest first)", async () => {
      const tracker = getJobTracker();
      const jobId1 = tracker.createJob("notion:fetch");
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const jobId2 = tracker.createJob("notion:fetch-all");

      const jobs = tracker.getAllJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0].id).toBe(jobId2);
      expect(jobs[1].id).toBe(jobId1);
    });

    it("should return empty array when no jobs exist", () => {
      const tracker = getJobTracker();
      const jobs = tracker.getAllJobs();

      expect(jobs).toEqual([]);
    });
  });

  describe("getJobsByType", () => {
    it("should filter jobs by type", () => {
      const tracker = getJobTracker();
      tracker.createJob("notion:fetch");
      tracker.createJob("notion:fetch-all");
      tracker.createJob("notion:fetch-all");
      tracker.createJob("notion:translate");

      const fetchAllJobs = tracker.getJobsByType("notion:fetch-all");

      expect(fetchAllJobs).toHaveLength(2);
      expect(fetchAllJobs.every((job) => job.type === "notion:fetch-all")).toBe(
        true
      );
    });
  });

  describe("getJobsByStatus", () => {
    it("should filter jobs by status", () => {
      const tracker = getJobTracker();
      const jobId1 = tracker.createJob("notion:fetch");
      const jobId2 = tracker.createJob("notion:fetch-all");
      const jobId3 = tracker.createJob("notion:translate");

      tracker.updateJobStatus(jobId1, "running");
      tracker.updateJobStatus(jobId2, "running");
      tracker.updateJobStatus(jobId3, "completed");

      const runningJobs = tracker.getJobsByStatus("running");
      const completedJobs = tracker.getJobsByStatus("completed");

      expect(runningJobs).toHaveLength(2);
      expect(completedJobs).toHaveLength(1);
    });
  });

  describe("deleteJob", () => {
    it("should delete a job", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      expect(tracker.getJob(jobId)).toBeDefined();

      const deleted = tracker.deleteJob(jobId);

      expect(deleted).toBe(true);
      expect(tracker.getJob(jobId)).toBeUndefined();
    });

    it("should return false when deleting non-existent job", () => {
      const tracker = getJobTracker();
      const deleted = tracker.deleteJob("non-existent-id");

      expect(deleted).toBe(false);
    });
  });

  describe("cleanupOldJobs", () => {
    it("should persist jobs across tracker instances", () => {
      const tracker = getJobTracker();
      const jobId1 = tracker.createJob("notion:fetch");
      const jobId2 = tracker.createJob("notion:fetch-all");

      // Mark jobs as completed
      tracker.updateJobStatus(jobId1, "completed", { success: true });
      tracker.updateJobStatus(jobId2, "completed", { success: true });

      // Destroy and create a new tracker instance
      destroyJobTracker();
      const newTracker = getJobTracker();

      // Jobs should be persisted and available in the new tracker
      const loadedJob1 = newTracker.getJob(jobId1);
      const loadedJob2 = newTracker.getJob(jobId2);

      expect(loadedJob1).toBeDefined();
      expect(loadedJob2).toBeDefined();
      expect(loadedJob1?.status).toBe("completed");
      expect(loadedJob2?.status).toBe("completed");
    });
  });
});
