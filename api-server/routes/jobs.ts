/**
 * Jobs endpoint handlers
 */
import { getJobTracker } from "../job-tracker";
import { executeJobAsync } from "../job-executor";
import { ValidationError as BaseValidationError } from "../../scripts/shared/errors";
import {
  ErrorCode,
  createPreJobErrorEnvelope,
  createErrorResponse,
  createApiResponse,
  type ErrorResponse,
  type ApiResponse,
  type FetchJobWarning,
} from "../response-schemas";
import { MAX_REQUEST_SIZE, isValidJobId } from "../validation";
import {
  createJobRequestSchema,
  jobsQuerySchema,
  formatZodError,
} from "../validation-schemas";
import type { JobType } from "../job-tracker";
import { getCorsHeaders } from "../middleware/cors";
import { isFetchJobLockHeld, tryAcquireFetchJobLock } from "../fetch-job-lock";

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

// Validation error response with standardized error code
function validationErrorResponse(
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
  requestOrigin: string | null = null
): Response {
  const error: ErrorResponse = createErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    message,
    400,
    requestId,
    details,
    undefined
  );
  return new Response(JSON.stringify(error, null, 2), {
    status: 400,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}

function preJobErrorResponse(
  code: "UNAUTHORIZED" | "INVALID_REQUEST" | "CONFLICT" | "UNKNOWN",
  message: string,
  status: number,
  requestOrigin: string | null = null
): Response {
  const payload = createPreJobErrorEnvelope(code, message);
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}

// Standard error response
function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>,
  requestOrigin: string | null = null
): Response {
  const error: ErrorResponse = createErrorResponse(
    code,
    message,
    status,
    requestId,
    details,
    undefined
  );
  return new Response(JSON.stringify(error, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}

// Success response
function successResponse<T>(
  data: T,
  requestId: string,
  status: number,
  requestOrigin: string | null = null
): Response {
  const response: ApiResponse<T> = createApiResponse(
    data,
    requestId,
    undefined
  );
  return new Response(JSON.stringify(response, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}

function plainJsonResponse(
  data: unknown,
  status: number,
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

function isFetchJobType(type: JobType): type is "fetch-ready" | "fetch-all" {
  return type === "fetch-ready" || type === "fetch-all";
}

/**
 * Handle GET /jobs - List all jobs with optional filtering
 */
export async function handleListJobs(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string
): Promise<Response> {
  const tracker = getJobTracker();
  const statusParam = url.searchParams.get("status");
  const typeParam = url.searchParams.get("type");

  // Validate query parameters using Zod schema
  const queryValidation = jobsQuerySchema.safeParse({
    status: statusParam ?? undefined,
    type: typeParam ?? undefined,
  });

  if (!queryValidation.success) {
    const zodError = formatZodError(queryValidation.error, requestId);
    return errorResponse(
      zodError.code,
      zodError.message,
      400,
      requestId,
      zodError.details,
      requestOrigin
    );
  }

  const { status: statusFilter, type: typeFilter } = queryValidation.data;

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
    requestOrigin
  );
}

/**
 * Handle POST /jobs - Create a new job
 */
export async function handleCreateJob(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string
): Promise<Response> {
  let body: unknown;

  try {
    body = await parseJsonBody<unknown>(req);
  } catch (error) {
    if (error instanceof ValidationError) {
      return preJobErrorResponse(
        "INVALID_REQUEST",
        error.message,
        400,
        requestOrigin
      );
    }
    return preJobErrorResponse(
      "UNKNOWN",
      "Failed to parse request body",
      500,
      requestOrigin
    );
  }

  // Pre-check: Zod v4 z.enum() emits invalid_value for both absent and
  // wrong-value fields, so we must explicitly detect the missing/non-string
  // case here to preserve the MISSING_REQUIRED_FIELD error code contract.
  const bodyObj = body as Record<string, unknown>;
  if (bodyObj.type === undefined || typeof bodyObj.type !== "string") {
    return preJobErrorResponse(
      "INVALID_REQUEST",
      "Missing required field: type",
      400,
      requestOrigin
    );
  }

  // Validate request body using Zod schema
  const bodyValidation = createJobRequestSchema.safeParse(body);

  if (!bodyValidation.success) {
    const zodError = formatZodError(bodyValidation.error, requestId);
    return preJobErrorResponse(
      "INVALID_REQUEST",
      zodError.message,
      400,
      requestOrigin
    );
  }

  const { type: typeString, options } = bodyValidation.data;
  // Cast the validated type string to JobType (already validated by Zod)
  const type = typeString as JobType;

  const tracker = getJobTracker();
  const isFetch = isFetchJobType(type);

  if (isFetch && isFetchJobLockHeld()) {
    return preJobErrorResponse(
      "CONFLICT",
      "Another fetch job is already running",
      409,
      requestOrigin
    );
  }

  const jobId = tracker.createJob(type);
  if (isFetch && !tryAcquireFetchJobLock(jobId)) {
    tracker.deleteJob(jobId);
    return preJobErrorResponse(
      "CONFLICT",
      "Another fetch job is already running",
      409,
      requestOrigin
    );
  }

  // Execute job asynchronously
  executeJobAsync(type, jobId, options || {});

  return plainJsonResponse(
    {
      jobId,
      status: "pending",
    },
    202,
    requestOrigin
  );
}

/**
 * Handle GET /jobs/:id - Get job status
 */
export async function handleGetJob(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string,
  jobId: string
): Promise<Response> {
  // Validate job ID format
  if (!isValidJobId(jobId)) {
    return validationErrorResponse(
      "Invalid job ID format. Job ID must be non-empty and cannot contain path traversal characters (.., /, \\)",
      requestId,
      {
        jobId,
        reason: "Invalid format or contains path traversal characters",
      },
      requestOrigin
    );
  }

  const tracker = getJobTracker();
  const job = tracker.getJob(jobId);

  if (!job) {
    return errorResponse(
      ErrorCode.NOT_FOUND,
      "Job not found",
      404,
      requestId,
      { jobId },
      requestOrigin
    );
  }

  if (isFetchJobType(job.type)) {
    if (job.status !== "completed" && job.status !== "failed") {
      return plainJsonResponse(
        {
          jobId: job.id,
          status: job.status,
        },
        200,
        requestOrigin
      );
    }

    const terminal = job.terminal ?? {};
    const response: Record<string, unknown> = {
      jobId: job.id,
      status: job.status,
      pagesProcessed: terminal.pagesProcessed ?? 0,
      pagesSkipped: terminal.pagesSkipped ?? 0,
      commitHash: terminal.commitHash ?? null,
    };

    if (job.type === "fetch-ready") {
      response.pagesTransitioned = terminal.pagesTransitioned ?? 0;
      response.failedPageIds = terminal.failedPageIds ?? [];
      response.warnings = (terminal.warnings ?? []) as FetchJobWarning[];
    }

    if (terminal.dryRun) {
      response.dryRun = true;
    }

    if (job.status === "failed") {
      response.error = terminal.error ?? {
        code: "UNKNOWN",
        message: job.result?.error ?? "Fetch job failed",
      };
    }

    return plainJsonResponse(response, 200, requestOrigin);
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
    requestOrigin
  );
}

/**
 * Handle DELETE /jobs/:id - Cancel job
 */
export async function handleCancelJob(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string,
  jobId: string
): Promise<Response> {
  // Validate job ID format
  if (!isValidJobId(jobId)) {
    return validationErrorResponse(
      "Invalid job ID format. Job ID must be non-empty and cannot contain path traversal characters (.., /, \\)",
      requestId,
      {
        jobId,
        reason: "Invalid format or contains path traversal characters",
      },
      requestOrigin
    );
  }

  const tracker = getJobTracker();
  const job = tracker.getJob(jobId);

  if (!job) {
    return errorResponse(
      ErrorCode.NOT_FOUND,
      "Job not found",
      404,
      requestId,
      { jobId },
      requestOrigin
    );
  }

  // Only allow canceling pending or running jobs
  if (job.status !== "pending" && job.status !== "running") {
    return errorResponse(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Cannot cancel job with status: ${job.status}. Only pending or running jobs can be cancelled.`,
      409,
      requestId,
      { jobId, currentStatus: job.status },
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
    requestOrigin
  );
}
