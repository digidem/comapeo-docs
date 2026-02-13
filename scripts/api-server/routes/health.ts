/**
 * Health check endpoint handler
 */
import { getAuth } from "../auth";
import { createApiResponse, type ApiResponse } from "../response-schemas";
import { getCorsHeaders } from "../middleware/cors";

interface HealthData {
  status: string;
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
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string
): Promise<Response> {
  const data: HealthData = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    auth: {
      enabled: getAuth().isAuthenticationEnabled(),
      keysConfigured: getAuth().listKeys().length,
    },
  };

  const response: ApiResponse<HealthData> = createApiResponse(
    data,
    requestId,
    undefined
  );

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}
