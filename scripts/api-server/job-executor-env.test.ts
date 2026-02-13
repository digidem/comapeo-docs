/**
 * Environment Variable Propagation Tests
 *
 * Tests for verifying that the CHILD_ENV_WHITELIST correctly:
 * 1. Allows required environment variables to reach child processes
 * 2. Blocks sensitive and unnecessary environment variables
 * 3. Maintains parity across CI and local execution paths
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Import the constants and functions we need to test
import { CHILD_ENV_WHITELIST, buildChildEnv } from "./job-executor";

describe("Environment Variable Whitelist", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("whitelist composition", () => {
    it("should contain all required Notion API configuration variables", () => {
      expect(CHILD_ENV_WHITELIST).toContain("NOTION_API_KEY");
      expect(CHILD_ENV_WHITELIST).toContain("DATABASE_ID");
      expect(CHILD_ENV_WHITELIST).toContain("NOTION_DATABASE_ID");
      expect(CHILD_ENV_WHITELIST).toContain("DATA_SOURCE_ID");
    });

    it("should contain all required OpenAI configuration variables", () => {
      expect(CHILD_ENV_WHITELIST).toContain("OPENAI_API_KEY");
      expect(CHILD_ENV_WHITELIST).toContain("OPENAI_MODEL");
    });

    it("should contain application configuration variables", () => {
      expect(CHILD_ENV_WHITELIST).toContain("DEFAULT_DOCS_PAGE");
      expect(CHILD_ENV_WHITELIST).toContain("BASE_URL");
      expect(CHILD_ENV_WHITELIST).toContain("NODE_ENV");
    });

    it("should contain debug and performance telemetry variables", () => {
      expect(CHILD_ENV_WHITELIST).toContain("DEBUG");
      expect(CHILD_ENV_WHITELIST).toContain("NOTION_PERF_LOG");
      expect(CHILD_ENV_WHITELIST).toContain("NOTION_PERF_OUTPUT");
    });

    it("should contain runtime resolution variables", () => {
      expect(CHILD_ENV_WHITELIST).toContain("PATH");
      expect(CHILD_ENV_WHITELIST).toContain("HOME");
      expect(CHILD_ENV_WHITELIST).toContain("BUN_INSTALL");
    });

    it("should contain locale configuration variables", () => {
      expect(CHILD_ENV_WHITELIST).toContain("LANG");
      expect(CHILD_ENV_WHITELIST).toContain("LC_ALL");
    });

    it("should NOT contain sensitive variables like GITHUB_TOKEN", () => {
      expect(CHILD_ENV_WHITELIST).not.toContain("GITHUB_TOKEN");
      expect(CHILD_ENV_WHITELIST).not.toContain("API_KEY_*");
    });

    it("should NOT contain generic API_KEY_* patterns", () => {
      // Check that no whitelisted vars start with "API_KEY_" except specific exceptions
      const hasGenericApiKey = (CHILD_ENV_WHITELIST as readonly string[]).some(
        (varName) =>
          varName.startsWith("API_KEY_") && varName !== "OPENAI_API_KEY"
      );
      expect(hasGenericApiKey).toBe(false);
    });
  });

  describe("buildChildEnv function", () => {
    it("should include whitelisted variables that are set in parent process", () => {
      // Set up test environment variables
      process.env.NOTION_API_KEY = "test-notion-key";
      process.env.DATABASE_ID = "test-db-id";
      process.env.OPENAI_API_KEY = "test-openai-key";
      process.env.NODE_ENV = "test";
      process.env.DEBUG = "1";

      const childEnv = buildChildEnv();

      expect(childEnv.NOTION_API_KEY).toBe("test-notion-key");
      expect(childEnv.DATABASE_ID).toBe("test-db-id");
      expect(childEnv.OPENAI_API_KEY).toBe("test-openai-key");
      expect(childEnv.NODE_ENV).toBe("test");
      expect(childEnv.DEBUG).toBe("1");
    });

    it("should NOT include non-whitelisted variables even if set in parent process", () => {
      // Set up whitelisted and non-whitelisted variables
      process.env.NOTION_API_KEY = "test-notion-key";
      process.env.GITHUB_TOKEN = "test-github-token";
      process.env.API_KEY_SECRET = "test-secret";
      process.env.RANDOM_VAR = "random-value";

      const childEnv = buildChildEnv();

      // Whitelisted var should be included
      expect(childEnv.NOTION_API_KEY).toBe("test-notion-key");

      // Non-whitelisted vars should NOT be included
      expect(childEnv.GITHUB_TOKEN).toBeUndefined();
      expect(childEnv.API_KEY_SECRET).toBeUndefined();
      expect(childEnv.RANDOM_VAR).toBeUndefined();
    });

    it("should handle undefined whitelisted variables gracefully", () => {
      // Clear some environment variables that might be set
      delete process.env.NOTION_API_KEY;
      delete process.env.DATABASE_ID;

      const childEnv = buildChildEnv();

      // Undefined vars should not appear in child env
      expect(childEnv.NOTION_API_KEY).toBeUndefined();
      expect(childEnv.DATABASE_ID).toBeUndefined();

      // But the function should still work without errors
      expect(childEnv).toBeDefined();
      expect(typeof childEnv).toBe("object");
    });

    it("should preserve PATH for runtime resolution", () => {
      const testPath = "/usr/local/bin:/usr/bin:/bin";
      process.env.PATH = testPath;

      const childEnv = buildChildEnv();

      expect(childEnv.PATH).toBe(testPath);
    });

    it("should preserve HOME for runtime resolution", () => {
      const testHome = "/home/testuser";
      process.env.HOME = testHome;

      const childEnv = buildChildEnv();

      expect(childEnv.HOME).toBe(testHome);
    });

    it("should preserve locale variables", () => {
      process.env.LANG = "en_US.UTF-8";
      process.env.LC_ALL = "en_US.UTF-8";

      const childEnv = buildChildEnv();

      expect(childEnv.LANG).toBe("en_US.UTF-8");
      expect(childEnv.LC_ALL).toBe("en_US.UTF-8");
    });

    it("should include debug and performance telemetry variables when set", () => {
      process.env.DEBUG = "notion:*";
      process.env.NOTION_PERF_LOG = "1";
      process.env.NOTION_PERF_OUTPUT = "/tmp/perf.json";

      const childEnv = buildChildEnv();

      expect(childEnv.DEBUG).toBe("notion:*");
      expect(childEnv.NOTION_PERF_LOG).toBe("1");
      expect(childEnv.NOTION_PERF_OUTPUT).toBe("/tmp/perf.json");
    });

    it("should include BASE_URL for production asset path configuration", () => {
      process.env.BASE_URL = "/comapeo-docs/";

      const childEnv = buildChildEnv();

      expect(childEnv.BASE_URL).toBe("/comapeo-docs/");
    });
  });

  describe("CI/Local parity", () => {
    it("should allow variables needed for both CI and local execution", () => {
      // Simulate a typical CI environment with all required vars
      process.env.NOTION_API_KEY = "ci-notion-key";
      process.env.DATABASE_ID = "ci-db-id";
      process.env.OPENAI_API_KEY = "ci-openai-key";
      process.env.NODE_ENV = "production";
      process.env.PATH = "/usr/local/bin:/usr/bin:/bin";
      process.env.HOME = "/home/ci-user";
      process.env.LANG = "en_US.UTF-8";

      // Simulate CI-specific vars that should be blocked
      process.env.CI = "true";
      process.env.GITHUB_ACTIONS = "true";
      process.env.GITHUB_TOKEN = "ghp_ci_token";

      const childEnv = buildChildEnv();

      // Required vars should be present
      expect(childEnv.NOTION_API_KEY).toBe("ci-notion-key");
      expect(childEnv.DATABASE_ID).toBe("ci-db-id");
      expect(childEnv.OPENAI_API_KEY).toBe("ci-openai-key");
      expect(childEnv.NODE_ENV).toBe("production");

      // CI-specific vars should NOT be present (security)
      expect(childEnv.CI).toBeUndefined();
      expect(childEnv.GITHUB_ACTIONS).toBeUndefined();
      expect(childEnv.GITHUB_TOKEN).toBeUndefined();
    });

    it("should work correctly in local development environment", () => {
      // Simulate local development environment
      process.env.NOTION_API_KEY = "local-notion-key";
      process.env.DATABASE_ID = "local-db-id";
      process.env.OPENAI_API_KEY = "local-openai-key";
      process.env.NODE_ENV = "development";
      process.env.DEBUG = "notion:*";
      process.env.PATH = "/usr/local/bin:/usr/bin:/bin";
      process.env.HOME = "/home/developer";
      process.env.BUN_INSTALL = "/opt/bun";

      const childEnv = buildChildEnv();

      // All required vars should be present
      expect(childEnv.NOTION_API_KEY).toBe("local-notion-key");
      expect(childEnv.DATABASE_ID).toBe("local-db-id");
      expect(childEnv.OPENAI_API_KEY).toBe("local-openai-key");
      expect(childEnv.NODE_ENV).toBe("development");
      expect(childEnv.DEBUG).toBe("notion:*");
      expect(childEnv.BUN_INSTALL).toBe("/opt/bun");
    });
  });

  describe("security boundaries", () => {
    it("should explicitly block common sensitive variables", () => {
      // Set up sensitive vars
      process.env.GITHUB_TOKEN = "secret-github-token";
      process.env.API_KEY_SECRET = "secret-api-key";
      process.env.AWS_SECRET_ACCESS_KEY = "secret-aws-key";
      process.env.DATABASE_PASSWORD = "secret-db-password";

      // Set up a whitelisted var for comparison
      process.env.NOTION_API_KEY = "allowed-notion-key";

      const childEnv = buildChildEnv();

      // Sensitive vars should NOT leak
      expect(childEnv.GITHUB_TOKEN).toBeUndefined();
      expect(childEnv.API_KEY_SECRET).toBeUndefined();
      expect(childEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(childEnv.DATABASE_PASSWORD).toBeUndefined();

      // But whitelisted vars should still work
      expect(childEnv.NOTION_API_KEY).toBe("allowed-notion-key");
    });

    it("should not include variables with sensitive patterns", () => {
      // Set up vars with sensitive patterns
      process.env.SECRET_KEY = "secret";
      process.env.PRIVATE_KEY = "private";
      process.env.PASSWORD = "password";
      process.env.TOKEN = "token";

      const childEnv = buildChildEnv();

      // None of these should be in child env unless explicitly whitelisted
      expect(childEnv.SECRET_KEY).toBeUndefined();
      expect(childEnv.PRIVATE_KEY).toBeUndefined();
      expect(childEnv.PASSWORD).toBeUndefined();
      expect(childEnv.TOKEN).toBeUndefined();
    });
  });
});
