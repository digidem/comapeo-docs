import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import {
  createJobTypeSchema as createJobSchema,
  jobTypeSchema as cancelJobSchema,
  jobsQuerySchema as jobsListSchema,
} from "./validation-schemas";

// Fallbacks if response-schemas don't export exactly what was assumed
const errorResponseSchema = z.object({
  success: z.boolean(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const jobResponseSchema = z.object({
  success: z.boolean(),
  job: z.any(),
});

const jobsListResponseSchema = z.object({
  success: z.boolean(),
  jobs: z.array(z.any()),
});

const baseResponseSchema = z.object({
  success: z.boolean(),
});

const jobTypesResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    types: z.array(
      z.object({
        id: z.string(),
        description: z.string(),
      })
    ),
  }),
});

export const registry = new OpenAPIRegistry();

// Register schemas
registry.register("CreateJobRequest", createJobSchema);
registry.register("CancelJobRequest", cancelJobSchema);
registry.register("ErrorResponse", errorResponseSchema);
registry.register("JobResponse", jobResponseSchema);
registry.register("JobsListResponse", jobsListResponseSchema);
registry.register("BaseResponse", baseResponseSchema);
registry.register("JobTypesResponse", jobTypesResponseSchema);

// Security schemes
const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
});

registry.registerPath({
  method: "get",
  path: "/jobs/types",
  summary: "List available job types",
  responses: {
    200: {
      description: "List of job types",
      content: {
        "application/json": {
          schema: jobTypesResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/jobs",
  summary: "Create a new job",
  request: {
    body: {
      content: {
        "application/json": {
          schema: createJobSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Job created successfully",
      content: {
        "application/json": {
          schema: jobResponseSchema,
        },
      },
    },
    400: {
      description: "Validation error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
  security: [{ [bearerAuth.name]: [] }],
});

registry.registerPath({
  method: "get",
  path: "/jobs",
  summary: "List all jobs",
  request: {
    query: jobsListSchema,
  },
  responses: {
    200: {
      description: "List of jobs",
      content: {
        "application/json": {
          schema: jobsListResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/jobs/{id}",
  summary: "Get a specific job by ID",
  request: {
    params: z.object({ id: z.string().openapi({ description: "Job ID" }) }),
  },
  responses: {
    200: {
      description: "Job details",
      content: {
        "application/json": {
          schema: jobResponseSchema,
        },
      },
    },
    404: {
      description: "Job not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/jobs/{id}",
  summary: "Cancel a running job",
  request: {
    params: z.object({ id: z.string().openapi({ description: "Job ID" }) }),
  },
  responses: {
    200: {
      description: "Job cancelled successfully",
      content: {
        "application/json": {
          schema: jobResponseSchema,
        },
      },
    },
    404: {
      description: "Job not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    400: {
      description: "Job cannot be cancelled",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
  security: [{ [bearerAuth.name]: [] }],
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Comapeo Docs API",
      description: "API for managing Notion fetch jobs and operations",
    },
    servers: [{ url: "/" }],
  });
}
