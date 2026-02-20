/**
 * Centralized Validation Schemas for API Server
 *
 * Provides Zod-based validation schemas for all API endpoints with:
 * - Type-safe input validation
 * - Detailed error messages with field paths
 * - Consistent validation across all operations
 * - Integration with existing error response system
 */

import { z } from "zod";
import type { JobType, JobStatus } from "./job-tracker";
import { ErrorCode } from "./response-schemas";
import {
  VALID_JOB_TYPES,
  VALID_JOB_STATUSES,
  MAX_REQUEST_SIZE,
  MAX_JOB_ID_LENGTH,
} from "./validation";

// =============================================================================
// Constants
// =============================================================================

export const MIN_API_KEY_LENGTH = 16;

/**
 * Environment Variables Validation Schema
 * Ensures required secrets and configuration are present before startup
 */
export const envSchema = z.object({
  NOTION_API_KEY: z
    .string()
    .min(1, "NOTION_API_KEY is required for fetching content"),
  DATABASE_ID: z.string().min(1, "DATABASE_ID is required").optional(),
  DATA_SOURCE_ID: z.string().min(1, "DATA_SOURCE_ID is required").optional(),
});

export function validateEnv(): void {
  // Only validate in production or when explicitly required, skip in test mode
  // if not testing env explicitly.
  if (process.env.NODE_ENV === "test" && !process.env.STRICT_ENV_VALIDATION) {
    return;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "❌ Environment validation failed. Missing required secrets:"
    );
    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }
}

// Re-export validation constants for convenience
// Note: VALID_JOB_TYPES is derived from JOB_COMMANDS keys (single source of truth)
export {
  VALID_JOB_TYPES,
  VALID_JOB_STATUSES,
  MAX_REQUEST_SIZE,
  MAX_JOB_ID_LENGTH,
};

// =============================================================================
// Base Schemas
// =============================================================================

/**
 * Job ID validation schema
 * - Must be non-empty
 * - Must not exceed max length
 * - Must not contain path traversal characters (.., /, \)
 */
export const jobIdSchema = z
  .string()
  .min(1, "Job ID cannot be empty")
  .max(
    MAX_JOB_ID_LENGTH,
    `Job ID cannot exceed ${MAX_JOB_ID_LENGTH} characters`
  )
  .refine(
    (value) => !value.includes(".."),
    "Job ID cannot contain path traversal sequences (..)"
  )
  .refine(
    (value) => !value.includes("/"),
    "Job ID cannot contain forward slashes (/)"
  )
  .refine(
    (value) => !value.includes("\\"),
    "Job ID cannot contain backslashes (\\)"
  );

/**
 * Job type validation schema
 * - Must be one of the valid job types
 * - Derived from JOB_COMMANDS keys (single source of truth)
 */
export const jobTypeSchema = z.enum(VALID_JOB_TYPES as [string, ...string[]]);
export const createJobFetchTypeSchema = z.enum(["fetch-ready", "fetch-all"]);
export const createJobTypeSchema = z.union([
  jobTypeSchema,
  createJobFetchTypeSchema,
]);

/**
 * Job status validation schema
 * - Must be one of the valid job statuses
 */
export const jobStatusSchema = z.enum(
  VALID_JOB_STATUSES as [string, ...string[]]
);

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Options validation schema for job creation
 * - All options are optional
 * - Each option has type-specific validation
 */
export const jobOptionsSchema = z
  .object({
    maxPages: z
      .number()
      .int("maxPages must be an integer")
      .min(0, "maxPages must be greater than or equal to 0")
      .optional(),
    statusFilter: z.string().min(1, "statusFilter cannot be empty").optional(),
    force: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    includeRemoved: z.boolean().optional(),
  })
  .strip();

/**
 * Request body validation schema for POST /jobs
 * - type is required and must be a valid job type
 * - options is optional and must match jobOptionsSchema
 */
export const createJobRequestSchema = z.object({
  type: createJobTypeSchema,
  options: jobOptionsSchema.optional(),
});

// =============================================================================
// Query Parameter Schemas
// =============================================================================

/**
 * Query parameters validation schema for GET /jobs
 * - Both status and type are optional
 * - If provided, must be valid values
 */
export const jobsQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  type: createJobTypeSchema.optional(),
});

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Job progress validation schema
 */
export const jobProgressSchema = z.object({
  current: z.number(),
  total: z.number(),
  message: z.string(),
});

/**
 * Job result validation schema
 */
export const jobResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  output: z.string().optional(),
});

/**
 * Job validation schema (for response)
 */
export const jobSchema = z.object({
  id: z.string(),
  type: createJobTypeSchema,
  status: jobStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  progress: jobProgressSchema.optional().nullable(),
  result: jobResultSchema.optional().nullable(),
});

/**
 * Jobs list response validation schema
 */
export const jobsListResponseSchema = z.object({
  items: z.array(jobSchema),
  count: z.number(),
});

/**
 * Job creation response validation schema
 */
export const createJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("pending"),
});

/**
 * Job cancellation response validation schema
 */
export const cancelJobResponseSchema = z.object({
  id: z.string(),
  status: z.literal("cancelled"),
  message: z.string(),
});

// =============================================================================
// Error Response Schemas
// =============================================================================

/**
 * Error details validation schema
 */
export const errorDetailsSchema = z.record(z.string(), z.unknown());

/**
 * Error response validation schema
 */
export const errorResponseSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  status: z.number(),
  requestId: z.string().regex(/^req_[a-z0-9]+_[a-z0-9]+$/),
  timestamp: z.string().datetime(),
  details: errorDetailsSchema.optional(),
  suggestions: z.array(z.string()).optional(),
});

