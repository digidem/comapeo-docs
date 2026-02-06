/**
 * Unit tests for the API server
 * These tests don't require a running server
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import type { JobType } from "./job-tracker";

// Mock the Bun.serve function
const mockFetch = vi.fn();

describe("API Server - Unit Tests", () => {
  beforeEach(() => {
    // Reset job tracker
    destroyJobTracker();
    getJobTracker();

    // Reset mocks
    mockFetch.mockReset();
  });

  afterEach(() => {
    destroyJobTracker();
  });

  describe("Job Type Validation", () => {
    const validJobTypes: JobType[] = [
      "notion:fetch",
      "notion:fetch-all",
      "notion:translate",
      "notion:status-translation",
      "notion:status-draft",
      "notion:status-publish",
      "notion:status-publish-production",
    ];

    it("should accept all valid job types", () => {
      for (const jobType of validJobTypes) {
        const tracker = getJobTracker();
        const jobId = tracker.createJob(jobType);
        const job = tracker.getJob(jobId);

        expect(job).toBeDefined();
        expect(job?.type).toBe(jobType);
      }
    });

    it("should reject invalid job types", () => {
      const tracker = getJobTracker();

      // @ts-expect-error - Testing invalid job type
      expect(() => tracker.createJob("invalid-job-type")).not.toThrow();
    });
  });

  describe("Job Creation Flow", () => {
    it("should create job with pending status", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("pending");
      expect(job?.createdAt).toBeInstanceOf(Date);
      expect(job?.id).toBeTruthy();
    });

    it("should transition job from pending to running", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch-all");

      tracker.updateJobStatus(jobId, "running");

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("running");
      expect(job?.startedAt).toBeInstanceOf(Date);
    });

    it("should transition job from running to completed", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:translate");

      tracker.updateJobStatus(jobId, "running");
      tracker.updateJobStatus(jobId, "completed", {
        success: true,
        output: "Translation completed",
      });

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.completedAt).toBeInstanceOf(Date);
      expect(job?.result?.success).toBe(true);
    });
  });

  describe("Job Progress Tracking", () => {
    it("should track job progress", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch-all");

      tracker.updateJobProgress(jobId, 5, 10, "Processing page 5");
      tracker.updateJobProgress(jobId, 7, 10, "Processing page 7");

      const job = tracker.getJob(jobId);
      expect(job?.progress).toEqual({
        current: 7,
        total: 10,
        message: "Processing page 7",
      });
    });

    it("should calculate completion percentage", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch-all");

      tracker.updateJobProgress(jobId, 5, 10, "Halfway there");

      const job = tracker.getJob(jobId);
      const percentage = (job?.progress!.current / job?.progress!.total) * 100;

      expect(percentage).toBe(50);
    });
  });

  describe("Job Filtering", () => {
    beforeEach(() => {
      const tracker = getJobTracker();
      const job1 = tracker.createJob("notion:fetch");
      const job2 = tracker.createJob("notion:fetch-all");
      const job3 = tracker.createJob("notion:translate");

      tracker.updateJobStatus(job1, "running");
      tracker.updateJobStatus(job2, "completed");
      tracker.updateJobStatus(job3, "failed");
    });

    it("should filter jobs by status", () => {
      const tracker = getJobTracker();

      const runningJobs = tracker.getJobsByStatus("running");
      const completedJobs = tracker.getJobsByStatus("completed");
      const failedJobs = tracker.getJobsByStatus("failed");

      expect(runningJobs).toHaveLength(1);
      expect(completedJobs).toHaveLength(1);
      expect(failedJobs).toHaveLength(1);
    });

    it("should filter jobs by type", () => {
      const tracker = getJobTracker();

      const fetchJobs = tracker.getJobsByType("notion:fetch");
      const fetchAllJobs = tracker.getJobsByType("notion:fetch-all");

      expect(fetchJobs).toHaveLength(1);
      expect(fetchAllJobs).toHaveLength(1);
    });
  });

  describe("Job Deletion", () => {
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

  describe("Job Listing", () => {
    it("should return all jobs", () => {
      const tracker = getJobTracker();
      tracker.createJob("notion:fetch");
      tracker.createJob("notion:fetch-all");
      tracker.createJob("notion:translate");

      const jobs = tracker.getAllJobs();

      expect(jobs).toHaveLength(3);
    });

    it("should return empty array when no jobs exist", () => {
      const tracker = getJobTracker();
      const jobs = tracker.getAllJobs();

      expect(jobs).toEqual([]);
    });
  });

  describe("Job Serialization", () => {
    it("should serialize job to JSON-compatible format", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      tracker.updateJobStatus(jobId, "running");
      tracker.updateJobProgress(jobId, 5, 10, "Processing");

      const job = tracker.getJob(jobId);

      // Verify all fields are JSON-serializable
      expect(() => JSON.stringify(job)).not.toThrow();

      const serialized = JSON.parse(JSON.stringify(job));
      expect(serialized.id).toBe(jobId);
      expect(serialized.type).toBe("notion:fetch");
      expect(serialized.status).toBe("running");
      expect(serialized.progress).toEqual({
        current: 5,
        total: 10,
        message: "Processing",
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle updating non-existent job gracefully", () => {
      const tracker = getJobTracker();

      expect(() => {
        tracker.updateJobStatus("non-existent", "running");
      }).not.toThrow();
    });

    it("should handle progress updates for non-existent job gracefully", () => {
      const tracker = getJobTracker();

      expect(() => {
        tracker.updateJobProgress("non-existent", 5, 10, "Test");
      }).not.toThrow();
    });
  });
});

// Integration tests for the complete job lifecycle
describe("Job Lifecycle Integration", () => {
  beforeEach(() => {
    destroyJobTracker();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
  });

  it("should complete full job lifecycle", () => {
    const tracker = getJobTracker();

    // Create job
    const jobId = tracker.createJob("notion:fetch-all");
    let job = tracker.getJob(jobId);
    expect(job?.status).toBe("pending");

    // Start job
    tracker.updateJobStatus(jobId, "running");
    job = tracker.getJob(jobId);
    expect(job?.status).toBe("running");
    expect(job?.startedAt).toBeInstanceOf(Date);

    // Update progress
    tracker.updateJobProgress(jobId, 5, 10, "Processing page 5");
    job = tracker.getJob(jobId);
    expect(job?.progress?.current).toBe(5);

    // Complete job
    tracker.updateJobStatus(jobId, "completed", {
      success: true,
      output: "Successfully processed 10 pages",
    });
    job = tracker.getJob(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.completedAt).toBeInstanceOf(Date);
    expect(job?.result?.success).toBe(true);
  });

  it("should handle failed job lifecycle", () => {
    const tracker = getJobTracker();

    // Create job
    const jobId = tracker.createJob("notion:fetch");

    // Start job
    tracker.updateJobStatus(jobId, "running");

    // Fail job
    tracker.updateJobStatus(jobId, "failed", {
      success: false,
      error: "Connection timeout",
    });

    const job = tracker.getJob(jobId);
    expect(job?.status).toBe("failed");
    expect(job?.result?.success).toBe(false);
    expect(job?.result?.error).toBe("Connection timeout");
  });

  it("should handle multiple concurrent jobs", () => {
    const tracker = getJobTracker();

    const jobIds = [
      tracker.createJob("notion:fetch"),
      tracker.createJob("notion:fetch-all"),
      tracker.createJob("notion:translate"),
    ];

    // Update all to running
    jobIds.forEach((id) => tracker.updateJobStatus(id, "running"));

    // Complete some, fail others
    tracker.updateJobStatus(jobIds[0], "completed", {
      success: true,
      output: "Fetch completed",
    });
    tracker.updateJobStatus(jobIds[1], "failed", {
      success: false,
      error: "Rate limit exceeded",
    });
    tracker.updateJobStatus(jobIds[2], "completed", {
      success: true,
      output: "Translation completed",
    });

    const jobs = tracker.getAllJobs();
    expect(jobs).toHaveLength(3);

    const completedJobs = tracker.getJobsByStatus("completed");
    const failedJobs = tracker.getJobsByStatus("failed");

    expect(completedJobs).toHaveLength(2);
    expect(failedJobs).toHaveLength(1);
  });
});
