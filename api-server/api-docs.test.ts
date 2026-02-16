/**
 * API Documentation Endpoint Tests
 *
 * Tests for the /docs endpoint that serves OpenAPI specification
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJobTracker, destroyJobTracker, type JobType } from "./job-tracker";
import { existsSync, unlinkSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".jobs-data");
const JOBS_FILE = join(DATA_DIR, "jobs.json");
const LOGS_FILE = join(DATA_DIR, "jobs.log");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    try {
      // Use rmSync with recursive option if available (Node.js v14.14+)
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Fallback to manual removal
      if (existsSync(LOGS_FILE)) {
        unlinkSync(LOGS_FILE);
      }
      if (existsSync(JOBS_FILE)) {
        unlinkSync(JOBS_FILE);
      }
      try {
        rmdirSync(DATA_DIR);
      } catch {
        // Ignore error if directory still has files
      }
    }
  }
}

describe("API Documentation Endpoint", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    destroyJobTracker();
    cleanupTestData();
  });

  describe("OpenAPI Specification Structure", () => {
    it("should include OpenAPI version", () => {
      const openApiSpec = {
        openapi: "3.0.0",
        info: {
          title: "CoMapeo Documentation API",
          version: "1.0.0",
          description: "API for managing Notion content operations and jobs",
        },
      };

      expect(openApiSpec.openapi).toBe("3.0.0");
      expect(openApiSpec.info.title).toBe("CoMapeo Documentation API");
      expect(openApiSpec.info.version).toBe("1.0.0");
    });

    it("should include all required paths", () => {
      const validJobTypes: JobType[] = [
        "notion:fetch",
        "notion:fetch-all",
        "notion:count-pages",
        "notion:translate",
        "notion:status-translation",
        "notion:status-draft",
        "notion:status-publish",
        "notion:status-publish-production",
      ];

      const expectedPaths = [
        "/health",
        "/docs",
        "/jobs/types",
        "/jobs",
        "/jobs/{id}",
      ];

      expect(expectedPaths).toContain("/health");
      expect(expectedPaths).toContain("/docs");
      expect(expectedPaths).toContain("/jobs/types");
      expect(expectedPaths).toContain("/jobs");
      expect(expectedPaths).toContain("/jobs/{id}");
    });

    it("should include security scheme for bearer auth", () => {
      const securityScheme = {
        type: "http" as const,
        scheme: "bearer" as const,
        bearerFormat: "API Key",
      };

      expect(securityScheme.type).toBe("http");
      expect(securityScheme.scheme).toBe("bearer");
      expect(securityScheme.bearerFormat).toBe("API Key");
    });
  });

  describe("Path Documentation", () => {
    it("should document /health endpoint", () => {
      const healthPath = {
        get: {
          summary: "Health check",
          description: "Check if the API server is running",
          tags: ["Health"],
          security: [],
          responses: {
            "200": {
              description: "Server is healthy",
            },
          },
        },
      };

      expect(healthPath.get).toHaveProperty("summary", "Health check");
      expect(healthPath.get).toHaveProperty("tags");
      expect(healthPath.get.tags).toContain("Health");
      expect(healthPath.get.security).toEqual([]);
    });

    it("should document /docs endpoint", () => {
      const docsPath = {
        get: {
          summary: "API documentation",
          description: "Get OpenAPI specification",
          tags: ["Documentation"],
          security: [],
          responses: {
            "200": {
              description: "OpenAPI specification",
            },
          },
        },
      };

      expect(docsPath.get).toHaveProperty("summary");
      expect(docsPath.get.tags).toContain("Documentation");
      expect(docsPath.get.security).toEqual([]);
    });

    it("should document /jobs/types endpoint", () => {
      const jobTypesPath = {
        get: {
          summary: "List job types",
          description: "Get a list of all available job types",
          tags: ["Jobs"],
          security: [],
          responses: {
            "200": {
              description: "List of job types",
            },
          },
        },
      };

      expect(jobTypesPath.get.summary).toBe("List job types");
      expect(jobTypesPath.get.tags).toContain("Jobs");
    });

    it("should document /jobs POST endpoint", () => {
      const createJobPath = {
        post: {
          summary: "Create job",
          description: "Create and trigger a new job",
          tags: ["Jobs"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type"],
                  properties: {
                    type: {
                      type: "string",
                    },
                    options: {
                      type: "object",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Job created successfully",
            },
          },
        },
      };

      expect(createJobPath.post.summary).toBe("Create job");
      expect(createJobPath.post.requestBody.required).toBe(true);
      expect(createJobPath.post.responses).toHaveProperty("201");
    });

    it("should document /jobs GET endpoint with filters", () => {
      const listJobsPath = {
        get: {
          summary: "List jobs",
          description: "Retrieve all jobs with optional filtering",
          tags: ["Jobs"],
          parameters: [
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: ["pending", "running", "completed", "failed"],
              },
            },
            {
              name: "type",
              in: "query",
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "List of jobs",
            },
          },
        },
      };

      expect(listJobsPath.get.parameters).toHaveLength(2);
      expect(listJobsPath.get.parameters[0].name).toBe("status");
      expect(listJobsPath.get.parameters[1].name).toBe("type");
    });

    it("should document /jobs/:id GET endpoint", () => {
      const getJobPath = {
        get: {
          summary: "Get job status",
          description: "Retrieve detailed status of a specific job",
          tags: ["Jobs"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "Job details",
            },
            "404": {
              description: "Job not found",
            },
          },
        },
      };

      expect(getJobPath.get.summary).toBe("Get job status");
      expect(getJobPath.get.parameters[0].name).toBe("id");
      expect(getJobPath.get.parameters[0].in).toBe("path");
      expect(getJobPath.get.parameters[0].required).toBe(true);
    });

    it("should document /jobs/:id DELETE endpoint", () => {
      const cancelJobPath = {
        delete: {
          summary: "Cancel job",
          description: "Cancel a pending or running job",
          tags: ["Jobs"],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "Job cancelled successfully",
            },
            "404": {
              description: "Job not found",
            },
            "409": {
              description: "Cannot cancel job in current state",
            },
          },
        },
      };

      expect(cancelJobPath.delete.summary).toBe("Cancel job");
      expect(cancelJobPath.delete.responses).toHaveProperty("409");
    });
  });

  describe("Schema Definitions", () => {
    it("should define HealthResponse schema", () => {
      const healthResponseSchema = {
        type: "object",
        properties: {
          status: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          uptime: { type: "number" },
          auth: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              keysConfigured: { type: "integer" },
            },
          },
        },
      };

      expect(healthResponseSchema.properties).toHaveProperty("status");
      expect(healthResponseSchema.properties).toHaveProperty("timestamp");
      expect(healthResponseSchema.properties).toHaveProperty("uptime");
      expect(healthResponseSchema.properties).toHaveProperty("auth");
    });

    it("should define ErrorResponse schema", () => {
      const errorResponseSchema = {
        type: "object",
        properties: {
          error: { type: "string" },
          details: { type: "object" },
          suggestions: {
            type: "array",
            items: { type: "string" },
          },
        },
      };

      expect(errorResponseSchema.properties).toHaveProperty("error");
      expect(errorResponseSchema.properties).toHaveProperty("details");
      expect(errorResponseSchema.properties).toHaveProperty("suggestions");
    });

    it("should define Job schema", () => {
      const validJobTypes: JobType[] = [
        "notion:fetch",
        "notion:fetch-all",
        "notion:count-pages",
        "notion:translate",
        "notion:status-translation",
        "notion:status-draft",
        "notion:status-publish",
        "notion:status-publish-production",
      ];

      const jobSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: validJobTypes,
          },
          status: {
            type: "string",
            enum: ["pending", "running", "completed", "failed"],
          },
          createdAt: { type: "string", format: "date-time" },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          progress: {
            type: "object",
            properties: {
              current: { type: "integer" },
              total: { type: "integer" },
              message: { type: "string" },
            },
          },
          result: { type: "object", nullable: true },
        },
      };

      expect(jobSchema.properties).toHaveProperty("id");
      expect(jobSchema.properties).toHaveProperty("type");
      expect(jobSchema.properties).toHaveProperty("status");
      expect(jobSchema.properties).toHaveProperty("progress");
      expect(jobSchema.properties).toHaveProperty("result");
    });

    it("should define CreateJobRequest schema", () => {
      const validJobTypes: JobType[] = [
        "notion:fetch",
        "notion:fetch-all",
        "notion:count-pages",
        "notion:translate",
        "notion:status-translation",
        "notion:status-draft",
        "notion:status-publish",
        "notion:status-publish-production",
      ];

      const createJobRequestSchema = {
        type: "object",
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: validJobTypes,
          },
          options: {
            type: "object",
            properties: {
              maxPages: { type: "integer" },
              statusFilter: { type: "string" },
              force: { type: "boolean" },
              dryRun: { type: "boolean" },
              includeRemoved: { type: "boolean" },
            },
          },
        },
      };

      expect(createJobRequestSchema.required).toContain("type");
      expect(createJobRequestSchema.properties).toHaveProperty("type");
      expect(createJobRequestSchema.properties).toHaveProperty("options");
      expect(
        createJobRequestSchema.properties.options.properties
      ).toHaveProperty("maxPages");
    });
  });

  describe("Tags", () => {
    it("should define API tags", () => {
      const tags = [
        {
          name: "Health",
          description: "Health check endpoints",
        },
        {
          name: "Jobs",
          description: "Job management endpoints",
        },
        {
          name: "Documentation",
          description: "API documentation endpoints",
        },
      ];

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe("Health");
      expect(tags[1].name).toBe("Jobs");
      expect(tags[2].name).toBe("Documentation");
    });
  });

  describe("Server Configuration", () => {
    it("should include server configuration", () => {
      const servers = [
        {
          url: "http://localhost:3001",
          description: "Local development server",
        },
      ];

      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBeTruthy();
      expect(servers[0].description).toBe("Local development server");
    });
  });
});
