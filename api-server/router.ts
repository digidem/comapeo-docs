/**
 * Request router - maps paths to handlers
 */
import {
  ErrorCode,
  createErrorResponse,
  type ErrorResponse,
} from "./response-schemas";
import { getCorsHeaders, handleCorsPreflightRequest } from "./middleware/cors";
import { handleHealth } from "./routes/health";
import { handleDocs } from "./routes/docs";
import { handleJobTypes } from "./routes/job-types";
import { handleNotionTrigger } from "./routes/notion-trigger";
import {
  handleListJobs,
  handleCreateJob,
  handleGetJob,
  handleCancelJob,
} from "./routes/jobs";

/**
 * Route the request to the appropriate handler
 */
export async function routeRequest(
  req: Request,
  path: string,
  url: URL,
  requestId: string,
  requestOrigin: string | null
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest(requestOrigin);
  }

  // Health check
  if (path === "/health" && req.method === "GET") {
    return handleHealth(req, url, requestOrigin, requestId);
  }

  // API documentation (OpenAPI-style spec)
  if (path === "/docs" && req.method === "GET") {
    return handleDocs(req, url, requestOrigin, requestId);
  }

  // List available job types
  if (path === "/jobs/types" && req.method === "GET") {
    return handleJobTypes(req, url, requestOrigin, requestId);
  }

  // List all jobs with optional filtering
  if (path === "/jobs" && req.method === "GET") {
    return handleListJobs(req, url, requestOrigin, requestId);
  }

  // Get job status by ID or cancel job
  const jobStatusMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobStatusMatch) {
    const jobId = jobStatusMatch[1];

    // GET: Get job status
    if (req.method === "GET") {
      return handleGetJob(req, url, requestOrigin, requestId, jobId);
    }

    // DELETE: Cancel job
    if (req.method === "DELETE") {
      return handleCancelJob(req, url, requestOrigin, requestId, jobId);
    }
  }

  // Create/trigger a new job
  if (path === "/jobs" && req.method === "POST") {
    return handleCreateJob(req, url, requestOrigin, requestId);
  }

  // Trigger a fetch-ready job from Notion webhook button
  if (path === "/notion-trigger" && req.method === "POST") {
    return handleNotionTrigger(req, url, requestOrigin, requestId);
  }

  // 404 for unknown routes
  const error: ErrorResponse = createErrorResponse(
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
        {
          method: "POST",
          path: "/notion-trigger",
          description: "Trigger fetch-ready job with x-api-key",
        },
        { method: "GET", path: "/jobs/:id", description: "Get job status" },
        {
          method: "DELETE",
          path: "/jobs/:id",
          description: "Cancel a pending or running job",
        },
      ],
    },
    undefined
  );

  return new Response(JSON.stringify(error, null, 2), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}
