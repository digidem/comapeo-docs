/**
 * Bun API Server for triggering Notion jobs
 *
 * Provides HTTP endpoints to:
 * - Trigger Notion-related jobs
 * - Query job status
 * - List all jobs
 *
 * Features:
 * - API key authentication for protected endpoints
 * - Comprehensive request audit logging
 * - Input validation and error handling
 */

// eslint-disable-next-line import/no-unresolved
import { serve } from "bun";
import { getJobTracker, type JobType, type JobStatus } from "./job-tracker";
import { executeJobAsync } from "./job-executor";
import {
  ValidationError as BaseValidationError,
  formatErrorResponse,
  createValidationError,
} from "../shared/errors";
import {
  requireAuth,
  createAuthErrorResponse,
  getAuth,
  type AuthResult,
} from "./auth";
import { getAudit, AuditLogger } from "./audit";
import {
  ErrorCode,
  type ErrorResponse,
  type ApiResponse,
  type PaginationMeta,
  createErrorResponse,
  createApiResponse,
  createPaginationMeta,
  generateRequestId,
  getErrorCodeForStatus,
  getValidationErrorForField,
} from "./response-schemas";
import {
  MAX_REQUEST_SIZE,
  MAX_JOB_ID_LENGTH,
  VALID_JOB_TYPES,
  VALID_JOB_STATUSES,
  isValidJobType,
  isValidJobStatus,
  isValidJobId,
  PUBLIC_ENDPOINTS,
  isPublicEndpoint,
} from "./validation";

const PORT = parseInt(process.env.API_PORT || "3001");
const HOST = process.env.API_HOST || "localhost";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : null; // null means allow all origins (backwards compatible)

// Validation errors - extend the base ValidationError for compatibility
class ValidationError extends BaseValidationError {
  constructor(
    message: string,
    statusCode = 400,
    suggestions?: string[],
    context?: Record<string, unknown>
  ) {
    super(
      message,
      statusCode,
      suggestions ?? [
        "Check the request format",
        "Verify all required fields are present",
        "Refer to API documentation",
      ],
      context
    );
    this.name = "ValidationError";
  }
}

/**
 * Get CORS headers for a request
 * If ALLOWED_ORIGINS is set, only allow requests from those origins
 * If ALLOWED_ORIGINS is null (default), allow all origins
 */
function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  let origin: string;

  if (!ALLOWED_ORIGINS) {
    // No origin restrictions - allow all
    origin = "*";
  } else if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    // Origin is in allowlist - echo it back
    origin = requestOrigin;
  } else {
    // Origin not allowed - return empty string (will block request)
    origin = "";
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Add Vary header when using origin allowlist
  // This tells caches that the response varies by Origin header
  if (ALLOWED_ORIGINS) {
    headers["Vary"] = "Origin";
  }

  return headers;
}

// JSON response helper
function jsonResponse(
  data: unknown,
  status = 200,
  requestOrigin: string | null = null
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}

// Standardized success response with API envelope
function successResponse<T>(
  data: T,
  requestId: string,
  status = 200,
  pagination?: PaginationMeta,
  requestOrigin: string | null = null
): Response {
  const response: ApiResponse<T> = createApiResponse(
    data,
    requestId,
    pagination
  );
  return jsonResponse(response, status, requestOrigin);
}

// Standardized error response with error code
function standardErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>,
  suggestions?: string[],
  requestOrigin: string | null = null
): Response {
  const error: ErrorResponse = createErrorResponse(
    code,
    message,
    status,
    requestId,
    details,
    suggestions
  );
  return jsonResponse(error, status, requestOrigin);
}

// Legacy error response helper for backward compatibility (will be deprecated)
function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
  suggestions?: string[]
): Response {
  const requestId = generateRequestId();
  return standardErrorResponse(
    getErrorCodeForStatus(status),
    message,
    status,
    requestId,
    details as Record<string, unknown>,
    suggestions
  );
}

// Validation error response with standardized error code
function validationError(
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
  requestOrigin: string | null = null
): Response {
  return standardErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    message,
    400,
    requestId,
    details,
    undefined,
    requestOrigin
  );
}

