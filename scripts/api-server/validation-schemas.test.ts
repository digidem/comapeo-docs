/**
 * Validation Schemas Tests
 *
 * Comprehensive tests for the centralized Zod-based validation schemas.
 * Tests cover all input schemas, edge cases, and error formatting.
 */

import { describe, it, expect } from "vitest";
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
  safeValidate,
  formatZodError,
  VALID_JOB_TYPES,
  VALID_JOB_STATUSES,
  MAX_JOB_ID_LENGTH,
  type CreateJobRequest,
  type JobsQuery,
} from "./validation-schemas";
import { ErrorCode } from "./response-schemas";

describe("Validation Schemas - Job ID", () => {
  describe("jobIdSchema", () => {
    const validIds = [
      "1234567890-abc123",
      "job-id-123",
      "a",
      "a".repeat(100),
      "a.b.c", // Dots are OK if not ".."
      "job_with_underscores",
      "job-with-dashes",
    ];

    const invalidIds = [
      { value: "", expectedError: "cannot be empty" },
      { value: "a".repeat(101), expectedError: "cannot exceed" },
      { value: "../etc/passwd", expectedError: "path traversal" },
      { value: "..\\windows", expectedError: "path traversal" },
      { value: "path/with/slash", expectedError: "forward slashes" },
      { value: "path\\with\\backslash", expectedError: "backslashes" },
      { value: "normal..with..dots", expectedError: "path traversal" },
    ];

    it("should accept valid job IDs", () => {
      for (const id of validIds) {
        const result = jobIdSchema.safeParse(id);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(id);
        }
      }
    });

    it("should reject invalid job IDs", () => {
      for (const { value, expectedError } of invalidIds) {
        const result = jobIdSchema.safeParse(value);
        expect(result.success).toBe(false);
        if (!result.success && result.error) {
          expect(result.error.issues[0].message).toContain(expectedError);
        }
      }
    });
  });

  describe("validateJobId function", () => {
    it("should return validated job ID for valid input", () => {
      expect(validateJobId("valid-job-id")).toBe("valid-job-id");
    });

    it("should throw ZodError for invalid input", () => {
      expect(() => validateJobId("")).toThrow();
      expect(() => validateJobId("../etc/passwd")).toThrow();
    });
  });
});

describe("Validation Schemas - Job Type", () => {
  describe("jobTypeSchema", () => {
    it("should accept all valid job types", () => {
      for (const jobType of VALID_JOB_TYPES) {
        const result = jobTypeSchema.safeParse(jobType);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(jobType);
        }
      }
    });

    it("should reject invalid job types", () => {
      const invalidTypes = [
        "invalid:type",
        "notion:invalid",
        "",
        "notion:fetch-all-extra",
        "NOTION:FETCH", // Case sensitive
      ];

      for (const type of invalidTypes) {
        const result = jobTypeSchema.safeParse(type);
        expect(result.success).toBe(false);
      }
    });

    it("should provide helpful error message for invalid type", () => {
      const result = jobTypeSchema.safeParse("invalid:type");
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        expect(result.error.issues[0].message).toContain("Invalid option");
        expect(result.error.issues[0].message).toContain("notion:fetch");
      }
    });
  });

  describe("validateJobType function", () => {
    it("should return validated job type for valid input", () => {
      expect(validateJobType("notion:fetch")).toBe("notion:fetch");
    });

    it("should throw ZodError for invalid input", () => {
      expect(() => validateJobType("invalid:type")).toThrow();
    });
  });
});