// =============================================================================
// Health Check Schemas
// =============================================================================

/**
 * Health check auth info validation schema
 */
export const healthAuthInfoSchema = z.object({
  enabled: z.boolean(),
  keysConfigured: z.number(),
});

/**
 * Health check response validation schema
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  timestamp: z.string().datetime(),
  uptime: z.number(),
  auth: healthAuthInfoSchema.optional(),
});

// =============================================================================
// API Key Schemas
// =============================================================================

/**
 * API key metadata validation schema
 */
export const apiKeyMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  active: z.boolean(),
  createdAt: z.coerce.date(),
});

/**
 * Authorization header validation schema
 * - Supports "Bearer <key>" and "Api-Key <key>" formats
 */
export const authorizationHeaderSchema = z
  .string()
  .min(1, "Authorization header cannot be empty")
  .refine((value) => {
    const parts = value.split(" ");
    return parts.length === 2;
  }, "Authorization header must be in format: 'Bearer <key>' or 'Api-Key <key>'")
  .transform((value) => {
    const [scheme, key] = value.split(" ");
    return {
      scheme: scheme.toLowerCase(),
      key,
    };
  })
  .refine(
    (value) => value.scheme === "bearer" || value.scheme === "api-key",
    "Authorization scheme must be 'Bearer' or 'Api-Key'"
  )
  .refine(
    (value) => value.key.length >= MIN_API_KEY_LENGTH,
    `API key must be at least ${MIN_API_KEY_LENGTH} characters`
  );

// =============================================================================
// Type Exports
// =============================================================================

/**
 * Infer TypeScript types from Zod schemas
 */
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
export type JobsQuery = z.infer<typeof jobsQuerySchema>;
export type JobOptions = z.infer<typeof jobOptionsSchema>;
export type JobProgress = z.infer<typeof jobProgressSchema>;
export type JobResult = z.infer<typeof jobResultSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type HealthAuthInfo = z.infer<typeof healthAuthInfoSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiKeyMeta = z.infer<typeof apiKeyMetaSchema>;
export type AuthorizationHeader = z.infer<typeof authorizationHeaderSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate job ID
 * @throws {z.ZodError} If validation fails
 */
export function validateJobId(jobId: unknown): string {
  return jobIdSchema.parse(jobId);
}

/**
 * Validate job type
 * @throws {z.ZodError} If validation fails
 */
export function validateJobType(type: unknown): JobType {
  return jobTypeSchema.parse(type) as JobType;
}

/**
 * Validate job status
 * @throws {z.ZodError} If validation fails
 */
export function validateJobStatus(status: unknown): JobStatus {
  return jobStatusSchema.parse(status) as JobStatus;
}

/**
 * Validate create job request
 * @throws {z.ZodError} If validation fails
 */
export function validateCreateJobRequest(data: unknown): CreateJobRequest {
  return createJobRequestSchema.parse(data);
}

/**
 * Validate jobs query parameters
 * @throws {z.ZodError} If validation fails
 */
export function validateJobsQuery(params: unknown): JobsQuery {
  return jobsQuerySchema.parse(params);
}

/**
 * Validate authorization header
 * @throws {z.ZodError} If validation fails
 */
export function validateAuthorizationHeader(
  header: unknown
): AuthorizationHeader {
  return authorizationHeaderSchema.parse(header);
}

/**
 * Safe validation without throwing
 * Returns { success: true, data } or { success: false, error }
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Format Zod error for API response
 */
export function formatZodError(
  error: z.ZodError,
  requestId: string
): {
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
  suggestions?: string[];
} {
  if (!error.issues || error.issues.length === 0) {
    return {
      code: ErrorCode.VALIDATION_ERROR,
      message: "Unknown validation error",
      details: {},
      suggestions: [
        "Check the request format",
        "Verify all required fields are present",
        "Refer to API documentation",
      ],
    };
  }

  const firstError = error.issues[0];
  const field = firstError.path.join(".");

  let code = ErrorCode.VALIDATION_ERROR;
  let message = firstError.message;
  const details: Record<string, unknown> = {
    field,
  };

  // Map Zod error codes to our error codes
  const errorCode = (firstError as any).code;
  if (errorCode === "invalid_value") {
    // Check if it's an enum validation error (has 'values' property)
    if ("values" in firstError) {
      code = ErrorCode.INVALID_ENUM_VALUE;
      details.validOptions = (firstError as any).values;
    }
  } else if (errorCode === "invalid_type") {
    code = ErrorCode.INVALID_FORMAT;
    details.expected = (firstError as any).expected;
    details.received = (firstError as any).received;
  } else if (errorCode === "too_small") {
    code = ErrorCode.INVALID_FORMAT;
    details.minimum = (firstError as any).minimum;
  } else if (errorCode === "too_big") {
    code = ErrorCode.INVALID_FORMAT;
    details.maximum = (firstError as any).maximum;
  } else if (errorCode === "unrecognized_keys") {
    code = ErrorCode.INVALID_INPUT;
    const keys = (firstError as any).keys || [];
    const keyName = Array.isArray(keys) && keys.length > 0 ? keys[0] : field;
    message = `Unknown option: '${keyName}'. Valid options are: maxPages, statusFilter, force, dryRun, includeRemoved`;
    details.field = keyName;
  }

  return {
    code,
    message,
    details,
    suggestions: [
      "Check the request format",
      "Verify all required fields are present",
      "Refer to API documentation",
    ],
  };
}