// Field-specific validation error
function fieldValidationError(
  field: string,
  requestId: string,
  additionalContext?: Record<string, unknown>,
  requestOrigin: string | null = null
): Response {
  const { code, message } = getValidationErrorForField(field);
  return standardErrorResponse(
    code,
    message,
    400,
    requestId,
    additionalContext,
    undefined,
    requestOrigin
  );
}

// Parse and validate JSON body with proper error handling
async function parseJsonBody<T>(req: Request): Promise<T> {
  // Check Content-Type header
  const contentType = req.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new ValidationError(
      "Invalid Content-Type. Expected 'application/json'"
    );
  }

  // Check request size
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_SIZE) {
    throw new ValidationError(
      `Request body too large. Maximum size is ${MAX_REQUEST_SIZE} bytes`
    );
  }

  try {
    const body = await req.json();
    if (body === null || typeof body !== "object") {
      throw new ValidationError("Request body must be a valid JSON object");
    }
    return body as T;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("Invalid JSON in request body");
  }
}

/**
 * Route the request to the appropriate handler
 */
async function routeRequest(
  req: Request,
  path: string,
  url: URL,
  requestId: string,
  requestOrigin: string | null
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const requestOrigin = req.headers.get("origin");
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(requestOrigin),
    });
  }

  // Health check
  if (path === "/health" && req.method === "GET") {
    return successResponse(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        auth: {
          enabled: getAuth().isAuthenticationEnabled(),
          keysConfigured: getAuth().listKeys().length,
        },
      },
      requestId,
      200,
      undefined,
      requestOrigin
    );
  }

  // API documentation (OpenAPI-style spec)
  if (path === "/docs" && req.method === "GET") {
    return jsonResponse(
      {
        openapi: "3.0.0",
        info: {
          title: "CoMapeo Documentation API",
          version: "1.0.0",
          description: "API for managing Notion content operations and jobs",
        },
        servers: [
          {
            url: `http://${HOST}:${PORT}`,
            description: "Local development server",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "API Key",
              description: "Bearer token authentication using API key",
            },
            apiKeyAuth: {
              type: "http",
              scheme: "api-key",
              description: "Api-Key header authentication using API key",
            },
          },
          schemas: {
            // Standard response envelopes
            ApiResponse: {
              type: "object",
              required: ["data", "requestId", "timestamp"],
              properties: {
                data: {
                  type: "object",
                  description: "Response data (varies by endpoint)",
                },
                requestId: {
                  type: "string",
                  description: "Unique request identifier for tracing",
                  pattern: "^req_[a-z0-9]+_[a-z0-9]+$",
                },
                timestamp: {
                  type: "string",
                  format: "date-time",
                  description: "ISO 8601 timestamp of response",
                },
                pagination: {
                  $ref: "#/components/schemas/PaginationMeta",
                },
              },
            },
            ErrorResponse: {
              type: "object",
              required: ["code", "message", "status", "requestId", "timestamp"],
              properties: {
                code: {
                  type: "string",
                  description: "Machine-readable error code",
                  enum: [
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
                  ],
                },
                message: {
                  type: "string",
                  description: "Human-readable error message",
                },
                status: {
                  type: "integer",
                  description: "HTTP status code",
                },
                requestId: {
                  type: "string",
                  description: "Unique request identifier for tracing",
                },
                timestamp: {
                  type: "string",
                  format: "date-time",
                  description: "ISO 8601 timestamp of error",
                },
                details: {
                  type: "object",
                  description: "Additional error context",
                },
                suggestions: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: "Suggestions for resolving the error",
                },
              },
            },
            PaginationMeta: {
              type: "object",
              required: [
                "page",
                "perPage",
                "total",
                "totalPages",
                "hasNext",
                "hasPrevious",
              ],
              properties: {
                page: {
                  type: "integer",
                  minimum: 1,
                  description: "Current page number (1-indexed)",
                },
                perPage: {
                  type: "integer",
                  minimum: 1,
                  description: "Number of items per page",
                },
                total: {
                  type: "integer",
                  minimum: 0,
                  description: "Total number of items",
                },
                totalPages: {
                  type: "integer",
                  minimum: 1,
                  description: "Total number of pages",
                },
                hasNext: {
                  type: "boolean",
                  description: "Whether there is a next page",
                },
                hasPrevious: {
                  type: "boolean",
                  description: "Whether there is a previous page",
                },
              },
            },
            HealthResponse: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  example: "ok",
                },
                timestamp: {
                  type: "string",
                  format: "date-time",
                },
                uptime: {
                  type: "number",
                  description: "Server uptime in seconds",
                },
                auth: {
                  type: "object",
                  properties: {
                    enabled: {
                      type: "boolean",
                    },
                    keysConfigured: {
                      type: "integer",
                    },
                  },
                },
              },
            },
            JobTypesResponse: {
              type: "object",
              properties: {
                types: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: {
                        type: "string",
                      },
                      description: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
            JobsListResponse: {
              type: "object",
              required: ["items", "count"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Job",
                  },
                },
                count: {
                  type: "integer",
                },
              },
            },
            Job: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                },
                type: {
                  type: "string",
                  enum: VALID_JOB_TYPES,
                },
                status: {
                  type: "string",
                  enum: ["pending", "running", "completed", "failed"],
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                startedAt: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                completedAt: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                progress: {
                  $ref: "#/components/schemas/JobProgress",
                },
                result: {
                  type: "object",
                  nullable: true,
                },
              },
            },
            JobProgress: {
              type: "object",
              properties: {
                current: {
                  type: "integer",
                },
                total: {
                  type: "integer",
                },
                message: {
                  type: "string",
                },
              },
            },
            CreateJobRequest: {
              type: "object",
              required: ["type"],
              properties: {
                type: {
                  type: "string",
                  enum: VALID_JOB_TYPES,
                },
                options: {
                  type: "object",
                  properties: {
                    maxPages: {
                      type: "integer",
                    },
                    statusFilter: {
                      type: "string",
                    },
                    force: {
                      type: "boolean",
                    },
                    dryRun: {
                      type: "boolean",
                    },
                    includeRemoved: {
                      type: "boolean",
                    },
                  },
                },
              },
            },
            CreateJobResponse: {
              type: "object",
              properties: {
                jobId: {
                  type: "string",
                },
                type: {
                  type: "string",
                },
                status: {
                  type: "string",
                  enum: ["pending"],
                },
                message: {
                  type: "string",
                },
                _links: {
                  type: "object",
                  properties: {
                    self: {
                      type: "string",
                    },
                    status: {
                      type: "string",
                    },
                  },
                },
              },
            },
            JobStatusResponse: {
              $ref: "#/components/schemas/Job",
            },
            CancelJobResponse: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                },
                status: {
                  type: "string",
                  enum: ["cancelled"],
                },
                message: {
                  type: "string",
                },
              },
            },
          },
        },
        headers: {
          "X-Request-ID": {
            description: "Unique request identifier for tracing",
            schema: {
              type: "string",
              pattern: "^req_[a-z0-9]+_[a-z0-9]+$",
            },
            required: false,
          },
        },
        security: [
          {
            bearerAuth: [],
          },
          {
            apiKeyAuth: [],
          },
        ],
        tags: [
          {
            name: "Health",
            description: "Health check endpoints",
          },
          {
            name: "Jobs",
            description: "Job management endpoints",
          },
        ],
        paths: {
          "/health": {
            get: {
              summary: "Health check",
              description: "Check if the API server is running",
              tags: ["Health"],
              security: [],
              responses: {
                "200": {
                  description: "Server is healthy",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/HealthResponse",
                      },
                    },
                  },
                },
              },
            },
          },
          "/docs": {
            get: {
              summary: "API documentation",
              description: "Get OpenAPI specification for this API",
              tags: ["Health"],
              security: [],
              responses: {
                "200": {
                  description: "OpenAPI specification",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        description: "OpenAPI 3.0.0 specification document",
                      },
                    },
                  },
                },
              },
            },
          },
          "/jobs/types": {
            get: {
              summary: "List job types",
              description: "Get a list of all available job types",
              tags: ["Jobs"],
              security: [],
              responses: {
                "200": {
                  description: "List of job types",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/JobTypesResponse",
                      },
                    },
                  },
                },
              },
            },
          },
          "/jobs": {
            get: {
              summary: "List jobs",
              description: "Retrieve all jobs with optional filtering",
              tags: ["Jobs"],
              parameters: [
                {
                  name: "status",
                  in: "query",
                  schema: {
                    type: "string",
                    enum: ["pending", "running", "completed", "failed"],
                  },
                  description: "Filter by job status",
                },
                {
                  name: "type",
                  in: "query",
                  schema: {
                    type: "string",
                    enum: VALID_JOB_TYPES,
                  },
                  description: "Filter by job type",
                },
              ],
              responses: {
                "200": {
                  description: "List of jobs",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/JobsListResponse",
                      },
                    },
                  },
                },
                "401": {
                  description: "Unauthorized",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
              },
            },
            post: {
              summary: "Create job",
              description: "Create and trigger a new job",
              tags: ["Jobs"],
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CreateJobRequest",
                    },
                  },
                },
              },
              responses: {
                "201": {
                  description: "Job created successfully",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CreateJobResponse",
                      },
                    },
                  },
                },
                "400": {
                  description: "Bad request",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
                "401": {
                  description: "Unauthorized",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
              },
            },
          },
          "/jobs/{id}": {
            get: {
              summary: "Get job status",
              description: "Retrieve detailed status of a specific job",
              tags: ["Jobs"],
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                  description: "Job ID",
                },
              ],
              responses: {
                "200": {
                  description: "Job details",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/JobStatusResponse",
                      },
                    },
                  },
                },
                "401": {
                  description: "Unauthorized",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
                "404": {
                  description: "Job not found",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
              },
            },
            delete: {
              summary: "Cancel job",
              description: "Cancel a pending or running job",
              tags: ["Jobs"],
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                  description: "Job ID",
                },
              ],
              responses: {
                "200": {
                  description: "Job cancelled successfully",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/CancelJobResponse",
                      },
                    },
                  },
                },
                "401": {
                  description: "Unauthorized",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
                "404": {
                  description: "Job not found",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
                "409": {
                  description: "Cannot cancel job in current state",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/ErrorResponse",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      200,
      requestOrigin
    );
  }

  // List available job types
  if (path === "/jobs/types" && req.method === "GET") {
    // Job type descriptions (derived from VALID_JOB_TYPES single source of truth)
    const jobTypeDescriptions: Record<JobType, string> = {
      "notion:fetch": "Fetch pages from Notion",
      "notion:fetch-all": "Fetch all pages from Notion",
      "notion:count-pages": "Count pages in Notion database",
      "notion:translate": "Translate content",
      "notion:status-translation": "Update status for translation workflow",
      "notion:status-draft": "Update status for draft publish workflow",
      "notion:status-publish": "Update status for publish workflow",
      "notion:status-publish-production":
        "Update status for production publish workflow",
    };

    return successResponse(
      {
        types: VALID_JOB_TYPES.map((type) => ({
          id: type,
          // eslint-disable-next-line security/detect-object-injection -- type is from VALID_JOB_TYPES constant, not user input
          description: jobTypeDescriptions[type],
        })),
      },
      requestId
    );
  }

  // List all jobs with optional filtering
  if (path === "/jobs" && req.method === "GET") {
    const tracker = getJobTracker();
    const statusFilter = url.searchParams.get("status");
    const typeFilter = url.searchParams.get("type");

    // Validate status filter if provided
    if (statusFilter && !isValidJobStatus(statusFilter)) {
      return validationError(
        `Invalid status filter: '${statusFilter}'. Valid statuses are: ${VALID_JOB_STATUSES.join(", ")}`,
        requestId,
        { filter: statusFilter, validValues: VALID_JOB_STATUSES },
        requestOrigin
      );
    }

    // Validate type filter if provided
    if (typeFilter && !isValidJobType(typeFilter)) {
      return validationError(
        `Invalid type filter: '${typeFilter}'. Valid types are: ${VALID_JOB_TYPES.join(", ")}`,
        requestId,
        { filter: typeFilter, validValues: VALID_JOB_TYPES },
        requestOrigin
      );
    }

    let jobs = tracker.getAllJobs();

    // Filter by status if specified
    if (statusFilter) {
      jobs = jobs.filter((job) => job.status === statusFilter);
    }

    // Filter by type if specified
    if (typeFilter) {
      jobs = jobs.filter((job) => job.type === typeFilter);
    }

    return successResponse(
      {
        items: jobs.map((job) => ({
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
      },
      requestId,
      200,
      undefined,
      requestOrigin
    );
  }

  // Get job status by ID or cancel job
  const jobStatusMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobStatusMatch) {
    const jobId = jobStatusMatch[1];

    // Validate job ID format
    if (!isValidJobId(jobId)) {
      return validationError(
        "Invalid job ID format. Job ID must be non-empty and cannot contain path traversal characters (.., /, \\)",
        requestId,
        {
          jobId,
          reason: "Invalid format or contains path traversal characters",
        }
      );
    }

    const tracker = getJobTracker();

    // GET: Get job status
    if (req.method === "GET") {
      const job = tracker.getJob(jobId);

      if (!job) {
        return standardErrorResponse(
          ErrorCode.NOT_FOUND,
          "Job not found",
          404,
          requestId,
          { jobId },
          undefined,
          requestOrigin
        );
      }

      return successResponse(
        {
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          progress: job.progress,
          result: job.result,
        },
        requestId,
        200,
        undefined,
        requestOrigin
      );
    }

    // DELETE: Cancel job
    if (req.method === "DELETE") {
      const job = tracker.getJob(jobId);

      if (!job) {
        return standardErrorResponse(
          ErrorCode.NOT_FOUND,
          "Job not found",
          404,
          requestId,
          { jobId },
          undefined,
          requestOrigin
        );
      }

      // Only allow canceling pending or running jobs
      if (job.status !== "pending" && job.status !== "running") {
        return standardErrorResponse(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Cannot cancel job with status: ${job.status}. Only pending or running jobs can be cancelled.`,
          409,
          requestId,
          { jobId, currentStatus: job.status },
          undefined,
          requestOrigin
        );
      }

      // Cancel the job and kill any running process
      tracker.cancelJob(jobId);

      return successResponse(
        {
          id: jobId,
          status: "cancelled",
          message: "Job cancelled successfully",
        },
        requestId,
        200,
        undefined,
        requestOrigin
      );
    }
  }

  // Create/trigger a new job
  if (path === "/jobs" && req.method === "POST") {
    let body: { type: string; options?: unknown };

    try {
      body = await parseJsonBody<{ type: string; options?: unknown }>(req);
    } catch (error) {
      if (error instanceof ValidationError) {
        return validationError(
          error.message,
          requestId,
          undefined,
          requestOrigin
        );
      }
      return standardErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        "Failed to parse request body",
        500,
        requestId,
        undefined,
        undefined,
        requestOrigin
      );
    }

    // Validate request body structure
    if (!body || typeof body !== "object") {
      return validationError(
        "Request body must be a valid JSON object",
        requestId,
        undefined,
        requestOrigin
      );
    }

    if (!body.type || typeof body.type !== "string") {
      return fieldValidationError("type", requestId, undefined, requestOrigin);
    }

    if (!isValidJobType(body.type)) {
      return standardErrorResponse(
        ErrorCode.INVALID_ENUM_VALUE,
        `Invalid job type: '${body.type}'. Valid types are: ${VALID_JOB_TYPES.join(", ")}`,
        400,
        requestId,
        { providedType: body.type, validTypes: VALID_JOB_TYPES },
        undefined,
        requestOrigin
      );
    }

    // Validate options if provided
    if (body.options !== undefined) {
      if (typeof body.options !== "object" || body.options === null) {
        return fieldValidationError(
          "options",
          requestId,
          undefined,
          requestOrigin
        );
      }
      // Check for known option keys and their types
      const options = body.options as Record<string, unknown>;
      const knownOptions = [
        "maxPages",
        "statusFilter",
        "force",
        "dryRun",
        "includeRemoved",
      ];

      for (const key of Object.keys(options)) {
        if (!knownOptions.includes(key)) {
          return standardErrorResponse(
            ErrorCode.INVALID_INPUT,
            `Unknown option: '${key}'. Valid options are: ${knownOptions.join(", ")}`,
            400,
            requestId,
            { option: key, validOptions: knownOptions },
            undefined,
            requestOrigin
          );
        }
      }

      // Type validation for known options
      if (
        options.maxPages !== undefined &&
        typeof options.maxPages !== "number"
      ) {
        return fieldValidationError(
          "maxPages",
          requestId,
          undefined,
          requestOrigin
        );
      }
      if (
        options.statusFilter !== undefined &&
        typeof options.statusFilter !== "string"
      ) {
        return fieldValidationError(
          "statusFilter",
          requestId,
          undefined,
          requestOrigin
        );
      }
      if (options.force !== undefined && typeof options.force !== "boolean") {
        return fieldValidationError(
          "force",
          requestId,
          undefined,
          requestOrigin
        );
      }
      if (options.dryRun !== undefined && typeof options.dryRun !== "boolean") {
        return fieldValidationError(
          "dryRun",
          requestId,
          undefined,
          requestOrigin
        );
      }
      if (
        options.includeRemoved !== undefined &&
        typeof options.includeRemoved !== "boolean"
      ) {
        return fieldValidationError(
          "includeRemoved",
          requestId,
          undefined,
          requestOrigin
        );
      }
    }

    const tracker = getJobTracker();
    const jobId = tracker.createJob(body.type);

    // Execute job asynchronously
    executeJobAsync(
      body.type,
      jobId,
      (body.options as Record<string, unknown>) || {}
    );

    return successResponse(
      {
        jobId,
        type: body.type,
        status: "pending",
        message: "Job created successfully",
        _links: {
          self: `/jobs/${jobId}`,
          status: `/jobs/${jobId}`,
        },
      },
      requestId,
      201,
      undefined,
      requestOrigin
    );
  }

  // 404 for unknown routes
  return standardErrorResponse(
    ErrorCode.ENDPOINT_NOT_FOUND,
    "The requested endpoint does not exist",
    404,
    requestId,
    {
      availableEndpoints: [
        { method: "GET", path: "/health", description: "Health check" },
        {
          method: "GET",
          path: "/docs",
          description: "API documentation (OpenAPI spec)",
        },
        {
          method: "GET",
          path: "/jobs/types",
          description: "List available job types",
        },
        {
          method: "GET",
          path: "/jobs",
          description: "List all jobs (optional ?status= and ?type= filters)",
        },
        { method: "POST", path: "/jobs", description: "Create a new job" },
        { method: "GET", path: "/jobs/:id", description: "Get job status" },
        {
          method: "DELETE",
          path: "/jobs/:id",
          description: "Cancel a pending or running job",
        },
      ],
    },
    undefined,
    requestOrigin
  );
}

/**
 * Handle request with authentication and audit logging
 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const audit = getAudit();
  const requestId = generateRequestId();

  // Add request ID to response headers for tracing
  const headers = new Headers();
  headers.set("X-Request-ID", requestId);

  // Check if endpoint is public
  const isPublic = isPublicEndpoint(path);

  // Authenticate request (only for protected endpoints)
  const authHeader = req.headers.get("authorization");
  const authResult: AuthResult = isPublic
    ? {
        success: true,
        meta: {
          name: "public",
          active: true,
          createdAt: new Date(),
        },
      }
    : requireAuth(authHeader);

  // Create audit entry
  const entry = audit.createEntry(req, authResult);
  const startTime = Date.now();

  // Check authentication for protected endpoints
  if (!isPublic && !authResult.success) {
    audit.logAuthFailure(req, authResult as { success: false; error?: string });
    const errorResponse = standardErrorResponse(
      ErrorCode.UNAUTHORIZED,
      authResult.error || "Authentication failed",
      401,
      requestId
    );
    // Add request ID header to error response
    const errorBody = await errorResponse.json();
    headers.set("Content-Type", "application/json");
    headers.set("X-Request-ID", requestId);
    return new Response(JSON.stringify(errorBody), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    });
  }

  // Handle the request
  try {
    const requestOrigin = req.headers.get("origin");
    const response = await routeRequest(
      req,
      path,
      url,
      requestId,
      requestOrigin
    );
    const responseTime = Date.now() - startTime;
    audit.logSuccess(entry, response.status, responseTime);
    // Add request ID header to response
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-Request-ID", requestId);
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    audit.logFailure(entry, 500, errorMessage);
    return standardErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      "Internal server error",
      500,
      requestId,
      { error: errorMessage }
    );
  }
}

// Check if running in test mode
const isTestMode =
  process.env.NODE_ENV === "test" || process.env.API_PORT === "0";

// Start server
const server = serve({
  port: isTestMode ? 0 : PORT, // Use random port in test mode
  hostname: HOST,
  fetch: handleRequest,
});

// Get the actual port (needed for tests where port is 0)
const actualPort = isTestMode ? (server as { port?: number }).port : PORT;

// Log startup information (skip in test mode)
if (!isTestMode) {
  const authEnabled = getAuth().isAuthenticationEnabled();
  console.log(`🚀 Notion Jobs API Server running on http://${HOST}:${PORT}`);
  console.log(
    `\nAuthentication: ${authEnabled ? "enabled" : "disabled (no API keys configured)"}`
  );
  console.log(`Audit logging: enabled (logs: ${getAudit().getLogPath()})`);
  console.log("\nAvailable endpoints:");
  console.log("  GET    /health              - Health check (public)");
  console.log(
    "  GET    /docs                - API documentation (OpenAPI spec) (public)"
  );
  console.log(
    "  GET    /jobs/types          - List available job types (public)"
  );
  console.log(
    "  GET    /jobs                - List all jobs (?status=, ?type= filters) [requires auth]"
  );
  console.log(
    "  POST   /jobs                - Create a new job [requires auth]"
  );
  console.log("  GET    /jobs/:id            - Get job status [requires auth]");
  console.log("  DELETE /jobs/:id            - Cancel a job [requires auth]");

  if (authEnabled) {
    console.log("\n🔐 Authentication is enabled.");
    console.log("   Use: Authorization: Bearer <api-key>");
    console.log(
      `   Configured keys: ${getAuth()
        .listKeys()
        .map((k) => k.name)
        .join(", ")}`
    );
  } else {
    console.log(
      "\n⚠️  Authentication is disabled. Set API_KEY_* environment variables to enable."
    );
  }

  console.log("\nExample: Create a fetch-all job");
  const authExample = authEnabled
    ? '-H "Authorization: Bearer <api-key>" \\'
    : "";
  console.log(`  curl -X POST http://${HOST}:${PORT}/jobs \\`);
  if (authExample) {
    console.log(`    ${authExample}`);
  }
  console.log("    -H 'Content-Type: application/json' \\");
  console.log('    -d \'{"type": "notion:fetch-all"}\'');

  console.log("\nExample: Cancel a job");
  console.log(`  curl -X DELETE http://${HOST}:${PORT}/jobs/{jobId} \\`);
  if (authExample) {
    console.log(`    ${authExample}`);
  }

  console.log("\nExample: Filter jobs by status");
  console.log(`  curl http://${HOST}:${PORT}/jobs?status=running \\`);
  if (authExample) {
    console.log(`    -H "${authExample.replace(" \\", "")}"`);
  }
}

// Handle graceful shutdown (only in non-test mode)
if (!isTestMode) {
  process.on("SIGINT", () => {
    console.log("\n\nShutting down gracefully...");
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\nShutting down gracefully...");
    server.stop();
    process.exit(0);
  });
}

export { server, actualPort };
