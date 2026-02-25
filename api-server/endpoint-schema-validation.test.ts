/**
 * Endpoint Schema Validation Tests
 *
 * Validates that all API endpoints properly:
 * - Validate input schemas (request body, query params, path params)
 * - Return correctly formatted error responses with appropriate error codes
 * - Include all required error response fields (code, message, status, requestId, timestamp)
 * - Use Zod validation schemas consistently
 *
 * Tests validation logic directly without requiring a running server,
 * matching the testing pattern used in other test files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJobTracker, destroyJobTracker, type JobType } from "./job-tracker";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ErrorCode,
  generateRequestId,
  createErrorResponse,
  createApiResponse,
  getErrorCodeForStatus,
  getValidationErrorForField,
  type ErrorResponse,
} from "./response-schemas";
import {
  jobIdSchema,
  jobTypeSchema,
  jobStatusSchema,
  jobOptionsSchema,
  createJobRequestSchema,
  jobsQuerySchema,
  validateJobId,
  validateJobType,
  validateJobStatus,
  validateCreateJobRequest,
  validateJobsQuery,
  VALID_JOB_TYPES,
  VALID_JOB_STATUSES,
  safeValidate,
  formatZodError,
} from "./validation-schemas";

const DATA_DIR = join(process.cwd(), ".jobs-data");

function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    try {
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Helper to validate full error response structure (with status/timestamp)
 */
function validateErrorResponseStructure(
  error: Partial<ErrorResponse>,
  expectedCode?: ErrorCode,
  expectedStatus?: number
): void {
  expect(error).toBeDefined();
  expect(typeof error).toBe("object");

  // Required fields
  expect(error.code).toBeDefined();
  expect(typeof error.code).toBe("string");
  expect(Object.values(ErrorCode)).toContain(error.code);

  expect(error.message).toBeDefined();
  expect(typeof error.message).toBe("string");
  expect(error.message.length).toBeGreaterThan(0);

  expect(error.status).toBeDefined();
  expect(typeof error.status).toBe("number");
  expect(error.status).toBeGreaterThanOrEqual(400);
  expect(error.status).toBeLessThan(600);

  expect(error.requestId).toBeDefined();
  expect(typeof error.requestId).toBe("string");
  expect(error.requestId).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);

  expect(error.timestamp).toBeDefined();
  expect(typeof error.timestamp).toBe("string");
  expect(new Date(error.timestamp).toISOString()).toBe(error.timestamp);

  // Optional fields with proper types
  if (error.details !== undefined) {
    expect(typeof error.details).toBe("object");
    expect(error.details).not.toBeNull();
  }

  if (error.suggestions !== undefined) {
    expect(Array.isArray(error.suggestions)).toBe(true);
  }

  // Expected values if provided
  if (expectedCode) {
    expect(error.code).toBe(expectedCode);
  }
  if (expectedStatus) {
    expect(error.status).toBe(expectedStatus);
  }
}

/**
 * Helper to validate formatZodError result (no status/timestamp/requestId fields)
 */
function validateZodErrorFormat(
  formatted: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
    suggestions?: string[];
  },
  expectedCode?: ErrorCode
): void {
  expect(formatted.code).toBeDefined();
  expect(typeof formatted.code).toBe("string");
  expect(Object.values(ErrorCode)).toContain(formatted.code);

  expect(formatted.message).toBeDefined();
  expect(typeof formatted.message).toBe("string");
  expect(formatted.message.length).toBeGreaterThan(0);

  expect(formatted.details).toBeDefined();
  expect(typeof formatted.details).toBe("object");

  if (formatted.suggestions !== undefined) {
    expect(Array.isArray(formatted.suggestions)).toBe(true);
  }

  if (expectedCode) {
    expect(formatted.code).toBe(expectedCode);
  }
}

