/**
 * CORS middleware utilities
 */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : null; // null means allow all origins (backwards compatible)

/**
 * Get CORS headers for a request
 * If ALLOWED_ORIGINS is set, only allow requests from those origins
 * If ALLOWED_ORIGINS is null (default), allow all origins
 */
export function getCorsHeaders(
  requestOrigin: string | null
): Record<string, string> {
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

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflightRequest(
  requestOrigin: string | null
): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(requestOrigin),
  });
}
