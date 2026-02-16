/**
 * API documentation endpoint handler
 */
import { OPENAPI_SPEC } from "../openapi-spec";
import { getCorsHeaders } from "../middleware/cors";

/**
 * Handle GET /docs
 */
export async function handleDocs(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string
): Promise<Response> {
  return new Response(JSON.stringify(OPENAPI_SPEC, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}
