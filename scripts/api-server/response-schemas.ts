/**
 * Standardized API Response Schemas for Automation
 *
 * Provides consistent response structures across all endpoints with:
 * - Standard error format with machine-readable codes
 * - Request metadata for tracking and debugging
 * - Pagination support for list endpoints
 * - Consistent field naming and types
 */

/**
 * Standard error codes for automation
 */
export enum ErrorCode {
  // Validation errors (4xx)
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FORMAT = "INVALID_FORMAT",
  INVALID_ENUM_VALUE = "INVALID_ENUM_VALUE",

  // Authentication/Authorization errors (4xx)
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INVALID_API_KEY = "INVALID_API_KEY",
  API_KEY_INACTIVE = "API_KEY_INACTIVE",

  // Not found errors (4xx)
  NOT_FOUND = "NOT_FOUND",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  ENDPOINT_NOT_FOUND = "ENDPOINT_NOT_FOUND",

  // Conflict errors (4xx)
  CONFLICT = "CONFLICT",
  INVALID_STATE_TRANSITION = "INVALID_STATE_TRANSITION",
  RESOURCE_LOCKED = "RESOURCE_LOCKED",

  // Rate limiting (4xx)
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Server errors (5xx)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  JOB_EXECUTION_FAILED = "JOB_EXECUTION_FAILED",
}

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  /** Machine-readable error code for automation */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** HTTP status code (for reference) */
  status: number;
  /** Detailed error context */
  details?: Record<string, unknown>;
  /** Suggestions for resolution */
  suggestions?: string[];
  /** Request tracking ID */
  requestId: string;
  /** Timestamp of error */
  timestamp: string;
}

/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  perPage: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrevious: boolean;
}

/**
 * Response envelope for successful responses
 */
export interface ApiResponse<T = unknown> {
  /** Response data */
  data: T;
  /** Request tracking ID */
  requestId: string;
  /** Timestamp of response */
  timestamp: string;
  /** Pagination metadata (for list endpoints) */
  pagination?: PaginationMeta;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  requestId: string,
  details?: Record<string, unknown>,
  suggestions?: string[]
): ErrorResponse {
  return {
    code,
    message,
    status,
    requestId,
    timestamp: new Date().toISOString(),
    ...(details && { details }),
    ...(suggestions && suggestions.length > 0 && { suggestions }),
  };
}

/**
 * Create a standardized success response
 */
export function createApiResponse<T>(
  data: T,
  requestId: string,
  pagination?: PaginationMeta
): ApiResponse<T> {
  const response: ApiResponse<T> = {
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
  if (pagination) {
    response.pagination = pagination;
  }
  return response;
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  perPage: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / perPage);
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Map validation errors to standard error codes
 */
export function getValidationErrorForField(field: string): {
  code: ErrorCode;
  message: string;
} {
  const errorMap: Record<string, { code: ErrorCode; message: string }> = {
    type: {
      code: ErrorCode.MISSING_REQUIRED_FIELD,
      message:
        "Missing or invalid 'type' field. Expected a valid job type string.",
    },
    options: {
      code: ErrorCode.INVALID_INPUT,
      message: "Invalid 'options' field. Expected an object.",
    },
    maxPages: {
      code: ErrorCode.INVALID_FORMAT,
      message: "Invalid 'maxPages' option. Expected a number.",
    },
    statusFilter: {
      code: ErrorCode.INVALID_FORMAT,
      message: "Invalid 'statusFilter' option. Expected a string.",
    },
    force: {
      code: ErrorCode.INVALID_FORMAT,
      message: "Invalid 'force' option. Expected a boolean.",
    },
    dryRun: {
      code: ErrorCode.INVALID_FORMAT,
      message: "Invalid 'dryRun' option. Expected a boolean.",
    },
    includeRemoved: {
      code: ErrorCode.INVALID_FORMAT,
      message: "Invalid 'includeRemoved' option. Expected a boolean.",
    },
  };

  /* eslint-disable security/detect-object-injection */
  // field is validated against known keys - safe for object access
  const result = errorMap[field];
  /* eslint-enable security/detect-object-injection */

  return (
    result || {
      code: ErrorCode.VALIDATION_ERROR,
      message: `Validation error for field: ${field}`,
    }
  );
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `req_${timestamp}_${random}`;
}

/**
 * HTTP status code to error code mapping
 */
export function getErrorCodeForStatus(status: number): ErrorCode {
  const statusMap: Partial<Record<number, ErrorCode>> = {
    400: ErrorCode.VALIDATION_ERROR,
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
    429: ErrorCode.RATE_LIMIT_EXCEEDED,
    500: ErrorCode.INTERNAL_ERROR,
    503: ErrorCode.SERVICE_UNAVAILABLE,
  };
  // eslint-disable-next-line security/detect-object-injection -- status is number, not arbitrary key
  return statusMap[status] || ErrorCode.INTERNAL_ERROR;
}
