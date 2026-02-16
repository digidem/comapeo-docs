/**
 * Jobs endpoint handlers
 */
import { getJobTracker } from "../job-tracker";
import { executeJobAsync } from "../job-executor";
import {
  ValidationError as BaseValidationError,
  createValidationError,
} from "../../scripts/shared/errors";
import {
  ErrorCode,
  createErrorResponse,
  createApiResponse,
  type ErrorResponse,
  type ApiResponse,
} from "../response-schemas";
import {
  MAX_REQUEST_SIZE,
  VALID_JOB_TYPES,
  VALID_JOB_STATUSES,
  isValidJobType,
  isValidJobStatus,
  isValidJobId,
} from "../validation";
import { getCorsHeaders } from "../middleware/cors";

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
  const statusFilter = url.searchParams.get("status");
  const typeFilter = url.searchParams.get("type");

  // Validate status filter if provided
  if (statusFilter && !isValidJobStatus(statusFilter)) {
    return validationErrorResponse(
      `Invalid status filter: '${statusFilter}'. Valid statuses are: ${VALID_JOB_STATUSES.join(", ")}`,
      requestId,
      { filter: statusFilter, validValues: VALID_JOB_STATUSES },
      requestOrigin
    );
  }

  // Validate type filter if provided
  if (typeFilter && !isValidJobType(typeFilter)) {
    return validationErrorResponse(
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
  let body: { type: string; options?: unknown };

  try {
    body = await parseJsonBody<{ type: string; options?: unknown }>(req);
  } catch (error) {
    if (error instanceof ValidationError) {
      return validationErrorResponse(
        error.message,
        requestId,
        undefined,
        requestOrigin
      );
    }
    return errorResponse(
      ErrorCode.INTERNAL_ERROR,
      "Failed to parse request body",
      500,
      requestId,
      undefined,
      requestOrigin
    );
  }

  // Validate request body structure
  if (!body || typeof body !== "object") {
    return validationErrorResponse(
      "Request body must be a valid JSON object",
      requestId,
      undefined,
      requestOrigin
    );
  }

  if (!body.type || typeof body.type !== "string") {
    return errorResponse(
      ErrorCode.MISSING_REQUIRED_FIELD,
      "Missing required field: type",
      400,
      requestId,
      undefined,
      requestOrigin
    );
  }

  if (!isValidJobType(body.type)) {
    return errorResponse(
      ErrorCode.INVALID_ENUM_VALUE,
      `Invalid job type: '${body.type}'. Valid types are: ${VALID_JOB_TYPES.join(", ")}`,
      400,
      requestId,
      { providedType: body.type, validTypes: VALID_JOB_TYPES },
      requestOrigin
    );
  }

  // Validate options if provided
  if (body.options !== undefined) {
    if (typeof body.options !== "object" || body.options === null) {
      return errorResponse(
        ErrorCode.INVALID_FORMAT,
        "Field 'options' must be an object",
        400,
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
        return errorResponse(
          ErrorCode.INVALID_INPUT,
          `Unknown option: '${key}'. Valid options are: ${knownOptions.join(", ")}`,
          400,
          requestId,
          { option: key, validOptions: knownOptions },
          requestOrigin
        );
      }
    }

    // Type validation for known options
    if (
      options.maxPages !== undefined &&
      typeof options.maxPages !== "number"
    ) {
      return errorResponse(
        ErrorCode.INVALID_FORMAT,
        "Field 'maxPages' must be a number",
        400,
        requestId,
        undefined,
        requestOrigin
      );
    }
    if (
      options.statusFilter !== undefined &&
      typeof options.statusFilter !== "string"
    ) {
      return errorResponse(
        ErrorCode.INVALID_FORMAT,
        "Field 'statusFilter' must be a string",
        400,
        requestId,
        undefined,
        requestOrigin
      );
    }
    if (options.force !== undefined && typeof options.force !== "boolean") {
      return errorResponse(
        ErrorCode.INVALID_FORMAT,
        "Field 'force' must be a boolean",
        400,
        requestId,
        undefined,
        requestOrigin
      );
    }
    if (options.dryRun !== undefined && typeof options.dryRun !== "boolean") {
      return errorResponse(
        ErrorCode.INVALID_FORMAT,
        "Field 'dryRun' must be a boolean",
        400,
        requestId,
        undefined,
        requestOrigin
      );
    }
    if (
      options.includeRemoved !== undefined &&
      typeof options.includeRemoved !== "boolean"
    ) {
      return errorResponse(
        ErrorCode.INVALID_FORMAT,
        "Field 'includeRemoved' must be a boolean",
        400,
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
