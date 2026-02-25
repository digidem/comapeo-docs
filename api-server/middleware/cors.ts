/**
 * CORS middleware utilities
 */

/**
 * Get allowed origins from environment
 * Caches the result for performance
 */
let _allowedOriginsCache: string[] | null | undefined = undefined;

function getAllowedOrigins(): string[] | null {
  if (_allowedOriginsCache !== undefined) {
    return _allowedOriginsCache;
  }

  const envValue = process.env.ALLOWED_ORIGINS;

  if (!envValue || envValue.trim() === "") {
    // Empty or unset means allow all origins
    _allowedOriginsCache = null;
  } else {
    _allowedOriginsCache = envValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return _allowedOriginsCache;
}

/**
 * Clear the allowed origins cache (for testing purposes)
 */
export function clearAllowedOriginsCache(): void {
  _allowedOriginsCache = undefined;
}

/**
 * Check if an origin is allowed
 * Returns true if:
 * - ALLOWED_ORIGINS is not set (allow-all mode)
 * - The origin is in the allowed list
 * - No origin header is present (same-origin requests)
 */
function isOriginAllowed(requestOrigin: string | null): boolean {
  const allowedOrigins = getAllowedOrigins();

  if (!allowedOrigins) {
    // No origin restrictions - allow all
    return true;
  }

  if (!requestOrigin) {
    // No Origin header means same-origin request (e.g., same server)
    // These are always allowed
    return true;
  }

  // Check if origin is in allowlist
  return allowedOrigins.includes(requestOrigin);
}

/**
 * Get CORS headers for a request
 * If ALLOWED_ORIGINS is set, only allow requests from those origins
 * If ALLOWED_ORIGINS is null (default), allow all origins
 *
 * For disallowed origins, returns empty object - browser will block the response
 */
export function getCorsHeaders(
  requestOrigin: string | null
): Record<string, string> {
  // Check if origin is allowed
  if (!isOriginAllowed(requestOrigin)) {
    // Return empty headers for disallowed origins
    // Browser will block the response due to missing CORS headers
    return {};
  }

  // Build CORS headers for allowed origins
  let origin: string;
  const allowedOrigins = getAllowedOrigins();

  if (!allowedOrigins) {
    // No origin restrictions - allow all
    origin = "*";
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    // Origin is in allowlist - echo it back
    origin = requestOrigin;
  } else {
    // No Origin header (same-origin request) - allow
    origin = "*";
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Add Vary header when using origin allowlist AND Origin header was present
  // This tells caches that the response varies by Origin header
  // Only add Vary when we're actually checking the Origin header
  if (allowedOrigins && requestOrigin) {
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
