/**
 * Bun API Server for triggering Notion jobs
 *
 * Provides HTTP endpoints to:
 * - Trigger Notion-related jobs
 * - Query job status
 * - List all jobs
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

const PORT = parseInt(process.env.API_PORT || "3001");
const HOST = process.env.API_HOST || "localhost";

// Configuration constants
const MAX_REQUEST_SIZE = 1_000_000; // 1MB max request size
const MAX_JOB_ID_LENGTH = 100;

// Valid job types and statuses for validation
const VALID_JOB_TYPES: readonly JobType[] = [
  "notion:fetch",
  "notion:fetch-all",
  "notion:translate",
  "notion:status-translation",
  "notion:status-draft",
  "notion:status-publish",
  "notion:status-publish-production",
] as const;

const VALID_JOB_STATUSES: readonly JobStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

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

// Request validation
function isValidJobType(type: string): type is JobType {
  return VALID_JOB_TYPES.includes(type as JobType);
}

function isValidJobStatus(status: string): status is JobStatus {
  return VALID_JOB_STATUSES.includes(status as JobStatus);
}

function isValidJobId(jobId: string): boolean {
  // Basic validation: non-empty, reasonable length, no path traversal
  if (!jobId || jobId.length > MAX_JOB_ID_LENGTH) {
    return false;
  }
  // Prevent path traversal attacks
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\")) {
    return false;
  }
  return true;
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// JSON response helper
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

// Error response helper with proper error types
function errorResponse(
  message: string,
  status = 400,
  details?: unknown,
  suggestions?: string[]
): Response {
  const body: Record<string, unknown> = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  if (suggestions && suggestions.length > 0) {
    body.suggestions = suggestions;
  }
  return jsonResponse(body, status);
}

// Validation error response
function validationError(message: string, details?: unknown): Response {
  return errorResponse(message, 400, details);
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

// Routes
const server = serve({
  port: PORT,
  hostname: HOST,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (path === "/health" && req.method === "GET") {
      return jsonResponse({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    }

    // List available job types
    if (path === "/jobs/types" && req.method === "GET") {
      return jsonResponse({
        types: [
          {
            id: "notion:fetch",
            description: "Fetch pages from Notion",
          },
          {
            id: "notion:fetch-all",
            description: "Fetch all pages from Notion",
          },
          {
            id: "notion:translate",
            description: "Translate content",
          },
          {
            id: "notion:status-translation",
            description: "Update status for translation workflow",
          },
          {
            id: "notion:status-draft",
            description: "Update status for draft publish workflow",
          },
          {
            id: "notion:status-publish",
            description: "Update status for publish workflow",
          },
          {
            id: "notion:status-publish-production",
            description: "Update status for production publish workflow",
          },
        ],
      });
    }

    // List all jobs with optional filtering
    if (path === "/jobs" && req.method === "GET") {
      const tracker = getJobTracker();
      const url = new URL(req.url);
      const statusFilter = url.searchParams.get("status");
      const typeFilter = url.searchParams.get("type");

      // Validate status filter if provided
      if (statusFilter && !isValidJobStatus(statusFilter)) {
        return validationError(
          `Invalid status filter: '${statusFilter}'. Valid statuses are: ${VALID_JOB_STATUSES.join(", ")}`
        );
      }

      // Validate type filter if provided
      if (typeFilter && !isValidJobType(typeFilter)) {
        return validationError(
          `Invalid type filter: '${typeFilter}'. Valid types are: ${VALID_JOB_TYPES.join(", ")}`
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

      return jsonResponse({
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
      });
    }

    // Get job status by ID or cancel job
    const jobStatusMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (jobStatusMatch) {
      const jobId = jobStatusMatch[1];

      // Validate job ID format
      if (!isValidJobId(jobId)) {
        return validationError(
          "Invalid job ID format. Job ID must be non-empty and cannot contain path traversal characters (.., /, \\)"
        );
      }

      const tracker = getJobTracker();

      // GET: Get job status
      if (req.method === "GET") {
        const job = tracker.getJob(jobId);

        if (!job) {
          return errorResponse("Job not found", 404);
        }

        return jsonResponse({
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString(),
          completedAt: job.completedAt?.toISOString(),
          progress: job.progress,
          result: job.result,
        });
      }

      // DELETE: Cancel job
      if (req.method === "DELETE") {
        const job = tracker.getJob(jobId);

        if (!job) {
          return errorResponse("Job not found", 404);
        }

        // Only allow canceling pending or running jobs
        if (job.status !== "pending" && job.status !== "running") {
          return errorResponse(
            `Cannot cancel job with status: ${job.status}. Only pending or running jobs can be cancelled.`,
            409
          );
        }

        // Mark job as failed with cancellation reason
        tracker.updateJobStatus(jobId, "failed", {
          success: false,
          error: "Job cancelled by user",
        });

        return jsonResponse({
          id: jobId,
          status: "cancelled",
          message: "Job cancelled successfully",
        });
      }
    }

    // Create/trigger a new job
    if (path === "/jobs" && req.method === "POST") {
      let body: { type: string; options?: unknown };

      try {
        body = await parseJsonBody<{ type: string; options?: unknown }>(req);
      } catch (error) {
        if (error instanceof ValidationError) {
          return validationError(error.message, error.statusCode);
        }
        return errorResponse("Failed to parse request body", 500);
      }

      // Validate request body structure
      if (!body || typeof body !== "object") {
        return validationError("Request body must be a valid JSON object");
      }

      if (!body.type || typeof body.type !== "string") {
        return validationError(
          "Missing or invalid 'type' field in request body. Expected a string."
        );
      }

      if (!isValidJobType(body.type)) {
        return validationError(
          `Invalid job type: '${body.type}'. Valid types are: ${VALID_JOB_TYPES.join(", ")}`
        );
      }

      // Validate options if provided
      if (body.options !== undefined) {
        if (typeof body.options !== "object" || body.options === null) {
          return validationError(
            "Invalid 'options' field in request body. Expected an object."
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
            return validationError(
              `Unknown option: '${key}'. Valid options are: ${knownOptions.join(", ")}`
            );
          }
        }

        // Type validation for known options
        if (
          options.maxPages !== undefined &&
          typeof options.maxPages !== "number"
        ) {
          return validationError(
            "Invalid 'maxPages' option. Expected a number."
          );
        }
        if (
          options.statusFilter !== undefined &&
          typeof options.statusFilter !== "string"
        ) {
          return validationError(
            "Invalid 'statusFilter' option. Expected a string."
          );
        }
        if (options.force !== undefined && typeof options.force !== "boolean") {
          return validationError("Invalid 'force' option. Expected a boolean.");
        }
        if (
          options.dryRun !== undefined &&
          typeof options.dryRun !== "boolean"
        ) {
          return validationError(
            "Invalid 'dryRun' option. Expected a boolean."
          );
        }
        if (
          options.includeRemoved !== undefined &&
          typeof options.includeRemoved !== "boolean"
        ) {
          return validationError(
            "Invalid 'includeRemoved' option. Expected a boolean."
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

      return jsonResponse(
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
        201
      );
    }

    // 404 for unknown routes
    return jsonResponse(
      {
        error: "Not found",
        message: "The requested endpoint does not exist",
        availableEndpoints: [
          { method: "GET", path: "/health", description: "Health check" },
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
      404
    );
  },
});

console.log(`🚀 Notion Jobs API Server running on http://${HOST}:${PORT}`);
console.log("\nAvailable endpoints:");
console.log("  GET    /health              - Health check");
console.log("  GET    /jobs/types          - List available job types");
console.log(
  "  GET    /jobs                - List all jobs (?status=, ?type= filters)"
);
console.log("  POST   /jobs                - Create a new job");
console.log("  GET    /jobs/:id            - Get job status");
console.log("  DELETE /jobs/:id            - Cancel a job");
console.log("\nExample: Create a fetch-all job");
console.log("  curl -X POST http://localhost:3001/jobs \\");
console.log("    -H 'Content-Type: application/json' \\");
console.log('    -d \'{"type": "notion:fetch-all"}\'');
console.log("\nExample: Cancel a job");
console.log("  curl -X DELETE http://localhost:3001/jobs/{jobId}");
console.log("\nExample: Filter jobs by status");
console.log("  curl http://localhost:3001/jobs?status=running");

// Handle graceful shutdown
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

export { server };
