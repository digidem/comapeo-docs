/**
 * HTTP Integration Tests for API Server
 *
 * Tests the actual HTTP server endpoints via real HTTP requests.
 * The server auto-starts when imported (using port 0 in test mode).
 *
 * Run with: bun test scripts/api-server/http-integration.test.ts
 * (requires Bun runtime for native serve() support)
 */

import {
  describe,
  it,
  expect,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { server, actualPort } from "./index";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import { getAuth } from "./auth";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { clearAllowedOriginsCache } from "./middleware/cors";

const DATA_DIR = join(process.cwd(), ".jobs-data");
const BASE_URL = `http://localhost:${actualPort}`;

function cleanupTestData(): void {
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
  }
}

describe("HTTP Integration Tests", () => {
  beforeEach(() => {
    destroyJobTracker();
    cleanupTestData();
    getJobTracker(); // fresh tracker
    const auth = getAuth();
    auth.clearKeys();
  });

  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
    clearAllowedOriginsCache();
  });

  afterAll(() => {
    server.stop();
    destroyJobTracker();
    cleanupTestData();
  });

  // --- Public Endpoints ---

  describe("GET /health", () => {
    it("should return 200 with health data", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("ok");
      expect(body.data.timestamp).toBeDefined();
      expect(body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(body.requestId).toMatch(/^req_/);
    });

    it("should not require authentication", async () => {
      const auth = getAuth();
      auth.addKey("test", "test-key-1234567890123456", {
        name: "test",
        active: true,
      });
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      auth.clearKeys();
    });
  });

  describe("GET /docs", () => {
    it("should return OpenAPI spec", async () => {
      const res = await fetch(`${BASE_URL}/docs`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe("3.0.0");
      expect(body.info.title).toBe("CoMapeo Documentation API");
      expect(body.paths).toBeDefined();
    });
  });

  describe("GET /jobs/types", () => {
    it("should list all job types including notion:count-pages", async () => {
      const res = await fetch(`${BASE_URL}/jobs/types`);
      expect(res.status).toBe(200);
      const body = await res.json();
      const typeIds = body.data.types.map((t: { id: string }) => t.id);
      expect(typeIds).toContain("notion:fetch");
      expect(typeIds).toContain("notion:fetch-all");
      expect(typeIds).toContain("notion:count-pages");
      expect(typeIds).toContain("notion:translate");
    });
  });

  // --- CORS ---

  describe("OPTIONS preflight", () => {
    it("should return 204 with full CORS headers", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
      expect(res.headers.get("access-control-allow-headers")).toBe(
        "Content-Type, Authorization"
      );
      expect(res.headers.get("vary")).toBeNull();
    });

    it("should handle requests with custom Origin header in allow-all mode", async () => {
      // In allow-all mode (no ALLOWED_ORIGINS set), custom origins should get wildcard
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "OPTIONS",
        headers: { Origin: "https://example.com" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
      expect(res.headers.get("access-control-allow-headers")).toBe(
        "Content-Type, Authorization"
      );
      expect(res.headers.get("vary")).toBeNull();
    });

    it("should handle requests without Origin header", async () => {
      // Requests without Origin header are same-origin and should work
      const res = await fetch(`${BASE_URL}/jobs`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
      expect(res.headers.get("access-control-allow-headers")).toBe(
        "Content-Type, Authorization"
      );
      expect(res.headers.get("vary")).toBeNull();
    });

    it("should include Vary: Origin in restricted origin mode", async () => {
      process.env.ALLOWED_ORIGINS = "https://example.com";
      clearAllowedOriginsCache();

      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "OPTIONS",
        headers: { Origin: "https://example.com" },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(
        "https://example.com"
      );
      expect(res.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
      expect(res.headers.get("access-control-allow-headers")).toBe(
        "Content-Type, Authorization"
      );
      expect(res.headers.get("vary")).toBe("Origin");
    });
  });

  // --- Authentication ---

  describe("Protected endpoints", () => {
    it("should return 401 when auth is enabled and no key provided", async () => {
      const auth = getAuth();
      auth.addKey("test", "test-key-1234567890123456", {
        name: "test",
        active: true,
      });
      const res = await fetch(`${BASE_URL}/jobs`);
      expect(res.status).toBe(401);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      auth.clearKeys();
    });

    it("should return 200 when valid Bearer token provided", async () => {
      const auth = getAuth();
      const key = "test-key-1234567890123456";
      auth.addKey("test", key, { name: "test", active: true });
      const res = await fetch(`${BASE_URL}/jobs`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      expect(res.status).toBe(200);
      auth.clearKeys();
    });
  });

  // --- POST /jobs ---

  describe("POST /jobs", () => {
    it("should reject missing Content-Type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject invalid job type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invalid:type" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_ENUM_VALUE");
    });

    it("should create a job with valid type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.jobId).toBeTruthy();
      expect(body.data.status).toBe("pending");
      expect(body.data._links.self).toMatch(/^\/jobs\//);
    });

    it("should reject unknown options", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notion:fetch",
          options: { unknownKey: true },
        }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject non-JSON Content-Type", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });

    it("should reject malformed JSON", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid json",
      });
      expect(res.status).toBe(400);
    });

    it("should accept valid options", async () => {
      const res = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notion:fetch",
          options: { maxPages: 5, force: true },
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.jobId).toBeTruthy();
    });
  });

  // --- GET /jobs ---

  describe("GET /jobs", () => {
    it("should return empty list when no jobs exist", async () => {
      const res = await fetch(`${BASE_URL}/jobs`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items).toEqual([]);
      expect(body.data.count).toBe(0);
    });

    it("should filter by status", async () => {
      // Create a job first
      const createRes = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      const createBody = await createRes.json();
      const jobId = createBody.data.jobId;

      // Immediately query for the job - should be pending initially
      const res = await fetch(`${BASE_URL}/jobs?status=pending`);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Job might have started running, so check for either pending or running
      const allRes = await fetch(`${BASE_URL}/jobs`);
      const allBody = await allRes.json();
      const ourJob = allBody.data.items.find(
        (j: { id: string }) => j.id === jobId
      );
      expect(ourJob).toBeDefined();
    });

    it("should filter by type", async () => {
      // Create a job first
      await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notion:fetch" }),
      });

      const res = await fetch(`${BASE_URL}/jobs?type=notion:fetch`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(body.data.items[0].type).toBe("notion:fetch");
    });

    it("should reject invalid status filter", async () => {
      const res = await fetch(`${BASE_URL}/jobs?status=invalid`);
      expect(res.status).toBe(400);
    });

    it("should reject invalid type filter", async () => {
      const res = await fetch(`${BASE_URL}/jobs?type=invalid:type`);
      expect(res.status).toBe(400);
    });
  });

  // --- GET /jobs/:id ---

  describe("GET /jobs/:id", () => {
    it("should return 404 for nonexistent job", async () => {
      const res = await fetch(`${BASE_URL}/jobs/nonexistent-id`);
      expect(res.status).toBe(404);
    });

    it("should reject path traversal in job ID", async () => {
      // Try URL-encoded path traversal
      const res1 = await fetch(`${BASE_URL}/jobs/..%2F..%2Fetc%2Fpasswd`);
      expect(res1.status).toBe(400);

      // Also test with encoded backslashes
      const res2 = await fetch(`${BASE_URL}/jobs/..%5C..%5Cetc%5Cpasswd`);
      expect(res2.status).toBe(400);
    });

    it("should return job details for existing job", async () => {
      // Create a job
      const createRes = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      const createBody = await createRes.json();
      const jobId = createBody.data.jobId;

      const res = await fetch(`${BASE_URL}/jobs/${jobId}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(jobId);
      expect(body.data.type).toBe("notion:fetch");
    });
  });

  // --- DELETE /jobs/:id ---

  describe("DELETE /jobs/:id", () => {
    it("should return 404 for nonexistent job", async () => {
      const res = await fetch(`${BASE_URL}/jobs/nonexistent-id`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("should cancel a pending job", async () => {
      // Create a job
      const createRes = await fetch(`${BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "notion:fetch" }),
      });
      const createBody = await createRes.json();
      const jobId = createBody.data.jobId;

      const res = await fetch(`${BASE_URL}/jobs/${jobId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe("cancelled");
    });

    it("should reject canceling a completed job", async () => {
      // Create and manually complete a job
      const tracker = getJobTracker();
      const jobId = tracker.createJob("notion:fetch");
      tracker.updateJobStatus(jobId, "completed", {
        success: true,
        data: {},
      });

      const res = await fetch(`${BASE_URL}/jobs/${jobId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  // --- 404 catch-all ---

  describe("Unknown routes", () => {
    it("should return 404 with available endpoints", async () => {
      const res = await fetch(`${BASE_URL}/nonexistent`);
      expect(res.status).toBe(404);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      const body = await res.json();
      expect(body.code).toBe("ENDPOINT_NOT_FOUND");
      expect(body.details.availableEndpoints).toBeDefined();
    });
  });

  // --- Request tracing ---

  describe("Request tracing", () => {
    it("should include X-Request-ID in response headers", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    });
  });

  // --- CORS on all responses ---

  describe("CORS headers", () => {
    it("should include CORS headers on all responses", async () => {
      const responses = await Promise.all([
        fetch(`${BASE_URL}/health`),
        fetch(`${BASE_URL}/nonexistent`),
      ]);

      for (const res of responses) {
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
        expect(res.headers.get("access-control-allow-methods")).toBe(
          "GET, POST, DELETE, OPTIONS"
        );
        expect(res.headers.get("access-control-allow-headers")).toBe(
          "Content-Type, Authorization"
        );
        expect(res.headers.get("vary")).toBeNull();
      }
    });
  });
});
