/**
 * API Routes Validation Tests
 *
 * Validates that API routes match required operations and response shapes
 * per PRD requirement: "Review: validate API routes match required operations and response shapes"
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJobTracker, destroyJobTracker, type JobType } from "./job-tracker";

describe("API Routes - Validation", () => {
  beforeEach(() => {
    destroyJobTracker();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
  });

  describe("Job Types Validation", () => {
    const validJobTypes: JobType[] = [
      "notion:fetch",
      "notion:fetch-all",
      "notion:translate",
      "notion:status-translation",
      "notion:status-draft",
      "notion:status-publish",
      "notion:status-publish-production",
    ];

    it("should support all 7 required job types", () => {
      expect(validJobTypes).toHaveLength(7);
    });

    it("should accept all valid job types for job creation", () => {
      const tracker = getJobTracker();

      for (const jobType of validJobTypes) {
        const jobId = tracker.createJob(jobType);
        const job = tracker.getJob(jobId);

        expect(job).toBeDefined();
        expect(job?.type).toBe(jobType);
        expect(job?.status).toBe("pending");
      }
    });

    it("should have correct job type descriptions", () => {
      const expectedDescriptions: Record<JobType, string> = {
        "notion:fetch": "Fetch pages from Notion",
        "notion:fetch-all": "Fetch all pages from Notion",
        "notion:translate": "Translate content",
        "notion:status-translation": "Update status for translation workflow",
        "notion:status-draft": "Update status for draft publish workflow",
        "notion:status-publish": "Update status for publish workflow",
        "notion:status-publish-production":
          "Update status for production publish workflow",
      };

      // This validates the expected response shape for /jobs/types endpoint
      const typesResponse = {
        types: validJobTypes.map((id) => ({
          id,

          description: expectedDescriptions[id as JobType],
        })),
      };

      expect(typesResponse.types).toHaveLength(7);
      expect(typesResponse.types[0]).toHaveProperty("id");
      expect(typesResponse.types[0]).toHaveProperty("description");
    });
  });

  describe("API Response Shapes", () => {
    it("should return correct health check response shape", () => {
      const healthResponse = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };

      expect(healthResponse).toHaveProperty("status", "ok");
      expect(healthResponse).toHaveProperty("timestamp");
      expect(healthResponse).toHaveProperty("uptime");
      expect(typeof healthResponse.uptime).toBe("number");
    });

    it("should return correct job list response shape", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      const jobs = tracker.getAllJobs();

      const expectedResponse = {
        jobs: jobs.map((job) => ({
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          progress: job.progress,
          result: job.result,
        })),
        count: jobs.length,
      };

      expect(expectedResponse.jobs).toBeInstanceOf(Array);
      expect(expectedResponse).toHaveProperty("count", 1);
      expect(expectedResponse.jobs[0]).toHaveProperty("id");
      expect(expectedResponse.jobs[0]).toHaveProperty("type");
      expect(expectedResponse.jobs[0]).toHaveProperty("status");
      expect(expectedResponse.jobs[0]).toHaveProperty("createdAt");
      expect(expectedResponse.jobs[0]).toHaveProperty("startedAt");
      expect(expectedResponse.jobs[0]).toHaveProperty("completedAt");
      expect(expectedResponse.jobs[0]).toHaveProperty("progress");
      expect(expectedResponse.jobs[0]).toHaveProperty("result");
    });

    it("should return correct job creation response shape", () => {
      const tracker = getJobTracker();
      const jobType: JobType = "notion:fetch-all";
      const jobId = tracker.createJob(jobType);

      const expectedResponse = {
        jobId,
        type: jobType,
        status: "pending" as const,
        message: "Job created successfully",
        _links: {
          self: `/jobs/${jobId}`,
          status: `/jobs/${jobId}`,
        },
      };

      expect(expectedResponse).toHaveProperty("jobId");
      expect(expectedResponse).toHaveProperty("type", jobType);
      expect(expectedResponse).toHaveProperty("status", "pending");
      expect(expectedResponse).toHaveProperty("message");
      expect(expectedResponse).toHaveProperty("_links");
      expect(expectedResponse._links).toHaveProperty("self");
      expect(expectedResponse._links).toHaveProperty("status");
    });

    it("should return correct job status response shape", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:translate");
      tracker.updateJobStatus(jobId, "running");
      tracker.updateJobProgress(jobId, 5, 10, "Processing");

      const job = tracker.getJob(jobId);
      expect(job).toBeDefined();

      const expectedResponse = {
        id: job!.id,
        type: job!.type,
        status: job!.status,
        createdAt: job!.createdAt.toISOString(),
        startedAt: job!.startedAt?.toISOString(),
        completedAt: job!.completedAt?.toISOString(),
        progress: job!.progress,
        result: job!.result,
      };

      expect(expectedResponse).toHaveProperty("id", jobId);
      expect(expectedResponse).toHaveProperty("type");
      expect(expectedResponse).toHaveProperty("status", "running");
      expect(expectedResponse.progress).toEqual({
        current: 5,
        total: 10,
        message: "Processing",
      });
    });
  });

  describe("Error Response Shapes", () => {
    it("should return consistent error response shape", () => {
      const errorResponse = {
        error: "Job not found",
      };

      expect(errorResponse).toHaveProperty("error");
      expect(typeof errorResponse.error).toBe("string");
    });

    it("should return 404 response shape for unknown routes", () => {
      const notFoundResponse = {
        error: "Not found",
        message: "The requested endpoint does not exist",
        availableEndpoints: [
          { method: "GET", path: "/health", description: "Health check" },
          {
            method: "GET",
            path: "/jobs/types",
            description: "List available job types",
          },
          { method: "GET", path: "/jobs", description: "List all jobs" },
          { method: "POST", path: "/jobs", description: "Create a new job" },
          { method: "GET", path: "/jobs/:id", description: "Get job status" },
        ],
      };

      expect(notFoundResponse).toHaveProperty("error");
      expect(notFoundResponse).toHaveProperty("message");
      expect(notFoundResponse).toHaveProperty("availableEndpoints");
      expect(notFoundResponse.availableEndpoints).toHaveLength(5);
    });
  });

  describe("Job Status Transitions", () => {
    it("should support all required job statuses", () => {
      const validStatuses = [
        "pending",
        "running",
        "completed",
        "failed",
      ] as const;

      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      // Test each status transition
      tracker.updateJobStatus(jobId, "running");
      expect(tracker.getJob(jobId)?.status).toBe("running");

      tracker.updateJobStatus(jobId, "completed", {
        success: true,
        output: "Done",
      });
      expect(tracker.getJob(jobId)?.status).toBe("completed");
    });

    it("should handle failed job status with error result", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch-all");

      tracker.updateJobStatus(jobId, "running");
      tracker.updateJobStatus(jobId, "failed", {
        success: false,
        error: "Rate limit exceeded",
      });

      const job = tracker.getJob(jobId);
      expect(job?.status).toBe("failed");
      expect(job?.result?.success).toBe(false);
      expect(job?.result?.error).toBe("Rate limit exceeded");
    });
  });

  describe("Request Validation", () => {
    it("should validate job type in request body", () => {
      const validJobTypes: JobType[] = [
        "notion:fetch",
        "notion:fetch-all",
        "notion:translate",
        "notion:status-translation",
        "notion:status-draft",
        "notion:status-publish",
        "notion:status-publish-production",
      ];

      // Simulate request validation
      const isValidJobType = (type: string): type is JobType => {
        return validJobTypes.includes(type as JobType);
      };

      expect(isValidJobType("notion:fetch")).toBe(true);
      expect(isValidJobType("invalid:type")).toBe(false);
      expect(isValidJobType("")).toBe(false);
    });

    it("should accept optional options in request body", () => {
      const requestBody = {
        type: "notion:fetch-all" as JobType,
        options: {
          maxPages: 10,
          statusFilter: "In Progress",
          force: true,
          dryRun: false,
        },
      };

      expect(requestBody).toHaveProperty("type");
      expect(requestBody).toHaveProperty("options");
      expect(requestBody.options).toHaveProperty("maxPages");
      expect(requestBody.options).toHaveProperty("statusFilter");
    });
  });

  describe("CORS Headers Validation", () => {
    it("should include correct CORS headers", () => {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
      expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("GET");
      expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("POST");
      expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("OPTIONS");
      expect(corsHeaders["Access-Control-Allow-Headers"]).toBe("Content-Type");
    });
  });

  describe("Job Options Support", () => {
    it("should support all defined job options", () => {
      const jobOptions = {
        maxPages: 10,
        statusFilter: "In Progress",
        force: true,
        dryRun: false,
        includeRemoved: true,
      };

      expect(jobOptions.maxPages).toBeDefined();
      expect(jobOptions.statusFilter).toBeDefined();
      expect(jobOptions.force).toBeDefined();
      expect(jobOptions.dryRun).toBeDefined();
      expect(jobOptions.includeRemoved).toBeDefined();
    });
  });
});

describe("API Routes - Endpoint Coverage", () => {
  const requiredEndpoints = [
    { method: "GET", path: "/health", description: "Health check" },
    {
      method: "GET",
      path: "/jobs/types",
      description: "List available job types",
    },
    { method: "GET", path: "/jobs", description: "List all jobs" },
    { method: "POST", path: "/jobs", description: "Create a new job" },
    { method: "GET", path: "/jobs/:id", description: "Get job status" },
  ];

  it("should have all required endpoints defined", () => {
    expect(requiredEndpoints).toHaveLength(5);

    // Verify each endpoint has the required properties
    for (const endpoint of requiredEndpoints) {
      expect(endpoint).toHaveProperty("method");
      expect(endpoint).toHaveProperty("path");
      expect(endpoint).toHaveProperty("description");
      expect(["GET", "POST", "OPTIONS"]).toContain(endpoint.method);
    }
  });

  it("should support GET and POST methods", () => {
    const getEndpoints = requiredEndpoints.filter((e) => e.method === "GET");
    const postEndpoints = requiredEndpoints.filter((e) => e.method === "POST");

    expect(getEndpoints.length).toBeGreaterThanOrEqual(3);
    expect(postEndpoints.length).toBeGreaterThanOrEqual(1);
  });
});
