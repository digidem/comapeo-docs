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

const PORT = parseInt(process.env.API_PORT || "3001");
const HOST = process.env.API_HOST || "localhost";

// Request validation
function isValidJobType(type: string): type is JobType {
  const validTypes: JobType[] = [
    "notion:fetch",
    "notion:fetch-all",
    "notion:translate",
    "notion:status-translation",
    "notion:status-draft",
    "notion:status-publish",
    "notion:status-publish-production",
  ];
  return validTypes.includes(type as JobType);
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

// Error response helper
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Parse JSON body helper
async function parseJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return await req.json();
  } catch {
    return null;
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
      const body = await parseJsonBody<{ type: string; options?: unknown }>(
        req
      );

      if (!body || typeof body.type !== "string") {
        return errorResponse("Missing or invalid 'type' field in request body");
      }

      if (!isValidJobType(body.type)) {
        return errorResponse(
          `Invalid job type: ${body.type}. Valid types: notion:fetch, notion:fetch-all, notion:translate, notion:status-translation, notion:status-draft, notion:status-publish, notion:status-publish-production`
        );
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