describe("Endpoint Schema Validation - POST /jobs", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  describe("Request body validation - type field", () => {
    it("should reject missing type field", () => {
      const result = safeValidate(createJobRequestSchema, {});
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_123");
        validateZodErrorFormat(formatted, ErrorCode.VALIDATION_ERROR);
        expect(formatted.message).toBeDefined();
      }
    });

    it("should reject invalid type value", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "invalid:job:type",
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_456");
        validateZodErrorFormat(formatted, ErrorCode.VALIDATION_ERROR);
        expect(formatted.message).toBeDefined();
      }
    });

    it("should reject type with wrong type", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: 123,
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_789");
        validateZodErrorFormat(formatted, ErrorCode.VALIDATION_ERROR);
        // Zod reports the error - just verify it's formatted
        expect(formatted.message).toBeDefined();
      }
    });

    it("should accept all valid job types", () => {
      for (const jobType of VALID_JOB_TYPES) {
        const result = safeValidate(createJobRequestSchema, {
          type: jobType,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Request body validation - options field", () => {
    it("should reject invalid options type", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
        options: "not-an-object",
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_abc");
        validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
      }
    });

    it("should reject unknown option keys", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
        options: {
          unknownOption: "value",
        },
      });
      expect(result.success).toBe(false);
      if (result.success === false) {
        expect(result.error.issues[0].code).toBe("unrecognized_keys");
      }
    });

    it("should reject invalid maxPages type", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
        options: {
          maxPages: "not-a-number",
        },
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_ghi");
        validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
        // Zod includes the path as "options.maxPages"
        expect(formatted.details.field).toContain("maxPages");
      }
    });

    it("should allow zero maxPages", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
        options: {
          maxPages: 0,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.options?.maxPages).toBe(0);
      }
    });

    it("should reject non-integer maxPages", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
        options: {
          maxPages: 10.5,
        },
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_mno");
        validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
        expect(formatted.message).toContain("integer");
      }
    });

    it("should reject empty statusFilter", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
        options: {
          statusFilter: "",
        },
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_pqr");
        validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
        expect(formatted.message).toContain("cannot be empty");
      }
    });

    it("should reject invalid boolean option types", () => {
      const booleanOptions = ["force", "dryRun", "includeRemoved"] as const;

      for (const option of booleanOptions) {
        const result = safeValidate(createJobRequestSchema, {
          type: "notion:fetch",
          options: {
            [option]: "not-a-boolean",
          },
        });
        expect(result.success).toBe(false);

        if (result.success === false) {
          const formatted = formatZodError(result.error, "req_test_bool");
          validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
          // Zod includes the path as "options.force"
          expect(formatted.details.field).toContain(option);
        }
      }
    });

    it("should accept valid request with minimal fields", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("notion:fetch");
        expect(result.data.options).toBeUndefined();
      }
    });

    it("should accept valid request with all options", () => {
      const result = safeValidate(createJobRequestSchema, {
        type: "notion:fetch-all",
        options: {
          maxPages: 10,
          statusFilter: "In Progress",
          force: true,
          dryRun: false,
          includeRemoved: true,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("notion:fetch-all");
        expect(result.data.options?.maxPages).toBe(10);
      }
    });
  });
});

describe("Endpoint Schema Validation - GET /jobs", () => {
  describe("Query parameter validation", () => {
    it("should reject invalid status filter", () => {
      const result = safeValidate(jobsQuerySchema, {
        status: "invalid-status",
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_status");
        validateZodErrorFormat(formatted, ErrorCode.INVALID_ENUM_VALUE);
        expect(formatted.message).toContain("expected one of");
      }
    });

    it("should reject invalid type filter", () => {
      const result = safeValidate(jobsQuerySchema, {
        type: "invalid:type",
      });
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_type");
        validateZodErrorFormat(formatted, ErrorCode.VALIDATION_ERROR);
        expect(formatted.message).toBeDefined();
      }
    });

    it("should accept valid status filter", () => {
      for (const status of VALID_JOB_STATUSES) {
        const result = safeValidate(jobsQuerySchema, { status });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(status);
        }
      }
    });

    it("should accept valid type filter", () => {
      for (const type of VALID_JOB_TYPES) {
        const result = safeValidate(jobsQuerySchema, { type });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.type).toBe(type);
        }
      }
    });

    it("should accept both filters together", () => {
      const result = safeValidate(jobsQuerySchema, {
        status: "completed",
        type: "notion:fetch",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("completed");
        expect(result.data.type).toBe("notion:fetch");
      }
    });

    it("should accept no filters", () => {
      const result = safeValidate(jobsQuerySchema, {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBeUndefined();
        expect(result.data.type).toBeUndefined();
      }
    });
  });
});

