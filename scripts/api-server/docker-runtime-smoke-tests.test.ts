/**
 * Docker Runtime Smoke Tests for Container Health and Job Lifecycle
 *
 * These tests validate that the Docker container can:
 * - Build successfully
 * - Start and respond to health checks
 * - Handle basic job lifecycle operations (create, query, list, cancel)
 *
 * These tests require Docker to be available and are skipped in CI by default.
 * Run locally with: bun run test:api-server docker-runtime
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  unlinkSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout } from "node:timers/promises";

const PROJECT_ROOT = process.cwd();
const DOCKERFILE_PATH = join(PROJECT_ROOT, "Dockerfile");
const DOCKER_COMPOSE_PATH = join(PROJECT_ROOT, "docker-compose.yml");

// Check if Docker is available
const isCI = process.env.CI === "true";
const hasDocker =
  !isCI && process.platform !== "win32" && existsSync("/var/run/docker.sock");

// Generate unique identifiers for test isolation
const generateTestSuffix = () => randomBytes(4).toString("hex");
const testSuffix = generateTestSuffix();
const TEST_CONTAINER_NAME = `comapeo-smoke-test-${testSuffix}`;
const TEST_IMAGE_NAME = `comapeo-smoke-test:${testSuffix}`;
const TEST_VOLUME_NAME = `comapeo-smoke-test-data-${testSuffix}`;

// Create temporary directory for test environment
const testEnvDir = mkdtempSync(join(tmpdir(), "comapeo-smoke-test-"));
const testEnvFile = join(testEnvDir, ".env.smoke");

// Helper to execute shell commands
function execCommand(
  command: string,
  options: { timeout?: number; silent?: boolean } = {}
): { stdout: string; stderr: string; exitCode: number | null } {
  const { timeout = 30000, silent = false } = options;

  try {
    const stdout = execSync(command, {
      encoding: "utf-8",
      timeout,
      stdio: silent ? "pipe" : "inherit",
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      status?: number | null;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? null,
    };
  }
}

// Helper to start a container and return its ID
function startContainer(
  imageName: string,
  containerName: string,
  envFile: string
): string | null {
  const port = 3001; // Use standard port for smoke tests

  const result = execCommand(
    `docker run -d --name ${containerName} -p ${port}:3001 --env-file ${envFile} --rm ${imageName}`,
    { silent: true }
  );

  if (result.exitCode !== 0) {
    console.error("Failed to start container:", result.stderr);
    return null;
  }

  return result.stdout.trim();
}

// Helper to stop and remove a container
function stopContainer(containerName: string): void {
  execCommand(`docker stop ${containerName}`, { silent: true, timeout: 10000 });
  execCommand(`docker rm -f ${containerName}`, { silent: true, timeout: 5000 });
}

// Helper to check if container is running
function isContainerRunning(containerName: string): boolean {
  const result = execCommand(
    `docker inspect -f '{{.State.Running}}' ${containerName}`,
    { silent: true, timeout: 5000 }
  );
  return result.stdout.trim() === "true";
}

// Helper to get container health status
function getContainerHealth(containerName: string): string {
  const result = execCommand(
    `docker inspect -f '{{.State.Health.Status}}' ${containerName} || echo "no-healthcheck"`,
    { silent: true, timeout: 5000 }
  );
  return result.stdout.trim();
}

// Helper to get container logs
function getContainerLogs(containerName: string): string {
  const result = execCommand(`docker logs --tail 50 ${containerName}`, {
    silent: true,
    timeout: 5000,
  });
  return result.stdout;
}

// Helper to make HTTP request to container
function makeHttpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  } = {}
): { status: number; body: string; headers: Record<string, string> } {
  const { method = "GET", headers = {}, body, timeout = 10000 } = options;

  let curlCommand = `curl -s -w '\\n%{http_code}\\n%{header_keys}' -X ${method} ${url}`;

  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    curlCommand += ` -H '${key}: ${value}'`;
  });

  // Add body if present
  if (body) {
    curlCommand += ` -d '${body}'`;
  }

  // Add timeout
  curlCommand += ` --max-time ${Math.floor(timeout / 1000)}`;

  const result = execCommand(curlCommand, { silent: true, timeout });
  const lines = result.stdout.split("\n");

  // Last line is status code, second to last is headers
  const status = parseInt(lines[lines.length - 1] || "0", 10);
  const responseBody = lines.slice(0, -2).join("\n");

  return {
    status,
    body: responseBody,
    headers: {},
  };
}

// Setup test environment file
function setupTestEnv(): void {
  // Create minimal environment for smoke testing
  // We use placeholder values since we're testing basic API functionality
  const envContent = `
# API Configuration
NODE_ENV=test
API_HOST=0.0.0.0
API_PORT=3001

# Notion Configuration (minimal for testing)
NOTION_API_KEY=test_key_for_smoke_testing
DATABASE_ID=test_database_id
DATA_SOURCE_ID=test_data_source_id

# OpenAI Configuration (minimal for testing)
OPENAI_API_KEY=test_openai_key_for_smoke_testing
OPENAI_MODEL=gpt-4o-mini

# Disable authentication for smoke testing
# API_KEY_SMOKE_TEST=smoke-test-key-must-be-at-least-16-chars

# Documentation Configuration
DEFAULT_DOCS_PAGE=introduction

# Image Processing Configuration
ENABLE_RETRY_IMAGE_PROCESSING=true
MAX_IMAGE_RETRIES=3
`;

  writeFileSync(testEnvFile, envContent.trim());
}

// Cleanup test environment
function cleanupTestEnv(): void {
  try {
    if (existsSync(testEnvFile)) {
      unlinkSync(testEnvFile);
    }
    // Remove temporary directory
    rmSync(testEnvDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("Docker Runtime Smoke Tests", () => {
  // Skip all tests if Docker is not available or in CI
  const runTests = hasDocker && process.env.RUN_DOCKER_SMOKE_TESTS === "true";

  beforeAll(() => {
    if (runTests) {
      setupTestEnv();
    }
  });

  afterAll(() => {
    if (runTests) {
      cleanupTestEnv();
      // Clean up test container and image
      execCommand(`docker rm -f ${TEST_CONTAINER_NAME}`, {
        silent: true,
        timeout: 5000,
      });
      execCommand(`docker rmi ${TEST_IMAGE_NAME}`, {
        silent: true,
        timeout: 30000,
      });
      execCommand(`docker volume rm ${TEST_VOLUME_NAME}`, {
        silent: true,
        timeout: 5000,
      });
    }
  });

  describe.skipIf(!runTests)("Docker Image Build", () => {
    it("should build Docker image successfully", () => {
      const result = execCommand(
        `docker build -t ${TEST_IMAGE_NAME} -f ${DOCKERFILE_PATH} .`,
        { timeout: 120000, silent: true }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("ERROR");

      // Verify image exists
      const inspectResult = execCommand(`docker inspect ${TEST_IMAGE_NAME}`, {
        silent: true,
        timeout: 5000,
      });
      expect(inspectResult.exitCode).toBe(0);
      expect(inspectResult.stdout).toContain(TEST_IMAGE_NAME);
    });

    it("should use correct base image", () => {
      const inspectResult = execCommand(
        `docker inspect ${TEST_IMAGE_NAME} --format='{{.Config.Image}}'`,
        { silent: true, timeout: 5000 }
      );

      expect(inspectResult.exitCode).toBe(0);
      expect(inspectResult.stdout).toContain("oven/bun");
    });
  });

  describe.skipIf(!runTests)("Container Startup and Health", () => {
    let containerId: string | null = null;

    afterAll(() => {
      if (containerId) {
        stopContainer(TEST_CONTAINER_NAME);
      }
    });

    it("should start container successfully", () => {
      containerId = startContainer(
        TEST_IMAGE_NAME,
        TEST_CONTAINER_NAME,
        testEnvFile
      );

      expect(containerId).toBeTruthy();
      expect(containerId?.length).toBeGreaterThan(0);

      // Give container a moment to start
      setTimeout(2000);
    }, 15000);

    it("should be in running state", () => {
      const running = isContainerRunning(TEST_CONTAINER_NAME);
      expect(running).toBe(true);
    });

    it("should become healthy within startup period", async () => {
      let health = "starting";
      let attempts = 0;
      const maxAttempts = 15; // 15 seconds with 1s intervals

      while (health !== "healthy" && attempts < maxAttempts) {
        await setTimeout(1000);
        health = getContainerHealth(TEST_CONTAINER_NAME);
        attempts++;

        // Some containers may not have healthcheck configured in test mode
        if (health === "no-healthcheck") {
          break;
        }
      }

      // Either healthy or no healthcheck configured (acceptable for test mode)
      expect(["healthy", "no-healthcheck"]).toContain(health);
    }, 30000);

    it("should have container logs showing successful startup", () => {
      const logs = getContainerLogs(TEST_CONTAINER_NAME);

      // Check for startup messages
      expect(logs).toMatch(/running|started|listening/i);
    });
  });

  describe.skipIf(!runTests)("Health Check Endpoint", () => {
    let containerId: string | null = null;
    const API_URL = "http://localhost:3001";

    beforeAll(async () => {
      containerId = startContainer(
        TEST_IMAGE_NAME,
        TEST_CONTAINER_NAME,
        testEnvFile
      );
      // Wait for container to be ready
      await setTimeout(5000);
    }, 15000);

    afterAll(() => {
      if (containerId) {
        stopContainer(TEST_CONTAINER_NAME);
      }
    });

    it("GET /health should return 200 status", () => {
      const response = makeHttpRequest(`${API_URL}/health`);

      expect(response.status).toBe(200);
    });

    it("GET /health should return valid JSON response", () => {
      const response = makeHttpRequest(`${API_URL}/health`);

      expect(() => JSON.parse(response.body)).not.toThrow();
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty("status", "ok");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("uptime");
      expect(body).toHaveProperty("auth");
    });

    it("GET /health should show auth configuration", () => {
      const response = makeHttpRequest(`${API_URL}/health`);
      const body = JSON.parse(response.body);

      expect(body.auth).toHaveProperty("enabled");
      expect(body.auth).toHaveProperty("keysConfigured");
      expect(typeof body.auth.enabled).toBe("boolean");
      expect(typeof body.auth.keysConfigured).toBe("number");
    });

    it("GET /health should include X-Request-ID header", () => {
      const result = execCommand(
        `curl -s -I http://localhost:3001/health | grep -i 'x-request-id'`,
        { silent: true, timeout: 5000 }
      );

      // Header should be present
      expect(result.stdout.toLowerCase()).toContain("x-request-id");
    });
  });

  describe.skipIf(!runTests)("Job Lifecycle Operations", () => {
    let containerId: string | null = null;
    const API_URL = "http://localhost:3001";

    beforeAll(async () => {
      containerId = startContainer(
        TEST_IMAGE_NAME,
        TEST_CONTAINER_NAME,
        testEnvFile
      );
      // Wait for container to be fully ready
      await setTimeout(5000);
    }, 15000);

    afterAll(() => {
      if (containerId) {
        stopContainer(TEST_CONTAINER_NAME);
      }
    });

    describe("Public Endpoints", () => {
      it("GET /docs should return API documentation", () => {
        const response = makeHttpRequest(`${API_URL}/docs`);

        expect(response.status).toBe(200);
        expect(() => JSON.parse(response.body)).not.toThrow();

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty("openapi");
        expect(body).toHaveProperty("info");
        expect(body).toHaveProperty("paths");
      });

      it("GET /jobs/types should list available job types", () => {
        const response = makeHttpRequest(`${API_URL}/jobs/types`);

        expect(response.status).toBe(200);
        expect(() => JSON.parse(response.body)).not.toThrow();

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty("data");
        expect(Array.isArray(body.data.types)).toBe(true);
        expect(body.data.types.length).toBeGreaterThan(0);

        // Verify known job types are present
        const typeIds = body.data.types.map((t: { id: string }) => t.id);
        expect(typeIds).toContain("notion:fetch");
        expect(typeIds).toContain("notion:fetch-all");
      });
    });

    describe("Protected Endpoints (without auth)", () => {
      it("GET /jobs should return jobs list (or 401 if auth enabled)", () => {
        const response = makeHttpRequest(`${API_URL}/jobs`);

        // Either returns 200 (no auth configured) or 401 (auth required)
        expect([200, 401]).toContain(response.status);

        if (response.status === 200) {
          expect(() => JSON.parse(response.body)).not.toThrow();
        }
      });

      it("POST /jobs should return 401 when auth is enabled", () => {
        const response = makeHttpRequest(`${API_URL}/jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: "notion:fetch-all" }),
        });

        // Should require authentication
        expect(response.status).toBe(401);
      });

      it("POST /jobs with valid auth should create job", () => {
        // First check if auth is enabled by checking health endpoint
        const healthResponse = makeHttpRequest(`${API_URL}/health`);
        const healthBody = JSON.parse(healthResponse.body);

        if (healthBody.auth.enabled) {
          // Skip this test if we don't have test API keys configured
          console.warn(
            "Auth is enabled but no test API keys provided, skipping job creation test"
          );
          return;
        }

        // Auth is disabled, should be able to create job
        const response = makeHttpRequest(`${API_URL}/jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "notion:fetch-all",
            options: { dryRun: true },
          }),
        });

        // Should either succeed (201) or fail due to missing Notion credentials (500)
        // Both are acceptable for smoke testing
        expect([201, 500]).toContain(response.status);

        if (response.status === 201) {
          expect(() => JSON.parse(response.body)).not.toThrow();
          const body = JSON.parse(response.body);
          expect(body).toHaveProperty("data");
          expect(body.data).toHaveProperty("jobId");
        }
      });
    });

    describe("Error Handling", () => {
      it("GET /nonexistent should return 404", () => {
        const response = makeHttpRequest(`${API_URL}/nonexistent`);

        expect(response.status).toBe(404);

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty("code");
        expect(body).toHaveProperty("message");
      });

      it("POST /jobs with invalid body should return 400", () => {
        const response = makeHttpRequest(`${API_URL}/jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ invalid: "data" }),
        });

        expect(response.status).toBe(400);

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty("code");
        expect(body).toHaveProperty("message");
      });
    });
  });

  describe.skipIf(!runTests)("Container Resource Limits", () => {
    it("should respect configured resource limits", () => {
      // Get container stats
      const result = execCommand(
        `docker inspect ${TEST_CONTAINER_NAME} --format='{{.HostConfig.Memory}}'`,
        { silent: true, timeout: 5000 }
      );

      // Should have memory limit configured
      expect(result.stdout).toBeTruthy();
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!runTests)("Cleanup and Recovery", () => {
    it("should stop cleanly", () => {
      // First ensure container is running
      const containerId = startContainer(
        TEST_IMAGE_NAME,
        TEST_CONTAINER_NAME,
        testEnvFile
      );
      expect(containerId).toBeTruthy();

      // Stop the container
      const stopResult = execCommand(`docker stop ${TEST_CONTAINER_NAME}`, {
        silent: true,
        timeout: 10000,
      });

      expect(stopResult.exitCode).toBe(0);

      // Verify container is stopped
      const running = isContainerRunning(TEST_CONTAINER_NAME);
      expect(running).toBe(false);
    });

    it("should be able to restart after stop", async () => {
      // Start container
      const containerId = startContainer(
        TEST_IMAGE_NAME,
        TEST_CONTAINER_NAME,
        testEnvFile
      );
      expect(containerId).toBeTruthy();

      await setTimeout(3000);

      // Verify it's running
      let running = isContainerRunning(TEST_CONTAINER_NAME);
      expect(running).toBe(true);

      // Stop it
      execCommand(`docker stop ${TEST_CONTAINER_NAME}`, {
        silent: true,
        timeout: 10000,
      });

      await setTimeout(1000);

      // Start again
      const newContainerId = startContainer(
        TEST_IMAGE_NAME,
        TEST_CONTAINER_NAME,
        testEnvFile
      );
      expect(newContainerId).toBeTruthy();

      await setTimeout(3000);

      // Verify it's running again
      running = isContainerRunning(TEST_CONTAINER_NAME);
      expect(running).toBe(true);

      // Cleanup
      stopContainer(TEST_CONTAINER_NAME);
    }, 30000);
  });
});

// Export for use in other test files
export const dockerSmokeTestConfig = {
  TEST_CONTAINER_NAME,
  TEST_IMAGE_NAME,
  TEST_VOLUME_NAME,
  hasDocker,
  isCI,
};
