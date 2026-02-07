/**
 * Tests for Docker configuration files
 * Validates Dockerfile syntax, docker-compose configuration, and .dockerignore patterns
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
      expect(dockerfileContent).toContain("ENV NODE_ENV=production");
    });

    it("should run API server as CMD", () => {
      expect(dockerfileContent).toContain("CMD");
      expect(dockerfileContent).toContain("api:server");
    });

    it("should use multi-stage build for optimization", () => {
      expect(dockerfileContent).toMatch(
        /FROM\s+.*\s+AS\s+(deps|builder|runner)/
      );
      expect(dockerfileContent).toContain("COPY --from");
    });

    it("should install dependencies before copying source code", () => {
      const lines = dockerfileContent.split("\n");
      const copyPackageIndex = lines.findIndex((line) =>
        line.includes("COPY package.json")
      );
      const copySourceIndex = lines.findIndex(
        (line) => line.includes("COPY . .") && !line.includes("#")
      );

      expect(copyPackageIndex).toBeGreaterThanOrEqual(0);
      expect(copySourceIndex).toBeGreaterThan(copyPackageIndex);
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
      expect(composeContent).toContain("interval: 30s");
      expect(composeContent).toContain("/health");
    });

    it("should set restart policy to unless-stopped", () => {
      expect(composeContent).toContain("restart: unless-stopped");
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
      expect(dockerignoreLines).toContain(".git");
    });

    it("should exclude IDE directories", () => {
      expect(dockerignoreLines).toContain(".vscode");
      expect(dockerignoreLines).toContain(".idea");
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
  });
});
