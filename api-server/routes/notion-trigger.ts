/**
 * Notion trigger endpoint handler
 */
import { getCorsHeaders } from "../middleware/cors";
import { handleCreateJob } from "./jobs";

function jsonErrorResponse(
  message: string,
  status: number,
  requestOrigin: string | null = null
): Response {
  return new Response(JSON.stringify({ error: message }, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(requestOrigin),
    },
  });
}

/**
 * Handle POST /notion-trigger
 */
export async function handleNotionTrigger(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string
): Promise<Response> {
  const configuredApiKey = process.env.NOTION_TRIGGER_API_KEY;
  if (!configuredApiKey) {
    return jsonErrorResponse(
      "NOTION_TRIGGER_API_KEY is not configured",
      500,
      requestOrigin
    );
  }

  const incomingApiKey = req.headers.get("x-api-key");
  if (!incomingApiKey || incomingApiKey !== configuredApiKey) {
    return jsonErrorResponse(
      "Forbidden: invalid x-api-key",
      403,
      requestOrigin
    );
  }

  const createJobUrl = new URL(url);
  createJobUrl.pathname = "/jobs";
  createJobUrl.search = "";

  const createJobRequest = new Request(createJobUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "fetch-ready",
    }),
  });

  return handleCreateJob(
    createJobRequest,
    createJobUrl,
    requestOrigin,
    requestId
  );
}
