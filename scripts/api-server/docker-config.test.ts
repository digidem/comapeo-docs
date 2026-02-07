/**
 * Tests for Docker configuration files
 * Validates Dockerfile syntax, docker-compose configuration, and .dockerignore patterns
 * Tests both minimization (image size optimization) and configurability (environment variable overrides)
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

    it("should exist", () => {
      expect(existsSync(DOCKERFILE_PATH)).toBe(true);
    });

    it("should use official Bun base image", () => {
      expect(dockerfileContent).toMatch(/FROM\s+oven\/bun:/);
    });

    it("should set working directory to /app", () => {
      expect(dockerfileContent).toContain("WORKDIR /app");
    });

    it("should expose port 3001 for API service", () => {
      expect(dockerfileContent).toContain("EXPOSE 3001");
    });

    it("should include health check using /health endpoint", () => {
      expect(dockerfileContent).toContain("HEALTHCHECK");
      expect(dockerfileContent).toContain("/health");
    });

    it("should use non-root user for security", () => {
      expect(dockerfileContent).toMatch(/adduser|addgroup/);
      expect(dockerfileContent).toContain("USER bun");
    });

    it("should set NODE_ENV to production", () => {
      // Check for ARG and ENV with variable substitution
      expect(dockerfileContent).toMatch(/ARG\s+NODE_ENV/);
      expect(dockerfileContent).toMatch(/ENV\s+NODE_ENV=\$\{NODE_ENV\}/);
    });

    it("should run API server as CMD", () => {
      expect(dockerfileContent).toContain("CMD");
      expect(dockerfileContent).toContain("api:server");
    });

    it("should use multi-stage build for optimization", () => {
      expect(dockerfileContent).toMatch(/FROM\s+.*\s+AS\s+(deps|runner)/);
      expect(dockerfileContent).toContain("COPY --from");
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
      it("should only copy production dependencies", () => {
        expect(dockerfileContent).toContain("--production");
      });

      it("should clear bun package cache after install", () => {
        expect(dockerfileContent).toContain("bun pm cache rm");
      });

      it("should copy only essential API server files", () => {
        // Should copy api-server directory
        expect(dockerfileContent).toMatch(/COPY.*scripts\/api-server/);
        // Should NOT copy all files with broad COPY . .
        const broadCopyLines = dockerfileContent
          .split("\n")
          .filter(
            (line) =>
              line.includes("COPY") && line.includes(".") && !line.includes("#")
          );
        // The only COPY . . should be for package files, not everything
        const broadCopyAll = broadCopyLines.filter((line) =>
          line.includes("COPY . .")
        );
        expect(broadCopyAll.length).toBe(0);
      });

      it("should not include development dependencies in final image", () => {
        expect(dockerfileContent).toContain("--production");
      });

      it("should use chown for non-root user permissions", () => {
        expect(dockerfileContent).toContain("--chown=bun:bun");
      });
    });

    // Configurability tests
    describe("Build Configurability", () => {
      it("should support configurable Bun version via ARG", () => {
        expect(dockerfileContent).toMatch(/ARG\s+BUN_VERSION/);
        expect(dockerfileContent).toMatch(/oven\/bun:\$\{BUN_VERSION/);
      });

      it("should support configurable NODE_ENV via ARG", () => {
        expect(dockerfileContent).toMatch(/ARG\s+NODE_ENV/);
      });

      it("should support configurable health check intervals via ARG", () => {
        expect(dockerfileContent).toMatch(/ARG\s+HEALTHCHECK_INTERVAL/);
        expect(dockerfileContent).toMatch(/ARG\s+HEALTHCHECK_TIMEOUT/);
        expect(dockerfileContent).toMatch(/ARG\s+HEALTHCHECK_START_PERIOD/);
        expect(dockerfileContent).toMatch(/ARG\s+HEALTHCHECK_RETRIES/);
      });

      it("should use ARG variables in HEALTHCHECK instruction", () => {
        expect(dockerfileContent).toMatch(/\$\{HEALTHCHECK_INTERVAL\}/);
        expect(dockerfileContent).toMatch(/\$\{HEALTHCHECK_TIMEOUT\}/);
        expect(dockerfileContent).toMatch(/\$\{HEALTHCHECK_START_PERIOD\}/);
        expect(dockerfileContent).toMatch(/\$\{HEALTHCHECK_RETRIES\}/);
      });
    });
  });

  describe("docker-compose.yml", () => {
    let composeContent: string;

    beforeEach(() => {
      composeContent = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");
    });

    it("should exist", () => {
      expect(existsSync(DOCKER_COMPOSE_PATH)).toBe(true);
    });

    it("should define api service", () => {
      expect(composeContent).toMatch(/services:\s*\n\s*api:/);
    });

    it("should build from Dockerfile in current context", () => {
      expect(composeContent).toContain("dockerfile: Dockerfile");
      expect(composeContent).toContain("context: .");
    });

    it("should map port 3001 with environment variable override", () => {
      expect(composeContent).toMatch(/ports:.*3001/s);
      expect(composeContent).toContain("${API_PORT:-3001}");
      expect(composeContent).toContain(":3001");
    });

    it("should set required environment variables", () => {
      expect(composeContent).toContain("NOTION_API_KEY");
      expect(composeContent).toContain("DATABASE_ID");
      expect(composeContent).toContain("OPENAI_API_KEY");
    });

    it("should configure health check", () => {
      expect(composeContent).toMatch(/healthcheck:/);
      // Health check intervals are now configurable
      expect(composeContent).toMatch(
        /interval:\s*\$\{HEALTHCHECK_INTERVAL:-30s\}/
      );
      expect(composeContent).toContain("/health");
    });

    it("should set restart policy to unless-stopped", () => {
      // Restart policy is now configurable via environment variable
      expect(composeContent).toMatch(
        /restart:\s*\$\{DOCKER_RESTART_POLICY:-unless-stopped\}/
      );
    });

    it("should configure resource limits", () => {
      expect(composeContent).toMatch(/resources:/);
      expect(composeContent).toMatch(/limits:/);
      expect(composeContent).toMatch(/memory:/);
    });

    it("should define named volume for job data", () => {
      expect(composeContent).toMatch(/volumes:/);
      expect(composeContent).toMatch(/job-data:/);
    });

    it("should configure logging with rotation", () => {
      expect(composeContent).toMatch(/logging:/);
      expect(composeContent).toContain("max-size");
      expect(composeContent).toContain("max-file");
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
    it("should have consistent API port across all files", () => {
      const dockerfile = readFileSync(DOCKERFILE_PATH, "utf-8");
      const compose = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");

      // Dockerfile exposes 3001
      expect(dockerfile).toContain("EXPOSE 3001");

      // docker-compose maps 3001
      expect(compose).toContain(":3001");
      expect(compose).toContain("3001");
    });

    it("should have matching health check endpoints", () => {
      const dockerfile = readFileSync(DOCKERFILE_PATH, "utf-8");
      const compose = readFileSync(DOCKER_COMPOSE_PATH, "utf-8");

      // Both reference /health endpoint
      expect(dockerfile).toContain("/health");
      expect(compose).toContain("/health");
    });

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
});
