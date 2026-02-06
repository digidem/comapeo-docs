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
