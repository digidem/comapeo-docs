/**
 * API Documentation Validation Tests
 *
 * Validates that actual API response schemas match the documented schema in
 * /docs/developer-tools/api-reference.md
 *
 * This ensures documentation stays synchronized with implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import {
  generateRequestId,
  createApiResponse,
  createErrorResponse,
  ErrorCode,
  type ErrorResponse,
  type ApiResponse,
} from "./response-schemas";
import {
  jobSchema,
  jobsListResponseSchema,
  healthResponseSchema,
  errorResponseSchema,
  createJobResponseSchema,
  cancelJobResponseSchema,
  type JobProgress,
  type JobResult,
} from "./validation-schemas";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".jobs-data");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    try {
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }
}

describe("API Documentation Validation", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  describe("Response Envelope Structure", () => {
    it("should include data, requestId, and timestamp in success responses", () => {
      const requestId = generateRequestId();
      const response: ApiResponse<unknown> = createApiResponse(
        { test: "data" },
        requestId
      );

      expect(response).toHaveProperty("data");
      expect(response).toHaveProperty("requestId");
      expect(response).toHaveProperty("timestamp");

      // Validate requestId format
      expect(typeof response.requestId).toBe("string");
      expect(response.requestId).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);

      // Validate timestamp is ISO 8601
      expect(typeof response.timestamp).toBe("string");
      expect(new Date(response.timestamp)).toBeValidDate();
    });

    it("should include code, message, status, requestId, and timestamp in error responses", () => {
      const requestId = generateRequestId();
      const response: ErrorResponse = createErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        "Invalid input",
        400,
        requestId,
        { field: "type" },
        ["Check the request format"]
      );

      expect(response).toHaveProperty("code");
      expect(response).toHaveProperty("message");
      expect(response).toHaveProperty("status");
      expect(response).toHaveProperty("requestId");
      expect(response).toHaveProperty("timestamp");

      // Validate error code
      expect(typeof response.code).toBe("string");
      expect(response.code).toBe("VALIDATION_ERROR");

      // Validate status matches HTTP status
      expect(response.status).toBe(400);

      // Validate requestId format
      expect(response.requestId).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);

      // Validate timestamp is ISO 8601
      expect(new Date(response.timestamp)).toBeValidDate();

      // Validate optional fields
      expect(response).toHaveProperty("details");
      expect(response).toHaveProperty("suggestions");
      expect(response.details).toEqual({ field: "type" });
      expect(response.suggestions).toEqual(["Check the request format"]);
    });

    it("should not include optional fields when not provided", () => {
      const requestId = generateRequestId();
      const response: ErrorResponse = createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        500,
        requestId
      );

      expect(response).not.toHaveProperty("details");
      expect(response).not.toHaveProperty("suggestions");
    });
  });

  describe("Health Check Response Schema", () => {
    it("should match documented structure", () => {
      const healthData = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: 1234.567,
        auth: {
          enabled: true,
          keysConfigured: 2,
        },
      };

      const result = healthResponseSchema.safeParse(healthData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.status).toBe("ok");
        expect(result.data.uptime).toBe(1234.567);
        expect(result.data.auth?.enabled).toBe(true);
        expect(result.data.auth?.keysConfigured).toBe(2);
      }
    });

    it("should allow auth to be optional", () => {
      const healthData = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: 100,
      };

      const result = healthResponseSchema.safeParse(healthData);
      expect(result.success).toBe(true);
    });
  });

  describe("Jobs List Response Schema", () => {
    it("should use 'items' field not 'jobs' field", () => {
      const jobsListData = {
        items: [
          {
            id: "job-123",
            type: "notion:fetch" as const,
            status: "completed" as const,
            createdAt: "2025-02-06T10:00:00.000Z",
            startedAt: "2025-02-06T10:00:01.000Z",
            completedAt: "2025-02-06T10:02:30.000Z",
            progress: {
              current: 50,
              total: 50,
              message: "Completed",
            },
            result: {
              success: true,
              pagesProcessed: 50,
            },
          },
        ],
        count: 1,
      };

      const result = jobsListResponseSchema.safeParse(jobsListData);
      expect(result.success).toBe(true);

      // Critical: Field name must be 'items', not 'jobs'
      const dataWithJobsField = {
        ...jobsListData,
        jobs: jobsListData.items,
      };
      delete (dataWithJobsField as { items?: unknown }).items;

      const resultWithJobs =
        jobsListResponseSchema.safeParse(dataWithJobsField);
      expect(resultWithJobs.success).toBe(false);
    });

    it("should validate job progress structure", () => {
      const progress: JobProgress = {
        current: 25,
        total: 50,
        message: "Processing page 25 of 50",
      };

      const jobWithProgress = {
        id: "job-123",
        type: "notion:fetch-all" as const,
        status: "running" as const,
        createdAt: "2025-02-06T12:00:00.000Z",
        startedAt: "2025-02-06T12:00:01.000Z",
        completedAt: null,
        progress,
        result: null,
      };

      const result = jobSchema.safeParse(jobWithProgress);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.progress?.current).toBe(25);
        expect(result.data.progress?.total).toBe(50);
        expect(result.data.progress?.message).toBe("Processing page 25 of 50");
      }
    });

    it("should validate job result structure", () => {
      const result: JobResult = {
        success: true,
        data: { pagesProcessed: 50 },
      };

      const jobWithResult = {
        id: "job-123",
        type: "notion:translate" as const,
        status: "completed" as const,
        createdAt: "2025-02-06T12:00:00.000Z",
        startedAt: "2025-02-06T12:00:01.000Z",
        completedAt: "2025-02-06T12:05:00.000Z",
        progress: undefined,
        result,
      };

      const parseResult = jobSchema.safeParse(jobWithResult);
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        expect(parseResult.data.result?.success).toBe(true);
      }
    });
  });

  describe("Create Job Response Schema", () => {
    it("should match documented structure", () => {
      const createJobData = {
        jobId: "job-def456",
        type: "notion:fetch-all" as const,
        status: "pending" as const,
        message: "Job created successfully",
        _links: {
          self: "/jobs/job-def456",
          status: "/jobs/job-def456",
        },
      };

      const result = createJobResponseSchema.safeParse(createJobData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.jobId).toBe("job-def456");
        expect(result.data.status).toBe("pending");
        expect(result.data._links.self).toBe("/jobs/job-def456");
        expect(result.data._links.status).toBe("/jobs/job-def456");
      }
    });
  });

  describe("Cancel Job Response Schema", () => {
    it("should match documented structure", () => {
      const cancelJobData = {
        id: "job-def456",
        status: "cancelled" as const,
        message: "Job cancelled successfully",
      };

      const result = cancelJobResponseSchema.safeParse(cancelJobData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.id).toBe("job-def456");
        expect(result.data.status).toBe("cancelled");
        expect(result.data.message).toBe("Job cancelled successfully");
      }
    });
  });

  describe("Error Response Schema", () => {
    it("should match documented structure with all fields", () => {
      const errorData = {
        code: ErrorCode.VALIDATION_ERROR,
        message: "Missing required field: type",
        status: 400,
        requestId: "req_abc123_def456",
        timestamp: "2025-02-06T12:00:00.000Z",
        details: {
          field: "type",
        },
        suggestions: [
          "Check the request format",
          "Verify all required fields are present",
        ],
      };

      const result = errorResponseSchema.safeParse(errorData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.code).toBe("VALIDATION_ERROR");
        expect(result.data.message).toBe("Missing required field: type");
        expect(result.data.status).toBe(400);
        expect(result.data.requestId).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
        expect(result.data.details).toEqual({ field: "type" });
        expect(result.data.suggestions).toHaveLength(2);
      }
    });

    it("should allow optional fields to be omitted", () => {
      const errorData = {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Internal server error",
        status: 500,
        requestId: "req_xyz789_abc123",
        timestamp: "2025-02-06T12:00:00.000Z",
      };

      const result = errorResponseSchema.safeParse(errorData);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).not.toHaveProperty("details");
        expect(result.data).not.toHaveProperty("suggestions");
      }
    });

    it("should validate requestId format", () => {
      const invalidRequestId = "invalid-request-id";
      const errorData = {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Error",
        status: 500,
        requestId: invalidRequestId,
        timestamp: "2025-02-06T12:00:00.000Z",
      };

      const result = errorResponseSchema.safeParse(errorData);
      expect(result.success).toBe(false);
    });

    it("should validate timestamp is ISO 8601", () => {
      const invalidTimestamp = "not-a-valid-timestamp";
      const errorData = {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Error",
        status: 500,
        requestId: "req_abc123_def456",
        timestamp: invalidTimestamp,
      };

      const result = errorResponseSchema.safeParse(errorData);
      expect(result.success).toBe(false);
    });
  });

  describe("Error Code Enumeration", () => {
    it("should include all documented error codes", () => {
      const documentedCodes = [
        "VALIDATION_ERROR",
        "INVALID_INPUT",
        "MISSING_REQUIRED_FIELD",
        "INVALID_FORMAT",
        "INVALID_ENUM_VALUE",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "INVALID_API_KEY",
        "API_KEY_INACTIVE",
        "NOT_FOUND",
        "RESOURCE_NOT_FOUND",
        "ENDPOINT_NOT_FOUND",
        "CONFLICT",
        "INVALID_STATE_TRANSITION",
        "RESOURCE_LOCKED",
        "RATE_LIMIT_EXCEEDED",
        "INTERNAL_ERROR",
        "SERVICE_UNAVAILABLE",
        "JOB_EXECUTION_FAILED",
      ];

      // All documented codes should exist in ErrorCode enum
      for (const code of documentedCodes) {
        expect(Object.values(ErrorCode)).toContain(code);
      }
    });

    it("should have consistent error code values", () => {
      // Error codes should be stable and match their string representation
      expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
      expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED");
      expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND");
      expect(ErrorCode.INVALID_ENUM_VALUE).toBe("INVALID_ENUM_VALUE");
      expect(ErrorCode.INVALID_STATE_TRANSITION).toBe(
        "INVALID_STATE_TRANSITION"
      );
    });
  });

  describe("Job Tracker Integration", () => {
    it("should produce data matching job schema", () => {
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");

      const job = tracker.getJob(jobId);
      expect(job).toBeDefined();

      if (job) {
        // Convert to API response format
        const jobData = {
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
          progress: job.progress ?? null,
          result: job.result ?? null,
        };

        const result = jobSchema.safeParse(jobData);
        expect(result.success).toBe(true);
      }
    });
  });
});

// Extend Vitest's expect with custom matchers
declare module "vitest" {
  interface Assertion<T = any> {
    toBeValidDate(): T;
  }
}

expect.extend({
  toBeValidDate(received: string) {
    const date = new Date(received);
    const isValid =
      date instanceof Date &&
      !isNaN(date.getTime()) &&
      !isNaN(Date.parse(received));

    return {
      pass: isValid,
      message: () =>
        `expected "${received}" to be a valid ISO 8601 date string`,
    };
  },
});
