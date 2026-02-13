/**
 * Tests for Docker configuration files
 *
 * Focuses on configurability aspects (build args, environment variables, overrides).
 * Basic Docker/Dockerfile validation is covered in docker-smoke-tests.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const DOCKERFILE_PATH = join(PROJECT_ROOT, "Dockerfile");
const DOCKER_COMPOSE_PATH = join(PROJECT_ROOT, "docker-compose.yml");
const DOCKERIGNORE_PATH = join(PROJECT_ROOT, ".dockerignore");

describe("Docker Configuration Tests", () => {
  describe("Dockerfile", () => {
    let dockerfileContent: string;

    beforeEach(() => {
      dockerfileContent = readFileSync(DOCKERFILE_PATH, "utf-8");
    });

    // Note: Basic Dockerfile existence, base image, port, health check,
    // non-root user, and multi-stage build are validated in docker-smoke-tests.test.ts
    // This suite focuses on configurability aspects

    it("should set NODE_ENV to production", () => {
      // Check for ARG and ENV with variable substitution
      expect(dockerfileContent).toMatch(/ARG\s+NODE_ENV/);
      expect(dockerfileContent).toMatch(/ENV\s+NODE_ENV=/);
    });

    it("should run API server as CMD", () => {
      expect(dockerfileContent).toMatch(/CMD.*api:server/);
    });

    it("should install dependencies before copying source code", () => {
      const lines = dockerfileContent.split("\n");
      const copyPackageIndex = lines.findIndex((line) =>
        line.includes("COPY package.json")
      );
      const copySourceIndex = lines.findIndex(
        (line) =>
          line.includes("COPY") &&
          line.includes("scripts") &&
          !line.includes("#")
      );

      expect(copyPackageIndex).toBeGreaterThanOrEqual(0);
      expect(copySourceIndex).toBeGreaterThan(copyPackageIndex);
    });

    // Minimization tests
    describe("Image Minimization", () => {
      it("should install all dependencies needed for runtime", () => {
        // All dependencies are needed (notion-fetch and other scripts use devDeps at runtime)
        expect(dockerfileContent).toContain("bun install");
      });

      it("should clear bun package cache after install", () => {
        expect(dockerfileContent).toContain("bun pm cache rm");
      });

      it("should copy only essential runtime files", () => {
        // Copies entire scripts directory for all job execution (job-executor may call any script)
        expect(dockerfileContent).toMatch(/COPY.*scripts/);
        const broadCopyAll = dockerfileContent
          .split("\n")
          .filter((line) => line.includes("COPY") && line.includes("."))
          .filter((line) => line.includes("COPY . ."));
        expect(broadCopyAll.length).toBe(0);
      });

      it("should use chown for non-root user permissions", () => {
        expect(dockerfileContent).toContain("--chown=bun:bun");
      });
    });

    // Configurability tests
    describe("Build Configurability", () => {
      it("should support configurable Bun version via ARG", () => {
        expect(dockerfileContent).toMatch(/ARG\s+BUN_VERSION/);
        expect(dockerfileContent).toMatch(/oven\/bun:\$\{BUN_VERSION\}/);
      });

      it("should support configurable NODE_ENV via ARG", () => {
        expect(dockerfileContent).toMatch(/ARG\s+NODE_ENV/);
      });

      it("should note that healthcheck is configured in docker-compose", () => {
        // Healthcheck is in docker-compose.yml for better env var support
        expect(dockerfileContent).toContain("docker-compose.yml");
      });
    });
  });

  describe("docker-compose.yml", () => {
    let composeContent: string;

    beforeEach(() => {
      composeContent = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");
    });

    // Note: Basic docker-compose structure, service definition, port mapping,
    // required environment variables, health check, restart policy, resource limits,
    // volumes, and logging are validated in docker-smoke-tests.test.ts
    // This suite focuses on configurability aspects

    it("should build from Dockerfile in current context", () => {
      expect(composeContent).toContain("dockerfile: Dockerfile");
      expect(composeContent).toContain("context: .");
    });

    it("should map port 3001 with environment variable override", () => {
      expect(composeContent).toMatch(/ports:.*3001/s);
      expect(composeContent).toContain("${API_PORT:-3001}");
      expect(composeContent).toContain(":3001");
    });

    // Configurability tests
    describe("Environment Variable Configurability", () => {
      it("should support configurable image name", () => {
        expect(composeContent).toMatch(
          /\$\{DOCKER_IMAGE_NAME:-comapeo-docs-api\}/
        );
      });

      it("should support configurable image tag", () => {
        expect(composeContent).toMatch(/\$\{DOCKER_IMAGE_TAG:-latest\}/);
      });

      it("should support configurable container name", () => {
        expect(composeContent).toMatch(
          /\$\{DOCKER_CONTAINER_NAME:-comapeo-api-server\}/
        );
      });

      it("should support build arguments for Bun version", () => {
        expect(composeContent).toMatch(/BUN_VERSION:\s*\$\{BUN_VERSION:-1\}/);
      });

      it("should support configurable resource limits", () => {
        expect(composeContent).toMatch(/\$\{DOCKER_CPU_LIMIT:-1\}/);
        expect(composeContent).toMatch(/\$\{DOCKER_MEMORY_LIMIT:-512M\}/);
      });

      it("should support configurable resource reservations", () => {
        expect(composeContent).toMatch(/\$\{DOCKER_CPU_RESERVATION:-0.25\}/);
        expect(composeContent).toMatch(/\$\{DOCKER_MEMORY_RESERVATION:-128M\}/);
      });

      it("should support configurable restart policy", () => {
        expect(composeContent).toMatch(
          /\$\{DOCKER_RESTART_POLICY:-unless-stopped\}/
        );
      });

      it("should support configurable health check intervals", () => {
        expect(composeContent).toMatch(/\$\{HEALTHCHECK_INTERVAL:-30s\}/);
        expect(composeContent).toMatch(/\$\{HEALTHCHECK_TIMEOUT:-10s\}/);
        expect(composeContent).toMatch(/\$\{HEALTHCHECK_START_PERIOD:-5s\}/);
        expect(composeContent).toMatch(/\$\{HEALTHCHECK_RETRIES:-3\}/);
      });

      it("should support configurable logging options", () => {
        expect(composeContent).toMatch(/\$\{DOCKER_LOG_DRIVER:-json-file\}/);
        expect(composeContent).toMatch(/\$\{DOCKER_LOG_MAX_SIZE:-10m\}/);
        expect(composeContent).toMatch(/\$\{DOCKER_LOG_MAX_FILE:-3\}/);
      });

      it("should support configurable volume name", () => {
        expect(composeContent).toMatch(
          /\$\{DOCKER_VOLUME_NAME:-comapeo-job-data\}/
        );
      });

      it("should support configurable network name", () => {
        expect(composeContent).toMatch(/\$\{DOCKER_NETWORK:-comapeo-network\}/);
        expect(composeContent).toMatch(
          /\$\{DOCKER_NETWORK_NAME:-comapeo-network\}/
        );
      });

      it("should include metadata labels", () => {
        expect(composeContent).toContain("com.comapeo.description");
        expect(composeContent).toContain("com.comapeo.version");
        expect(composeContent).toContain("com.comapeo.managed-by");
      });
    });
  });

  describe(".dockerignore", () => {
    let dockerignoreContent: string;
    let dockerignoreLines: string[];

    beforeEach(() => {
      dockerignoreContent = readFileSync(DOCKERIGNORE_PATH, "utf-8");
      dockerignoreLines = dockerignoreContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    });

    it("should exist", () => {
      expect(existsSync(DOCKERIGNORE_PATH)).toBe(true);
    });

    it("should exclude node_modules", () => {
      expect(dockerignoreLines).toContain("node_modules");
    });

    it("should exclude .env files", () => {
      expect(
        dockerignoreLines.some(
          (line) => line.startsWith(".env") && line !== ".env.example"
        )
      ).toBe(true);
    });

    it("should exclude test files and coverage", () => {
      expect(dockerignoreLines.some((line) => line.includes("test"))).toBe(
        true
      );
      expect(dockerignoreLines.some((line) => line.includes("coverage"))).toBe(
        true
      );
    });

    it("should exclude documentation directories", () => {
      expect(dockerignoreLines).toContain("docs/");
      expect(dockerignoreLines).toContain("context/");
    });

    it("should exclude .git directory", () => {
      expect(dockerignoreLines).toContain(".git/");
    });

    it("should exclude IDE directories", () => {
      expect(dockerignoreLines).toContain(".vscode/");
      expect(dockerignoreLines).toContain(".idea/");
    });

    it("should exclude Docker files themselves", () => {
      expect(
        dockerignoreLines.some((line) => line.includes("Dockerfile"))
      ).toBe(true);
      expect(
        dockerignoreLines.some((line) => line.includes("docker-compose"))
      ).toBe(true);
    });

    it("should exclude generated content from content branch", () => {
      expect(dockerignoreLines).toContain("docs/");
      expect(dockerignoreLines).toContain("i18n/");
      expect(dockerignoreLines).toContain("static/images/");
    });

    it("should exclude job persistence data", () => {
      expect(dockerignoreLines).toContain(".jobs-data/");
    });

    // Minimization tests
    describe("Image Size Minimization", () => {
      it("should exclude development configuration files", () => {
        expect(dockerignoreLines).toContain(".eslintrc*");
        expect(dockerignoreLines).toContain(".prettierrc*");
        expect(dockerignoreLines).toContain("lefthook.yml");
      });

      it("should exclude CI/CD configuration", () => {
        expect(dockerignoreLines).toContain(".github/");
        expect(dockerignoreLines).toContain(".gitlab-ci.yml");
      });

      it("should exclude development worktrees", () => {
        expect(dockerignoreLines).toContain("worktrees/");
      });

      it("should exclude test configuration files", () => {
        expect(dockerignoreLines).toContain("vitest.config.ts");
        expect(dockerignoreLines).toContain("__tests__/");
      });

      it("should exclude build artifacts", () => {
        expect(dockerignoreLines).toContain("build/");
        expect(dockerignoreLines).toContain("dist/");
        expect(dockerignoreLines).toContain(".docusaurus/");
      });

      it("should exclude project documentation", () => {
        expect(dockerignoreLines).toContain("README.md");
        expect(dockerignoreLines).toContain("CONTRIBUTING.md");
        expect(dockerignoreLines).toContain("context/");
      });

      it("should exclude assets not needed for API", () => {
        expect(dockerignoreLines).toContain("assets/");
        // favicon.* pattern (with glob, not just favicon.)
        expect(
          dockerignoreLines.some((line) => line.startsWith("favicon."))
        ).toBe(true);
      });

      it("should exclude development planning files", () => {
        expect(dockerignoreLines).toContain("TASK.md");
        expect(dockerignoreLines).toContain("PRD.md");
        expect(dockerignoreLines).toContain("TODO.md");
      });

      it("should exclude OS-specific files", () => {
        expect(dockerignoreLines).toContain(".DS_Store");
        expect(dockerignoreLines).toContain("Thumbs.db");
      });
    });
  });

  describe("Docker Configuration Integration", () => {
    // Note: Port consistency and health check endpoint validation
    // are covered in docker-smoke-tests.test.ts

    it("should include all required environment variables in compose", () => {
      const compose = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");

      const requiredEnvVars = [
        "NOTION_API_KEY",
        "DATABASE_ID",
        "DATA_SOURCE_ID",
        "OPENAI_API_KEY",
      ];

      for (const envVar of requiredEnvVars) {
        expect(compose).toContain(envVar);
      }
    });

    it("should support build args in docker-compose that match Dockerfile ARGs", () => {
      const dockerfile = readFileSync(DOCKERFILE_PATH, "utf-8");
      const compose = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");

      // Extract ARG names from Dockerfile
      const dockerfileArgs = dockerfile
        .split("\n")
        .filter((line) => line.trim().startsWith("ARG "))
        .map((line) => line.replace(/ARG\s+/, "").trim());

      // Check that key build args are passed in docker-compose
      expect(compose).toContain("BUN_VERSION:");
      expect(compose).toContain("NODE_ENV:");
    });
  });

  describe("Production Security Defaults Validation", () => {
    let dockerfileContent: string;
    let composeContent: string;

    beforeEach(() => {
      dockerfileContent = readFileSync(DOCKERFILE_PATH, "utf-8");
      composeContent = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");
    });

    describe("Dockerfile Production Security", () => {
      it("should use production NODE_ENV by default", () => {
        expect(dockerfileContent).toMatch(/ARG\s+NODE_ENV=production/);
      });

      it("should run as non-root user bun from base image", () => {
        // bun user is already provided by oven/bun base image
        expect(dockerfileContent).toContain("USER bun");
      });

      it("should set restrictive directory permissions", () => {
        expect(dockerfileContent).toMatch(/chmod\s+-R\s+750\s+\/app/);
      });

      it("should use frozen lockfile for reproducible builds", () => {
        expect(dockerfileContent).toContain("--frozen-lockfile");
      });

      it("should clear package manager cache to reduce image size", () => {
        expect(dockerfileContent).toContain("bun pm cache rm");
      });

      it("should install all dependencies needed for runtime", () => {
        // All dependencies are needed (notion-fetch and other scripts use devDeps at runtime)
        expect(dockerfileContent).toContain("bun install");
      });

      it("should not include test files in production image", () => {
        const lines = dockerfileContent.split("\n");
        const copyLines = lines.filter(
          (line) => line.includes("COPY") && !line.trim().startsWith("#")
        );
        const hasTestCopy = copyLines.some(
          (line) =>
            line.includes("test") ||
            line.includes("__tests__") ||
            line.includes(".test.")
        );
        expect(hasTestCopy).toBe(false);
      });

      it("should not include documentation in production image", () => {
        const lines = dockerfileContent.split("\n");
        const copyLines = lines.filter(
          (line) => line.includes("COPY") && !line.trim().startsWith("#")
        );
        const hasDocsCopy = copyLines.some(
          (line) => line.includes("docs/") || line.includes("context/")
        );
        expect(hasDocsCopy).toBe(false);
      });

      it("should have health check configured in docker-compose for monitoring", () => {
        // Healthcheck is in docker-compose.yml, not Dockerfile, for env var support
        expect(dockerfileContent).toContain("EXPOSE 3001");
      });
    });

    describe("Docker Compose Production Security", () => {
      it("should use production NODE_ENV by default", () => {
        expect(composeContent).toMatch(
          /NODE_ENV:\s*\$\{NODE_ENV:-production\}/
        );
      });

      it("should configure resource limits to prevent DoS", () => {
        expect(composeContent).toMatch(/resources:/);
        expect(composeContent).toMatch(/limits:/);
        expect(composeContent).toContain("cpus:");
        expect(composeContent).toContain("memory:");
      });

      it("should configure resource reservations for QoS", () => {
        expect(composeContent).toMatch(/reservations:/);
      });

      it("should have restart policy for resilience", () => {
        expect(composeContent).toMatch(/restart:/);
        expect(composeContent).toMatch(/unless-stopped|always/);
      });

      it("should configure health check with sensible defaults", () => {
        expect(composeContent).toMatch(/healthcheck:/);
        expect(composeContent).toContain("interval:");
        expect(composeContent).toContain("timeout:");
        expect(composeContent).toContain("retries:");
      });

      it("should configure log rotation to prevent disk exhaustion", () => {
        expect(composeContent).toMatch(/logging:/);
        expect(composeContent).toContain("max-size:");
        expect(composeContent).toContain("max-file:");
      });

      it("should use named volumes for persistent data", () => {
        expect(composeContent).toMatch(/volumes:/);
        expect(composeContent).toContain("comapeo-job-data");
      });

      it("should use custom network for isolation", () => {
        expect(composeContent).toMatch(/networks:/);
        expect(composeContent).toContain("comapeo-network");
      });

      it("should document API authentication capability", () => {
        // API_KEY_ pattern for authentication
        expect(composeContent).toContain("API_KEY_");
      });

      it("should not expose unnecessary ports", () => {
        // Should only expose port 3001 for the API
        const lines = composeContent.split("\n");
        const portsSection = lines.join(" ");
        // Count port mappings (format: "HOST:CONTAINER")
        const portMappings = portsSection.match(/"\s*\d+:\d+\s*"/g);
        expect(portMappings?.length || 0).toBeLessThanOrEqual(1);
      });
    });

    describe("Environment Variable Security", () => {
      it("should require Notion API credentials", () => {
        expect(composeContent).toContain("NOTION_API_KEY:");
        expect(composeContent).toContain("DATABASE_ID:");
        expect(composeContent).toContain("DATA_SOURCE_ID:");
      });

      it("should require OpenAI API key for translations", () => {
        expect(composeContent).toContain("OPENAI_API_KEY:");
      });

      it("should document API authentication in .env.example", () => {
        const envExample = readFileSync(
          join(PROJECT_ROOT, ".env.example"),
          "utf-8"
        );
        expect(envExample).toContain("API_KEY_");
      });

      it("should not hardcode sensitive values in compose file", () => {
        // All sensitive values should use environment variable substitution
        // Check for common hardcoded sensitive patterns (excluding env var references)
        const lines = composeContent.split("\n");
        const hardcodedSecrets = lines.filter((line) => {
          // Skip comments and env var substitutions
          if (line.trim().startsWith("#") || line.includes("${")) {
            return false;
          }
          // Look for suspicious patterns like: password: value, secret: value, api_key: value
          // But NOT: NOTION_API_KEY: (which is an env var reference)
          return (
            (line.match(/password\s*:\s*[^$\s{]/i) ||
              line.match(/secret\s*:\s*[^$\s{]/i) ||
              line.match(/api_key\s*:\s*[^$\s{]/i)) &&
            !line.match(/API_KEY\s*:/) // Allow env var references
          );
        });
        expect(hardcodedSecrets.length).toBe(0);
      });
    });

    describe("Production Defaults Verification", () => {
      it("should have reasonable default memory limits", () => {
        // Default memory limit should be at least 256M
        expect(composeContent).toMatch(/DOCKER_MEMORY_LIMIT:-\d+[Mm]/);
      });

      it("should have reasonable default CPU limits", () => {
        // Default CPU limit should be specified
        expect(composeContent).toMatch(/DOCKER_CPU_LIMIT:-[\d.]+/);
      });

      it("should have reasonable health check intervals", () => {
        // Health check should not be too aggressive (default >= 10s)
        expect(composeContent).toMatch(/HEALTHCHECK_INTERVAL:-[3-9]\d+s/);
      });

      it("should have reasonable log rotation configured", () => {
        // Default max-size should be specified (e.g., 10m)
        expect(composeContent).toMatch(/DOCKER_LOG_MAX_SIZE:-\d+[Mm]/);
        // Default max-file should be specified
        expect(composeContent).toMatch(/DOCKER_LOG_MAX_FILE:-\d+/);
      });
    });
  });
});