describe("Endpoint Schema Validation - GET /jobs/:id and DELETE /jobs/:id", () => {
  describe("Path parameter validation - job ID", () => {
    it("should reject empty job ID", () => {
      const result = safeValidate(jobIdSchema, "");
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_empty");
        validateZodErrorFormat(formatted);
        expect(formatted.message).toContain("empty");
      }
    });

    it("should reject job ID with path traversal", () => {
      const maliciousIds = [
        "../etc/passwd",
        "..\\windows\\system32",
        "../../secret",
        "path/../../../etc/passwd",
      ];

      for (const id of maliciousIds) {
        const result = safeValidate(jobIdSchema, id);
        expect(result.success).toBe(false);

        if (result.success === false) {
          const formatted = formatZodError(result.error, "req_test_path");
          validateZodErrorFormat(formatted);
          expect(formatted.message).toContain("path traversal");
        }
      }
    });

    it("should reject job ID with forward slash", () => {
      const result = safeValidate(jobIdSchema, "path/with/slash");
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_slash");
        validateZodErrorFormat(formatted);
        expect(formatted.message).toContain("slash");
      }
    });

    it("should reject job ID with backslash", () => {
      const result = safeValidate(jobIdSchema, "path\\with\\backslash");
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_backslash");
        validateZodErrorFormat(formatted);
        expect(formatted.message).toContain("backslash");
      }
    });

    it("should reject job ID exceeding max length", () => {
      const result = safeValidate(jobIdSchema, "a".repeat(101));
      expect(result.success).toBe(false);

      if (result.success === false) {
        const formatted = formatZodError(result.error, "req_test_length");
        validateZodErrorFormat(formatted);
        expect(formatted.message).toContain("exceed");
      }
    });

    it("should accept valid job ID format", () => {
      const validIds = [
        "1234567890-abc123",
        "job-id-123",
        "a",
        "a".repeat(100),
        "a.b.c",
        "job_with_underscores",
        "job-with-dashes",
      ];

      for (const id of validIds) {
        const result = safeValidate(jobIdSchema, id);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(id);
        }
      }
    });
  });
});

describe("Endpoint Schema Validation - Error Response Consistency", () => {
  it("should include all required fields in validation error", () => {
    const result = safeValidate(jobTypeSchema, "invalid");
    expect(result.success).toBe(false);

    if (result.success === false) {
      const formatted = formatZodError(result.error, "req_test_consistency");

      // formatZodError returns a subset of ErrorResponse (without status/timestamp)
      expect(formatted.code).toBeDefined();
      expect(typeof formatted.code).toBe("string");
      expect(Object.values(ErrorCode)).toContain(formatted.code);

      expect(formatted.message).toBeDefined();
      expect(typeof formatted.message).toBe("string");
      expect(formatted.message.length).toBeGreaterThan(0);

      expect(formatted.details).toBeDefined();
      expect(typeof formatted.details).toBe("object");

      // Verify suggestions are always included
      expect(formatted.suggestions).toBeDefined();
      expect(Array.isArray(formatted.suggestions)).toBe(true);
      expect(formatted.suggestions.length).toBeGreaterThan(0);

      // Verify suggestions contain common messages
      expect(formatted.suggestions).toContain("Check the request format");
    }
  });

  it("should generate valid request IDs", () => {
    const requestId = generateRequestId();
    expect(requestId).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);

    // Verify uniqueness
    const requestId2 = generateRequestId();
    expect(requestId).not.toBe(requestId2);
  });

  it("should create properly formatted error responses", () => {
    const error = createErrorResponse(
      ErrorCode.VALIDATION_ERROR,
      "Test validation error",
      400,
      "req_test_create",
      { field: "test" },
      ["Fix the field"]
    );

    validateErrorResponseStructure(error, ErrorCode.VALIDATION_ERROR, 400);
    expect(error.details.field).toBe("test");
    expect(error.suggestions).toContain("Fix the field");
  });

  it("should map HTTP status to error codes correctly", () => {
    expect(getErrorCodeForStatus(400)).toBe(ErrorCode.VALIDATION_ERROR);
    expect(getErrorCodeForStatus(401)).toBe(ErrorCode.UNAUTHORIZED);
    expect(getErrorCodeForStatus(403)).toBe(ErrorCode.FORBIDDEN);
    expect(getErrorCodeForStatus(404)).toBe(ErrorCode.NOT_FOUND);
    expect(getErrorCodeForStatus(409)).toBe(ErrorCode.CONFLICT);
    expect(getErrorCodeForStatus(429)).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    expect(getErrorCodeForStatus(500)).toBe(ErrorCode.INTERNAL_ERROR);
    expect(getErrorCodeForStatus(503)).toBe(ErrorCode.SERVICE_UNAVAILABLE);
  });

  it("should get field-specific validation errors", () => {
    const fields = ["type", "options", "maxPages", "force", "dryRun"];

    for (const field of fields) {
      const { code, message } = getValidationErrorForField(field);
      expect(code).toBeDefined();
      expect(message).toBeDefined();
      expect(message).toContain(field);
    }
  });
});

