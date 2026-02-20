/**
 * Main request handler with authentication and audit logging
 */
import { requireAuth, type AuthResult } from "./auth";
import { getAudit } from "./audit";
import { getCorsHeaders } from "./middleware/cors";
import {
  ErrorCode,
  generateRequestId,
  createPreJobErrorEnvelope,
  createErrorResponse,
  type ErrorResponse,
} from "./response-schemas";
import { isPublicEndpoint } from "./validation";
import { routeRequest } from "./router";

/**
 * Handle request with authentication and audit logging
 */
export async function handleRequest(req: Request): Promise<Response> {
  // Extract origin early so it's available for all error responses
  const requestOrigin = req.headers.get("Origin");
  const audit = getAudit();
  const requestId = generateRequestId();
  const startTime = Date.now();
  let entry: ReturnType<typeof audit.createEntry> | null = null;

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // Check if endpoint is public or CORS preflight (OPTIONS)
    // CORS preflight requests must skip auth since browsers don't send credentials
    const isPublic = isPublicEndpoint(path) || req.method === "OPTIONS";

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
    entry = audit.createEntry(req, authResult);

    // Check authentication for protected endpoints
    if (!isPublic && !authResult.success) {
      audit.logAuthFailure(
        req,
        authResult as { success: false; error?: string }
      );
      if (path === "/jobs" && req.method === "POST") {
        const envelope = createPreJobErrorEnvelope(
          "UNAUTHORIZED",
          authResult.error || "Authentication failed"
        );
        return new Response(JSON.stringify(envelope, null, 2), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(requestOrigin),
            "X-Request-ID": requestId,
          },
        });
      }
      const error: ErrorResponse = createErrorResponse(
        ErrorCode.UNAUTHORIZED,
        authResult.error || "Authentication failed",
        401,
        requestId
      );
      return new Response(JSON.stringify(error, null, 2), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(requestOrigin),
          "X-Request-ID": requestId,
        },
      });
    }

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
    if (entry) {
      audit.logFailure(entry, 500, errorMessage);
    }
    const errorResponse: ErrorResponse = createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      "Internal server error",
      500,
      requestId,
      { error: errorMessage }
    );
    return new Response(JSON.stringify(errorResponse, null, 2), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(requestOrigin),
        "X-Request-ID": requestId,
      },
    });
  }
}
