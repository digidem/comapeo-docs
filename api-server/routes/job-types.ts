/**
 * Job types endpoint handler
 */
import { type JobType } from "../job-tracker";
import { VALID_JOB_TYPES } from "../validation";
import { createApiResponse, type ApiResponse } from "../response-schemas";
import { getCorsHeaders } from "../middleware/cors";

interface JobTypeInfo {
  id: JobType;
  description: string;
}

interface JobTypesData {
  types: JobTypeInfo[];
}

// Job type descriptions (derived from VALID_JOB_TYPES single source of truth)
const JOB_TYPE_DESCRIPTIONS: Record<JobType, string> = {
  "notion:fetch": "Fetch pages from Notion",
  "notion:fetch-all": "Fetch all pages from Notion",
  "notion:count-pages": "Count pages in Notion database",
  "notion:translate": "Translate content",
  "notion:status-translation": "Update status for translation workflow",
  "notion:status-draft": "Update status for draft publish workflow",
  "notion:status-publish": "Update status for publish workflow",
  "notion:status-publish-production":
    "Update status for production publish workflow",
};

/**
 * Handle GET /jobs/types
 */
export async function handleJobTypes(
  req: Request,
  url: URL,
  requestOrigin: string | null,
  requestId: string
): Promise<Response> {
  const data: JobTypesData = {
    types: VALID_JOB_TYPES.map((type) => ({
      id: type,
      // eslint-disable-next-line security/detect-object-injection -- type is from VALID_JOB_TYPES constant, not user input
      description: JOB_TYPE_DESCRIPTIONS[type],
    })),
  };

  const response: ApiResponse<JobTypesData> = createApiResponse(
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
