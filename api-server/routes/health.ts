/**
 * Health check endpoint handler
 */
import { getAuth } from "../auth";
import { getCorsHeaders } from "../middleware/cors";

interface HealthData {
  status: string;
  version: string;
  timestamp: string;
  uptime: number;
  auth: {
    enabled: boolean;
    keysConfigured: number;
  };
}

/**
 * Handle GET /health
 */
export async function handleHealth(
  _req: Request,
  _url: URL,
  requestOrigin: string | null,
  _requestId: string
): Promise<Response> {
  const data: HealthData = {
    status: "ok",
    version:
      process.env.API_VERSION || process.env.npm_package_version || "unknown",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    auth: {
      enabled: getAuth().isAuthenticationEnabled(),
      keysConfigured: getAuth().listKeys().length,
    },
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}