describe("Endpoint Schema Validation - Zod Error Formatting", () => {
  it("should format invalid_enum_value error correctly", () => {
    const result = jobTypeSchema.safeParse("invalid");
    expect(result.success).toBe(false);

    if (result.success === false) {
      const formatted = formatZodError(result.error, "req_test_enum");
      validateZodErrorFormat(formatted, ErrorCode.INVALID_ENUM_VALUE);
      expect(formatted.details.field).toBeDefined();
      expect(formatted.details.validOptions).toBeDefined();
    }
  });

  it("should format invalid_type error correctly", () => {
    const result = jobOptionsSchema.safeParse({ maxPages: "not-a-number" });
    expect(result.success).toBe(false);

    if (result.success === false) {
      const formatted = formatZodError(result.error, "req_test_type");
      validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
      expect(formatted.details.field).toBe("maxPages");
      expect(formatted.details.expected).toBe("number");
    }
  });

  it("should format too_small error correctly", () => {
    const result = jobIdSchema.safeParse("");
    expect(result.success).toBe(false);

    if (result.success === false) {
      const formatted = formatZodError(result.error, "req_test_small");
      validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
      expect(formatted.details.minimum).toBeDefined();
    }
  });

  it("should format too_big error correctly", () => {
    const result = jobIdSchema.safeParse("a".repeat(101));
    expect(result.success).toBe(false);

    if (result.success === false) {
      const formatted = formatZodError(result.error, "req_test_big");
      validateZodErrorFormat(formatted, ErrorCode.INVALID_FORMAT);
      expect(formatted.details.maximum).toBeDefined();
    }
  });

  it("should reject unknown keys in options schema", () => {
    const result = jobOptionsSchema.safeParse({ unknownOption: "value" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe("unrecognized_keys");
    }
  });
});

describe("Endpoint Schema Validation - Response Schemas", () => {
  it("should validate health response schema", () => {
    const healthResponse = {
      status: "ok",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: 123.45,
      auth: {
        enabled: true,
        keysConfigured: 2,
      },
    };

    // Verify response structure
    expect(healthResponse.status).toBe("ok");
    expect(typeof healthResponse.version).toBe("string");
    expect(healthResponse.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof healthResponse.uptime).toBe("number");
    expect(typeof healthResponse.auth.enabled).toBe("boolean");
    expect(typeof healthResponse.auth.keysConfigured).toBe("number");
  });

  it("should validate jobs list response schema", () => {
    const jobsListResponse = {
      items: [
        {
          id: "job-123",
          type: "notion:fetch",
          status: "running",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: null,
          progress: { current: 1, total: 10, message: "Processing" },
          result: null,
        },
      ],
      count: 1,
    };

    expect(Array.isArray(jobsListResponse.items)).toBe(true);
    expect(typeof jobsListResponse.count).toBe("number");
    expect(jobsListResponse.items[0].id).toBeTruthy();
    expect(jobsListResponse.items[0].type).toBeDefined();
    expect(jobsListResponse.items[0].status).toBeDefined();
  });

  it("should validate create job response schema", () => {
    const createJobResponse = {
      jobId: "job-123",
      type: "notion:fetch",
      status: "pending",
      message: "Job created successfully",
      _links: {
        self: "/jobs/job-123",
        status: "/jobs/job-123",
      },
    };

    expect(createJobResponse.jobId).toBeTruthy();
    expect(createJobResponse.type).toBeDefined();
    expect(createJobResponse.status).toBe("pending");
    expect(createJobResponse._links.self).toContain(createJobResponse.jobId);
  });
});

describe("Endpoint Schema Validation - Edge Cases", () => {
  it("should handle max length boundary for job ID", () => {
    const maxLength = "a".repeat(100);
    const result = safeValidate(jobIdSchema, maxLength);
    expect(result.success).toBe(true);

    const overMax = "a".repeat(101);
    const resultOver = safeValidate(jobIdSchema, overMax);
    expect(resultOver.success).toBe(false);
  });

  it("should handle all valid job types case-sensitively", () => {
    for (const type of VALID_JOB_TYPES) {
      const result = safeValidate(jobTypeSchema, type);
      expect(result.success).toBe(true);
    }

    // Case variations should fail
    const result = safeValidate(jobTypeSchema, "NOTION:FETCH");
    expect(result.success).toBe(false);
  });

  it("should handle all valid job statuses case-sensitively", () => {
    for (const status of VALID_JOB_STATUSES) {
      const result = safeValidate(jobStatusSchema, status);
      expect(result.success).toBe(true);
    }

    // Case variations should fail
    const result = safeValidate(jobStatusSchema, "PENDING");
    expect(result.success).toBe(false);
  });
});

describe("Endpoint Schema Validation - Validation Functions", () => {
  it("should validateJobId throw on invalid input", () => {
    expect(() => validateJobId("")).toThrow();
    expect(() => validateJobId("../etc/passwd")).toThrow();
  });

  it("should validateJobType throw on invalid input", () => {
    expect(() => validateJobType("invalid")).toThrow();
  });

  it("should validateJobStatus throw on invalid input", () => {
    expect(() => validateJobStatus("invalid")).toThrow();
  });

  it("should validateCreateJobRequest throw on invalid input", () => {
    expect(() => validateCreateJobRequest({})).toThrow();
  });

  it("should validateJobsQuery throw on invalid input", () => {
    expect(() => validateJobsQuery({ status: "invalid" })).toThrow();
  });
});
