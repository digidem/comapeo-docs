/**
 * API documentation endpoint handler
 */
import { generateOpenApiDocument } from "../openapi";
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
  const spec = generateOpenApiDocument();
  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}
