/**
 * OpenAPI 3.0.0 specification for CoMapeo Documentation API
 */
import { VALID_JOB_TYPES } from "./validation";

const HOST = process.env.API_HOST || "localhost";
const PORT = parseInt(process.env.API_PORT || "3001");

export const OPENAPI_SPEC = {
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
        required: ["status", "version", "timestamp", "uptime"],
        properties: {
          status: {
            type: "string",
            example: "ok",
          },
          version: {
            type: "string",
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
        required: ["jobId", "status"],
        properties: {
          jobId: {
            type: "string",
          },
          status: {
            type: "string",
            enum: ["pending"],
          },
        },
      },
      PreJobErrorResponse: {
        type: "object",
        required: ["status", "error"],
        properties: {
          status: {
            type: "string",
            enum: ["failed"],
          },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                enum: [
                  "UNAUTHORIZED",
                  "INVALID_REQUEST",
                  "CONFLICT",
                  "UNKNOWN",
                ],
              },
              message: {
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
          "202": {
            description: "Job accepted",
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
                  $ref: "#/components/schemas/PreJobErrorResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PreJobErrorResponse",
                },
              },
            },
          },
          "409": {
            description: "Conflict",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PreJobErrorResponse",
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
};