describe("Validation Schemas - Job Status", () => {
  describe("jobStatusSchema", () => {
    it("should accept all valid job statuses", () => {
      for (const status of VALID_JOB_STATUSES) {
        const result = jobStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(status);
        }
      }
    });

    it("should reject invalid job statuses", () => {
      const invalidStatuses = [
        "invalid",
        "",
        "PENDING", // Case sensitive
        "cancelled",
        "Running",
      ];

      for (const status of invalidStatuses) {
        const result = jobStatusSchema.safeParse(status);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("validateJobStatus function", () => {
    it("should return validated job status for valid input", () => {
      expect(validateJobStatus("pending")).toBe("pending");
    });

    it("should throw ZodError for invalid input", () => {
      expect(() => validateJobStatus("invalid")).toThrow();
    });
  });
});

describe("Validation Schemas - Job Options", () => {
  describe("jobOptionsSchema", () => {
    it("should accept valid options object", () => {
      const validOptions = [
        { maxPages: 10 },
        { statusFilter: "In Progress" },
        { force: true },
        { dryRun: false },
        { includeRemoved: true },
        {
          maxPages: 10,
          statusFilter: "In Progress",
          force: true,
          dryRun: false,
          includeRemoved: true,
        },
        {}, // Empty options is valid
      ];

      for (const options of validOptions) {
        const result = jobOptionsSchema.safeParse(options);
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid maxPages type", () => {
      const result = jobOptionsSchema.safeParse({ maxPages: "not a number" });
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        expect(result.error.issues[0].message).toContain("expected number");
      }
    });

    it("should reject non-positive maxPages", () => {
      const invalidValues = [0, -1, -100];

      for (const value of invalidValues) {
        const result = jobOptionsSchema.safeParse({ maxPages: value });
        expect(result.success).toBe(false);
        if (!result.success && result.error) {
          expect(result.error.issues[0].message).toContain("greater than 0");
        }
      }
    });

    it("should reject non-integer maxPages", () => {
      const result = jobOptionsSchema.safeParse({ maxPages: 10.5 });
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        expect(result.error.issues[0].message).toContain("integer");
      }
    });

    it("should reject invalid boolean options", () => {
      const booleanOptions = ["force", "dryRun", "includeRemoved"] as const;

      for (const option of booleanOptions) {
        const result = jobOptionsSchema.safeParse({
          [option]: "not a boolean",
        });
        expect(result.success).toBe(false);
        if (!result.success && result.error) {
          expect(result.error.issues[0].message).toContain("expected boolean");
        }
      }
    });

    it("should reject unknown options", () => {
      const result = jobOptionsSchema.safeParse({ unknownOption: "value" });
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        expect(result.error.issues[0].message).toContain("Unrecognized key");
        expect(result.error.issues[0].message).toContain("unknownOption");
      }
    });

    it("should reject null options", () => {
      const result = jobOptionsSchema.safeParse(null);
      expect(result.success).toBe(false);
    });
  });
});

describe("Validation Schemas - Create Job Request", () => {
  describe("createJobRequestSchema", () => {
    it("should accept valid request with type only", () => {
      const result = createJobRequestSchema.safeParse({
        type: "notion:fetch",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("notion:fetch");
        expect(result.data.options).toBeUndefined();
      }
    });

    it("should accept valid request with options", () => {
      const result = createJobRequestSchema.safeParse({
        type: "notion:fetch-all",
        options: {
          maxPages: 10,
          statusFilter: "In Progress",
          force: true,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("notion:fetch-all");
        expect(result.data.options).toBeDefined();
        expect(result.data.options?.maxPages).toBe(10);
      }
    });

    it("should reject missing type field", () => {
      const result = createJobRequestSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        expect(result.error.issues[0].message).toContain("Invalid option");
      }
    });

    it("should reject invalid type", () => {
      const result = createJobRequestSchema.safeParse({
        type: "invalid:type",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid options", () => {
      const result = createJobRequestSchema.safeParse({
        type: "notion:fetch",
        options: { maxPages: "not a number" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("validateCreateJobRequest function", () => {
    it("should return validated request for valid input", () => {
      const input = { type: "notion:fetch" as const };
      const result = validateCreateJobRequest(input);
      expect(result).toEqual(input);
    });

    it("should throw ZodError for invalid input", () => {
      expect(() => validateCreateJobRequest({})).toThrow();
    });
  });

  describe("TypeScript type inference", () => {
    it("should correctly infer CreateJobRequest type", () => {
      const request: CreateJobRequest = {
        type: "notion:fetch",
        options: {
          maxPages: 10,
          force: true,
        },
      };
      expect(request.type).toBe("notion:fetch");
    });
  });
});

describe("Validation Schemas - Jobs Query Parameters", () => {
  describe("jobsQuerySchema", () => {
    it("should accept empty query", () => {
      const result = jobsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBeUndefined();
        expect(result.data.type).toBeUndefined();
      }
    });

    it("should accept valid status filter", () => {
      const result = jobsQuerySchema.safeParse({ status: "running" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("running");
      }
    });

    it("should accept valid type filter", () => {
      const result = jobsQuerySchema.safeParse({ type: "notion:translate" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("notion:translate");
      }
    });

    it("should accept both status and type filters", () => {
      const result = jobsQuerySchema.safeParse({
        status: "completed",
        type: "notion:fetch",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid status", () => {
      const result = jobsQuerySchema.safeParse({ status: "invalid" });
      expect(result.success).toBe(false);
    });

    it("should reject invalid type", () => {
      const result = jobsQuerySchema.safeParse({ type: "invalid:type" });
      expect(result.success).toBe(false);
    });
  });

  describe("validateJobsQuery function", () => {
    it("should return validated query for valid input", () => {
      const result = validateJobsQuery({ status: "running" });
      expect(result.status).toBe("running");
    });

    it("should throw ZodError for invalid input", () => {
      expect(() => validateJobsQuery({ status: "invalid" })).toThrow();
    });
  });

  describe("TypeScript type inference", () => {
    it("should correctly infer JobsQuery type", () => {
      const query: JobsQuery = {
        status: "running",
        type: "notion:fetch",
      };
      expect(query.status).toBe("running");
    });
  });
});

describe("Validation Helpers - safeValidate", () => {
  it("should return success with data for valid input", () => {
    const result = safeValidate(jobTypeSchema, "notion:fetch");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("notion:fetch");
    }
  });

  it("should return failure with error for invalid input", () => {
    const result = safeValidate(jobTypeSchema, "invalid:type");
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("Validation Helpers - formatZodError", () => {
  it("should format invalid_enum_value error", () => {
    const zodError = jobTypeSchema.safeParse("invalid");
    expect(zodError.success).toBe(false);

    if (!zodError.success && zodError.error) {
      const formatted = formatZodError(zodError.error, "req_test_123");

      expect(formatted.code).toBe(ErrorCode.INVALID_ENUM_VALUE);
      expect(formatted.message).toContain("Invalid option");
      expect(formatted.details.field).toBeDefined();
      expect(formatted.details.validOptions).toBeDefined();
      expect(formatted.suggestions).toBeDefined();
    }
  });

  it("should format invalid_type error", () => {
    const zodError = jobOptionsSchema.safeParse({ maxPages: "not a number" });
    expect(zodError.success).toBe(false);

    if (!zodError.success && zodError.error) {
      const formatted = formatZodError(zodError.error, "req_test_456");

      expect(formatted.code).toBe(ErrorCode.INVALID_FORMAT);
      expect(formatted.details.field).toBe("maxPages");
      expect(formatted.details.expected).toBe("number");
    }
  });

  it("should format too_small error", () => {
    const zodError = jobIdSchema.safeParse("");
    expect(zodError.success).toBe(false);

    if (!zodError.success && zodError.error) {
      const formatted = formatZodError(zodError.error, "req_test_789");

      expect(formatted.code).toBe(ErrorCode.INVALID_FORMAT);
      expect(formatted.details.field).toBeDefined();
      expect(formatted.details.minimum).toBeDefined();
    }
  });

  it("should format too_big error", () => {
    const zodError = jobIdSchema.safeParse("a".repeat(101));
    expect(zodError.success).toBe(false);

    if (!zodError.success && zodError.error) {
      const formatted = formatZodError(zodError.error, "req_test_abc");

      expect(formatted.code).toBe(ErrorCode.INVALID_FORMAT);
      expect(formatted.details.field).toBeDefined();
      expect(formatted.details.maximum).toBeDefined();
    }
  });

  it("should format unrecognized_keys error", () => {
    const zodError = jobOptionsSchema.safeParse({ unknownOption: "value" });
    expect(zodError.success).toBe(false);

    if (!zodError.success && zodError.error) {
      const formatted = formatZodError(zodError.error, "req_test_def");

      expect(formatted.code).toBe(ErrorCode.INVALID_INPUT);
      expect(formatted.message).toContain("Unknown option");
      expect(formatted.details.field).toBe("unknownOption");
    }
  });

  it("should always include suggestions", () => {
    const zodError = jobTypeSchema.safeParse("invalid");
    expect(zodError.success).toBe(false);

    if (!zodError.success && zodError.error) {
      const formatted = formatZodError(zodError.error, "req_test_xyz");

      expect(formatted.suggestions).toBeDefined();
      expect(formatted.suggestions).toContain("Check the request format");
      expect(formatted.suggestions).toContain(
        "Verify all required fields are present"
      );
    }
  });
});

describe("Validation Schemas - Edge Cases", () => {
  it("should handle max length boundary for job ID", () => {
    const maxLength = "a".repeat(MAX_JOB_ID_LENGTH);
    const result = jobIdSchema.safeParse(maxLength);
    expect(result.success).toBe(true);

    const overMax = "a".repeat(MAX_JOB_ID_LENGTH + 1);
    const resultOver = jobIdSchema.safeParse(overMax);
    expect(resultOver.success).toBe(false);
  });

  it("should handle single character job ID", () => {
    const result = jobIdSchema.safeParse("a");
    expect(result.success).toBe(true);
  });

  it("should handle valid job ID with multiple dots", () => {
    const result = jobIdSchema.safeParse("a.b.c.d.e");
    expect(result.success).toBe(true);
  });

  it("should handle all valid job types case-sensitively", () => {
    const validTypes = VALID_JOB_TYPES;
    for (const type of validTypes) {
      const result = jobTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }

    // Case variations should fail
    const result = jobTypeSchema.safeParse("NOTION:FETCH");
    expect(result.success).toBe(false);
  });

  it("should handle all valid job statuses case-sensitively", () => {
    const validStatuses = VALID_JOB_STATUSES;
    for (const status of validStatuses) {
      const result = jobStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }

    // Case variations should fail
    const result = jobStatusSchema.safeParse("PENDING");
    expect(result.success).toBe(false);
  });

  it("should handle maxPages boundary values", () => {
    const validValues = [1, 10, 100, 1000000];

    for (const value of validValues) {
      const result = jobOptionsSchema.safeParse({ maxPages: value });
      expect(result.success).toBe(true);
    }

    const invalidValues = [0, -1, -100, 0.5, 10.5];

    for (const value of invalidValues) {
      const result = jobOptionsSchema.safeParse({ maxPages: value });
      expect(result.success).toBe(false);
    }
  });

  it("should handle empty statusFilter", () => {
    const result = jobOptionsSchema.safeParse({ statusFilter: "" });
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      expect(result.error.issues[0].message).toContain("cannot be empty");
    }
  });

  it("should handle all boolean option variations", () => {
    const booleanOptions = ["force", "dryRun", "includeRemoved"] as const;

    for (const option of booleanOptions) {
      // True values
      expect(jobOptionsSchema.safeParse({ [option]: true }).success).toBe(true);

      // False values
      expect(jobOptionsSchema.safeParse({ [option]: false }).success).toBe(
        true
      );

      // Invalid values
      expect(jobOptionsSchema.safeParse({ [option]: "true" }).success).toBe(
        false
      );
      expect(jobOptionsSchema.safeParse({ [option]: 1 }).success).toBe(false);
      expect(jobOptionsSchema.safeParse({ [option]: null }).success).toBe(
        false
      );
    }
  });
});

describe("Validation Schemas - Integration", () => {
  it("should validate complete create job request", () => {
    const request = {
      type: "notion:fetch-all",
      options: {
        maxPages: 50,
        statusFilter: "In Progress",
        force: true,
        dryRun: false,
        includeRemoved: true,
      },
    };

    const result = createJobRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(request);
    }
  });

  it("should validate jobs query with both filters", () => {
    const query = {
      status: "running" as const,
      type: "notion:translate" as const,
    };

    const result = jobsQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(query);
    }
  });

  it("should handle complex validation errors", () => {
    const request = {
      type: "invalid:type",
      options: {
        maxPages: "not a number",
        unknownOption: "value",
      },
    };

    const result = createJobRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
    if (!result.success && result.error) {
      // Should have errors property
      expect(result.error).toBeDefined();
      expect(result.error.issues).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("Validation Schemas - Constants", () => {
  it("should export all validation constants", () => {
    expect(VALID_JOB_TYPES).toBeDefined();
    expect(VALID_JOB_STATUSES).toBeDefined();
    expect(MAX_JOB_ID_LENGTH).toBeDefined();

    expect(VALID_JOB_TYPES).toHaveLength(8);
    expect(VALID_JOB_STATUSES).toHaveLength(4);
    expect(MAX_JOB_ID_LENGTH).toBe(100);
  });
});
