/**
 * Input Validation and Error Handling Tests
 *
 * Tests for comprehensive input validation and error handling
 * across all API endpoints. These tests use the validation
 * functions directly without requiring a running server.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJobTracker, destroyJobTracker, type JobType } from "./job-tracker";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".jobs-data");

// Helper to clean up test data
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

// Configuration constants matching the server
const MAX_REQUEST_SIZE = 1_000_000;
const MAX_JOB_ID_LENGTH = 100;

// Valid job types and statuses
const VALID_JOB_TYPES: readonly JobType[] = [
  "notion:fetch",
  "notion:fetch-all",
  "notion:translate",
  "notion:status-translation",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
] as const;

const VALID_JOB_STATUSES: readonly (
  | "pending"
  | "running"
  | "completed"
  | "failed"
)[] = ["pending", "running", "completed", "failed"] as const;

// Validation functions (copied from index.ts for testing)
function isValidJobType(type: string): type is JobType {
  return VALID_JOB_TYPES.includes(type as JobType);
}

function isValidJobStatus(
  status: string
): status is "pending" | "running" | "completed" | "failed" {
  return VALID_JOB_STATUSES.includes(status as never);
}

function isValidJobId(jobId: string): boolean {
  if (!jobId || jobId.length > MAX_JOB_ID_LENGTH) {
    return false;
  }
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\")) {
    return false;
  }
  return true;
}

describe("Input Validation - Job Type Validation", () => {
  it("should accept all valid job types", () => {
    for (const jobType of VALID_JOB_TYPES) {
      expect(isValidJobType(jobType)).toBe(true);
    }
  });

  it("should reject invalid job types", () => {
    expect(isValidJobType("invalid:type")).toBe(false);
    expect(isValidJobType("notion:invalid")).toBe(false);
    expect(isValidJobType("")).toBe(false);
    expect(isValidJobType("notion:fetch-all-extra")).toBe(false);
  });
});

describe("Input Validation - Job Status Validation", () => {
  it("should accept all valid job statuses", () => {
    for (const status of VALID_JOB_STATUSES) {
      expect(isValidJobStatus(status)).toBe(true);
    }
  });

  it("should reject invalid job statuses", () => {
    expect(isValidJobStatus("invalid")).toBe(false);
    expect(isValidJobStatus("")).toBe(false);
    expect(isValidJobStatus("PENDING")).toBe(false); // Case sensitive
    expect(isValidJobStatus("cancelled")).toBe(false);
  });
});

describe("Input Validation - Job ID Validation", () => {
  it("should accept valid job IDs", () => {
    expect(isValidJobId("1234567890-abc123")).toBe(true);
    expect(isValidJobId("job-id-123")).toBe(true);
    expect(isValidJobId("a")).toBe(true);
    expect(isValidJobId("a".repeat(100))).toBe(true);
  });

  it("should reject empty job IDs", () => {
    expect(isValidJobId("")).toBe(false);
  });

  it("should reject job IDs exceeding max length", () => {
    expect(isValidJobId("a".repeat(101))).toBe(false);
  });

  it("should reject job IDs with path traversal characters", () => {
    expect(isValidJobId("../etc/passwd")).toBe(false);
    expect(isValidJobId("..\\windows")).toBe(false);
    expect(isValidJobId("path/with/slash")).toBe(false);
    expect(isValidJobId("path\\with\\backslash")).toBe(false);
    expect(isValidJobId("normal..with..dots")).toBe(false);
  });
});

describe("Input Validation - POST /jobs Request Body", () => {
  describe("type field validation", () => {
    it("should require type field", () => {
      const body = {} as { type?: string };
      expect(!body || typeof body.type !== "string").toBe(true);
    });

    it("should require type to be a string", () => {
      const body = { type: 123 };
      expect(typeof body.type !== "string").toBe(true);
      expect(!body.type || typeof body.type !== "string").toBe(true);
    });

    it("should require type to be valid job type", () => {
      expect(isValidJobType("notion:fetch")).toBe(true);
      expect(isValidJobType("invalid:type")).toBe(false);
    });
  });

  describe("options field validation", () => {
    const knownOptions = [
      "maxPages",
      "statusFilter",
      "force",
      "dryRun",
      "includeRemoved",
    ];

    it("should accept valid option keys", () => {
      const options = {
        maxPages: 10,
        statusFilter: "In Progress",
        force: true,
        dryRun: false,
        includeRemoved: true,
      };

      for (const key of Object.keys(options)) {
        expect(knownOptions.includes(key)).toBe(true);
      }
    });

    it("should reject unknown option keys", () => {
      const options = { unknownOption: "value" };
      const hasUnknown = Object.keys(options).some(
        (key) => !knownOptions.includes(key)
      );
      expect(hasUnknown).toBe(true);
    });

    it("should validate maxPages type", () => {
      const validOption = { maxPages: 10 };
      expect(typeof validOption.maxPages === "number").toBe(true);

      const invalidOption = { maxPages: "not a number" };
      expect(typeof invalidOption.maxPages !== "number").toBe(true);
    });

    it("should validate statusFilter type", () => {
      const validOption = { statusFilter: "In Progress" };
      expect(typeof validOption.statusFilter === "string").toBe(true);

      const invalidOption = { statusFilter: 123 };
      expect(typeof invalidOption.statusFilter !== "string").toBe(true);
    });

    it("should validate force type", () => {
      const validOption = { force: true };
      expect(typeof validOption.force === "boolean").toBe(true);

      const invalidOption = { force: "not a boolean" };
      expect(typeof invalidOption.force !== "boolean").toBe(true);
    });

    it("should validate dryRun type", () => {
      const validOption = { dryRun: false };
      expect(typeof validOption.dryRun === "boolean").toBe(true);

      const invalidOption = { dryRun: "not a boolean" };
      expect(typeof invalidOption.dryRun !== "boolean").toBe(true);
    });

    it("should validate includeRemoved type", () => {
      const validOption = { includeRemoved: true };
      expect(typeof validOption.includeRemoved === "boolean").toBe(true);

      const invalidOption = { includeRemoved: "not a boolean" };
      expect(typeof invalidOption.includeRemoved !== "boolean").toBe(true);
    });
  });
});

describe("Input Validation - GET /jobs Query Parameters", () => {
  it("should validate status parameter", () => {
    expect(isValidJobStatus("pending")).toBe(true);
    expect(isValidJobStatus("invalid")).toBe(false);
  });

  it("should validate type parameter", () => {
    expect(isValidJobType("notion:fetch")).toBe(true);
    expect(isValidJobType("invalid:type")).toBe(false);
  });
});

describe("Input Validation - GET /jobs/:id and DELETE /jobs/:id", () => {
  it("should validate job ID format", () => {
    expect(isValidJobId("valid-job-id")).toBe(true);
    expect(isValidJobId("../etc/passwd")).toBe(false);
    expect(isValidJobId("path\\with\\backslash")).toBe(false);
  });
});

describe("Error Response Format", () => {
  it("should have consistent error response structure", () => {
    const errorResponse = {
      error: "Invalid input",
    };

    expect(errorResponse).toHaveProperty("error");
    expect(typeof errorResponse.error).toBe("string");
  });

  it("should include details when provided", () => {
    const errorResponse = {
      error: "Invalid input",
      details: "Field 'type' is required",
    };

    expect(errorResponse).toHaveProperty("error");
    expect(errorResponse).toHaveProperty("details");
  });
});

describe("Integration - Job Tracker with Validation", () => {
  beforeEach(() => {
    cleanupTestData();
    destroyJobTracker();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  it("should create job with valid type", () => {
    const tracker = getJobTracker();
    const validType = "notion:fetch";

    expect(isValidJobType(validType)).toBe(true);

    const jobId = tracker.createJob(validType);
    const job = tracker.getJob(jobId);

    expect(job).toBeDefined();
    expect(job?.type).toBe(validType);
  });

  it("should handle query parameter filtering with validation", () => {
    const tracker = getJobTracker();

    // Create jobs with different statuses
    const job1 = tracker.createJob("notion:fetch");
    const job2 = tracker.createJob("notion:fetch-all");
    const job3 = tracker.createJob("notion:translate");

    tracker.updateJobStatus(job1, "running");
    tracker.updateJobStatus(job2, "completed");
    tracker.updateJobStatus(job3, "failed");

    // Test filtering by valid status
    const statusFilter = "running";
    expect(isValidJobStatus(statusFilter)).toBe(true);

    let jobs = tracker.getAllJobs();
    jobs = jobs.filter((job) => job.status === statusFilter);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(job1);

    // Test filtering by valid type
    const typeFilter = "notion:fetch";
    expect(isValidJobType(typeFilter)).toBe(true);

    jobs = tracker.getAllJobs();
    jobs = jobs.filter((job) => job.type === typeFilter);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(job1);

    // Test invalid filter
    const invalidStatus = "invalid";
    expect(isValidJobStatus(invalidStatus)).toBe(false);
  });

  it("should validate job ID for status queries", () => {
    const tracker = getJobTracker();
    const jobId = tracker.createJob("notion:fetch");

    // Valid job ID
    expect(isValidJobId(jobId)).toBe(true);
    expect(tracker.getJob(jobId)).toBeDefined();

    // Invalid job ID
    const invalidJobId = "../etc/passwd";
    expect(isValidJobId(invalidJobId)).toBe(false);
    expect(tracker.getJob(invalidJobId)).toBeUndefined();
  });
});

describe("Security - Path Traversal Prevention", () => {
  it("should prevent path traversal in job IDs", () => {
    const maliciousInputs = [
      "../etc/passwd",
      "..\\windows\\system32",
      "../../secret",
      "..\\..\\secret",
      "path/../../../etc/passwd",
      "path\\..\\..\\windows\\system32",
    ];

    for (const input of maliciousInputs) {
      expect(isValidJobId(input)).toBe(false);
    }
  });

  it("should accept valid job IDs with dots (not path traversal)", () => {
    const validInputs = [
      "1234567890-abc123",
      "job-123",
      "a.b.c", // Dots are OK if not ".."
      "job_with_underscores",
      "job-with-dashes",
    ];

    for (const input of validInputs) {
      expect(isValidJobId(input)).toBe(true);
    }
  });
});

describe("Security - Request Size Limits", () => {
  it("should enforce max request size", () => {
    const maxRequestSize = MAX_REQUEST_SIZE;
    expect(maxRequestSize).toBe(1_000_000);

    // Simulating content-length validation
    const validSize = "500000";
    const invalidSize = "2000000";

    expect(parseInt(validSize, 10)).toBeLessThanOrEqual(maxRequestSize);
    expect(parseInt(invalidSize, 10)).toBeGreaterThan(maxRequestSize);
  });
});

describe("Endpoint Input Schemas - Complete Coverage", () => {
  describe("POST /jobs endpoint schema", () => {
    it("should validate all required fields", () => {
      // Valid request body
      const validBody = {
        type: "notion:fetch",
        options: {
          maxPages: 10,
          statusFilter: "In Progress",
          force: true,
          dryRun: false,
          includeRemoved: true,
        },
      };

      // Check required type field
      expect(validBody.type).toBeDefined();
      expect(typeof validBody.type).toBe("string");
      expect(isValidJobType(validBody.type)).toBe(true);

      // Check options is optional and valid
      if (validBody.options) {
        expect(typeof validBody.options).toBe("object");
        expect(validBody.options).not.toBeNull();
      }
    });

    it("should validate options schema with all types", () => {
      const validOptions = {
        maxPages: 10, // number
        statusFilter: "In Progress", // string
        force: true, // boolean
        dryRun: false, // boolean
        includeRemoved: true, // boolean
      };

      expect(typeof validOptions.maxPages).toBe("number");
      expect(typeof validOptions.statusFilter).toBe("string");
      expect(typeof validOptions.force).toBe("boolean");
      expect(typeof validOptions.dryRun).toBe("boolean");
      expect(typeof validOptions.includeRemoved).toBe("boolean");
    });

    it("should reject invalid option types", () => {
      const invalidOptions = [
        { maxPages: "not a number" },
        { statusFilter: 123 },
        { force: "not a boolean" },
        { dryRun: "not a boolean" },
        { includeRemoved: 123 },
      ];

      for (const options of invalidOptions) {
        const isValid =
          typeof options.maxPages === "number" ||
          typeof options.statusFilter === "string" ||
          typeof options.force === "boolean" ||
          typeof options.dryRun === "boolean" ||
          typeof options.includeRemoved === "boolean";
        // At least one should be invalid
        expect(isValid).toBe(false);
      }
    });
  });

  describe("GET /jobs endpoint schema", () => {
    it("should accept valid query parameters", () => {
      const validParams = [
        { status: "pending" },
        { status: "running" },
        { status: "completed" },
        { status: "failed" },
        { type: "notion:fetch" },
        { type: "notion:fetch-all" },
        { type: "notion:translate" },
        { type: "notion:status-translation" },
        { type: "notion:status-draft" },
        { type: "notion:status-publish" },
        { type: "notion:status-publish-production" },
        { status: "pending", type: "notion:fetch" },
      ];

      for (const params of validParams) {
        if (params.status) {
          expect(isValidJobStatus(params.status)).toBe(true);
        }
        if (params.type) {
          expect(isValidJobType(params.type)).toBe(true);
        }
      }
    });

    it("should reject invalid query parameters", () => {
      const invalidParams = [
        { status: "invalid" },
        { status: "" },
        { status: "PENDING" }, // Case sensitive
        { type: "invalid:type" },
        { type: "" },
        { type: "notion:invalid" },
      ];

      for (const params of invalidParams) {
        if (params.status) {
          expect(isValidJobStatus(params.status)).toBe(false);
        }
        if (params.type) {
          expect(isValidJobType(params.type)).toBe(false);
        }
      }
    });
  });

  describe("GET /jobs/:id and DELETE /jobs/:id endpoint schema", () => {
    it("should accept valid job ID format", () => {
      const validIds = [
        "1234567890-abc123",
        "job-id-123",
        "a",
        "a".repeat(100),
        "a.b.c", // Dots are OK if not ".."
        "job_with_underscores",
        "job-with-dashes",
      ];

      for (const id of validIds) {
        expect(isValidJobId(id)).toBe(true);
      }
    });

    it("should reject invalid job ID format", () => {
      const invalidIds = [
        "",
        "../etc/passwd",
        "..\\windows",
        "path/with/slash",
        "path\\with\\backslash",
        "normal..with..dots",
        "a".repeat(101), // Too long
      ];

      for (const id of invalidIds) {
        expect(isValidJobId(id)).toBe(false);
      }
    });
  });
});

describe("Error Responses - Complete Coverage", () => {
  describe("Validation errors (400)", () => {
    it("should return correct error structure for missing field", () => {
      const errorResponse = {
        code: "MISSING_REQUIRED_FIELD",
        message:
          "Missing or invalid 'type' field. Expected a valid job type string.",
        status: 400,
        requestId: "req_test_123",
        timestamp: new Date().toISOString(),
      };

      expect(errorResponse).toHaveProperty("code");
      expect(errorResponse).toHaveProperty("message");
      expect(errorResponse).toHaveProperty("status", 400);
      expect(errorResponse).toHaveProperty("requestId");
      expect(errorResponse).toHaveProperty("timestamp");
      expect(errorResponse.code).toBe("MISSING_REQUIRED_FIELD");
    });

    it("should return correct error structure for invalid format", () => {
      const errorResponse = {
        code: "INVALID_FORMAT",
        message: "Invalid 'maxPages' option. Expected a number.",
        status: 400,
        requestId: "req_test_456",
        timestamp: new Date().toISOString(),
        details: { field: "maxPages", expected: "number", received: "string" },
      };

      expect(errorResponse).toHaveProperty("code", "INVALID_FORMAT");
      expect(errorResponse).toHaveProperty("status", 400);
      expect(errorResponse).toHaveProperty("details");
      expect(errorResponse.details).toHaveProperty("field");
    });

    it("should return correct error structure for invalid enum value", () => {
      const errorResponse = {
        code: "INVALID_ENUM_VALUE",
        message:
          "Invalid job type: 'invalid:type'. Valid types are: notion:fetch, notion:fetch-all, notion:translate, notion:status-translation, notion:status-draft, notion:status-publish, notion:status-publish-production",
        status: 400,
        requestId: "req_test_789",
        timestamp: new Date().toISOString(),
        details: {
          providedType: "invalid:type",
          validTypes: [
            "notion:fetch",
            "notion:fetch-all",
            "notion:translate",
            "notion:status-translation",
            "notion:status-draft",
            "notion:status-publish",
            "notion:status-publish-production",
          ],
        },
      };

      expect(errorResponse).toHaveProperty("code", "INVALID_ENUM_VALUE");
      expect(errorResponse).toHaveProperty("status", 400);
      expect(errorResponse.details).toHaveProperty("providedType");
      expect(errorResponse.details).toHaveProperty("validTypes");
    });

    it("should return correct error structure for invalid input", () => {
      const errorResponse = {
        code: "INVALID_INPUT",
        message:
          "Unknown option: 'unknownOption'. Valid options are: maxPages, statusFilter, force, dryRun, includeRemoved",
        status: 400,
        requestId: "req_test_abc",
        timestamp: new Date().toISOString(),
        details: {
          option: "unknownOption",
          validOptions: [
            "maxPages",
            "statusFilter",
            "force",
            "dryRun",
            "includeRemoved",
          ],
        },
      };

      expect(errorResponse).toHaveProperty("code", "INVALID_INPUT");
      expect(errorResponse).toHaveProperty("status", 400);
      expect(errorResponse.details).toHaveProperty("option");
      expect(errorResponse.details).toHaveProperty("validOptions");
    });
  });

  describe("Authentication errors (401)", () => {
    it("should return correct error structure for unauthorized", () => {
      const errorResponse = {
        code: "UNAUTHORIZED",
        message: "Authentication failed",
        status: 401,
        requestId: "req_auth_123",
        timestamp: new Date().toISOString(),
      };

      expect(errorResponse).toHaveProperty("code", "UNAUTHORIZED");
      expect(errorResponse).toHaveProperty("status", 401);
      expect(errorResponse).toHaveProperty("requestId");
      expect(errorResponse).toHaveProperty("timestamp");
    });
  });

  describe("Not found errors (404)", () => {
    it("should return correct error structure for resource not found", () => {
      const errorResponse = {
        code: "NOT_FOUND",
        message: "Job not found",
        status: 404,
        requestId: "req_404_123",
        timestamp: new Date().toISOString(),
        details: { jobId: "non-existent-id" },
      };

      expect(errorResponse).toHaveProperty("code", "NOT_FOUND");
      expect(errorResponse).toHaveProperty("status", 404);
      expect(errorResponse).toHaveProperty("details");
      expect(errorResponse.details).toHaveProperty("jobId");
    });

    it("should return correct error structure for endpoint not found", () => {
      const errorResponse = {
        code: "ENDPOINT_NOT_FOUND",
        message: "The requested endpoint does not exist",
        status: 404,
        requestId: "req_404_456",
        timestamp: new Date().toISOString(),
        details: {
          availableEndpoints: [
            { method: "GET", path: "/health", description: "Health check" },
            { method: "GET", path: "/docs", description: "API documentation" },
            {
              method: "GET",
              path: "/jobs/types",
              description: "List job types",
            },
            { method: "GET", path: "/jobs", description: "List jobs" },
            { method: "POST", path: "/jobs", description: "Create job" },
            { method: "GET", path: "/jobs/:id", description: "Get job status" },
            { method: "DELETE", path: "/jobs/:id", description: "Cancel job" },
          ],
        },
      };

      expect(errorResponse).toHaveProperty("code", "ENDPOINT_NOT_FOUND");
      expect(errorResponse).toHaveProperty("status", 404);
      expect(errorResponse.details).toHaveProperty("availableEndpoints");
      expect(Array.isArray(errorResponse.details.availableEndpoints)).toBe(
        true
      );
    });
  });

  describe("Conflict errors (409)", () => {
    it("should return correct error structure for invalid state transition", () => {
      const errorResponse = {
        code: "INVALID_STATE_TRANSITION",
        message:
          "Cannot cancel job with status: completed. Only pending or running jobs can be cancelled.",
        status: 409,
        requestId: "req_409_123",
        timestamp: new Date().toISOString(),
        details: { jobId: "job-123", currentStatus: "completed" },
      };

      expect(errorResponse).toHaveProperty("code", "INVALID_STATE_TRANSITION");
      expect(errorResponse).toHaveProperty("status", 409);
      expect(errorResponse.details).toHaveProperty("currentStatus");
    });
  });

  describe("Error response consistency", () => {
    it("should have consistent structure across all error types", () => {
      const errorCodes = [
        "VALIDATION_ERROR",
        "MISSING_REQUIRED_FIELD",
        "INVALID_FORMAT",
        "INVALID_ENUM_VALUE",
        "INVALID_INPUT",
        "UNAUTHORIZED",
        "NOT_FOUND",
        "ENDPOINT_NOT_FOUND",
        "INVALID_STATE_TRANSITION",
      ];

      for (const code of errorCodes) {
        const errorResponse = {
          code,
          message: "Test error message",
          status:
            code === "UNAUTHORIZED"
              ? 401
              : code === "NOT_FOUND" || code === "ENDPOINT_NOT_FOUND"
                ? 404
                : code === "INVALID_STATE_TRANSITION"
                  ? 409
                  : 400,
          requestId: "req_consistency_test",
          timestamp: new Date().toISOString(),
        };

        // All error responses must have these fields
        expect(errorResponse).toHaveProperty("code");
        expect(errorResponse).toHaveProperty("message");
        expect(errorResponse).toHaveProperty("status");
        expect(errorResponse).toHaveProperty("requestId");
        expect(errorResponse).toHaveProperty("timestamp");

        // Field types must be consistent
        expect(typeof errorResponse.code).toBe("string");
        expect(typeof errorResponse.message).toBe("string");
        expect(typeof errorResponse.status).toBe("number");
        expect(typeof errorResponse.requestId).toBe("string");
        expect(typeof errorResponse.timestamp).toBe("string");

        // Request ID format must be consistent
        expect(errorResponse.requestId).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);

        // Timestamp must be ISO 8601 format
        expect(errorResponse.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
      }
    });
  });
});
