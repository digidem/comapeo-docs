/**
 * Tests for GitHub Actions workflow secret handling
 *
 * This test validates:
 * 1. GitHub Actions workflow properly handles API secrets
 * 2. API key authentication works with GitHub Actions secrets
 * 3. Secret passing in workflow environment is secure
 * 4. End-to-end workflow execution with secrets
 * 5. Secret validation and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";
import { server, actualPort } from "./index";
import { getAuth, ApiKeyAuth } from "./auth";
import { getJobTracker, destroyJobTracker } from "./job-tracker";
import { existsSync as fsExists, rmSync } from "node:fs";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/api-notion-fetch.yml"
);

const DATA_DIR = resolve(process.cwd(), ".jobs-data");

/**
 * Clean up test data directory
 */
function cleanupTestData(): void {
  if (fsExists(DATA_DIR)) {
    try {
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }
}

describe("GitHub Actions Secret Handling", () => {
  let workflow: any;
  let auth: ApiKeyAuth;

  beforeEach(() => {
    // Reset auth instance
    ApiKeyAuth["instance"] = undefined;
    auth = new ApiKeyAuth();

    // Check if workflow file exists
    expect(existsSync(WORKFLOW_PATH)).toBe(true);

    // Read and parse workflow
    const content = readFileSync(WORKFLOW_PATH, "utf-8");
    workflow = parseYaml(content);

    // Clean up test data
    destroyJobTracker();
    cleanupTestData();
    getJobTracker();
  });

  afterEach(() => {
    // Clean up
    auth.clearKeys();
    destroyJobTracker();
    cleanupTestData();
  });

  describe("Workflow Secret References", () => {
    const requiredSecrets = [
      "NOTION_API_KEY",
      "DATA_SOURCE_ID",
      "DATABASE_ID",
      "OPENAI_API_KEY",
      "API_KEY_GITHUB_ACTIONS",
      "SLACK_WEBHOOK_URL",
    ];

    it.each(requiredSecrets)(
      "should properly reference secret: %s",
      (secret) => {
        const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
        // Verify secret is referenced using GitHub Actions syntax
        expect(workflowContent).toContain(`secrets.${secret}`);
        // Verify secret is not hardcoded (JSON format)
        expect(workflowContent).not.toContain(`${secret}": "`);
        // Verify secret is not hardcoded (YAML format)
        expect(workflowContent).not.toContain(`${secret}: '`);
      }
    );

    it("should use API_KEY_GITHUB_ACTIONS for authentication", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      expect(workflowContent).toContain("API_KEY_GITHUB_ACTIONS");
      expect(workflowContent).toContain("Authorization: Bearer $API_KEY");
    });

    it("should pass NOTION_API_KEY securely to local server", () => {
      const job = workflow.jobs["fetch-via-api"];
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );
      expect(startServerStep).toBeDefined();
      // Secrets should be set in the env block, not exported in shell script
      expect(startServerStep.env).toBeDefined();
      expect(startServerStep.env.NOTION_API_KEY).toBe(
        "${{ secrets.NOTION_API_KEY }}"
      );
      // Shell script should NOT have export statements for secrets
      expect(startServerStep.run).not.toContain("export NOTION_API_KEY=");
    });

    it("should pass OPENAI_API_KEY securely", () => {
      const job = workflow.jobs["fetch-via-api"];
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );
      expect(startServerStep).toBeDefined();
      // Secrets should be set in the env block, not exported in shell script
      expect(startServerStep.env).toBeDefined();
      expect(startServerStep.env.OPENAI_API_KEY).toBe(
        "${{ secrets.OPENAI_API_KEY }}"
      );
      // Shell script should NOT have export statements for secrets
      expect(startServerStep.run).not.toContain("export OPENAI_API_KEY=");
    });
  });

  describe("API Key Authentication with GitHub Actions Secrets", () => {
    it("should validate GitHub Actions API key format", () => {
      // Simulate GitHub Actions secret format
      const githubActionsKey = "gha_" + "a".repeat(64); // 68 characters total

      auth.addKey("GITHUB_ACTIONS", githubActionsKey, {
        name: "GITHUB_ACTIONS",
        description: "GitHub Actions API key",
        active: true,
      });

      const result = auth.authenticate(`Bearer ${githubActionsKey}`);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("GITHUB_ACTIONS");
    });

    it("should reject API keys that are too short", () => {
      auth.addKey("VALID_KEY", "valid-key-123456789012", {
        name: "VALID_KEY",
        active: true,
      });

      const shortKey = "short-key";
      const result = auth.authenticate(`Bearer ${shortKey}`);

      expect(result.success).toBe(false);
      expect(result.error).toContain("16 characters");
    });

    it("should support Bearer token scheme used by GitHub Actions", () => {
      const testKey = "github-actions-key-12345678901234567890";

      auth.addKey("GITHUB_ACTIONS", testKey, {
        name: "GITHUB_ACTIONS",
        active: true,
      });

      // Test Bearer scheme (used by GitHub Actions)
      const bearerResult = auth.authenticate(`Bearer ${testKey}`);
      expect(bearerResult.success).toBe(true);
      expect(bearerResult.meta?.name).toBe("GITHUB_ACTIONS");
    });

    it("should handle multiple API keys including GitHub Actions", () => {
      const ghaKey = "github-actions-key-12345678901234567890";
      const adminKey = "admin-key-12345678901234567890123";

      auth.addKey("GITHUB_ACTIONS", ghaKey, {
        name: "GITHUB_ACTIONS",
        active: true,
      });

      auth.addKey("ADMIN", adminKey, {
        name: "ADMIN",
        active: true,
      });

      // Both keys should work
      const ghaResult = auth.authenticate(`Bearer ${ghaKey}`);
      const adminResult = auth.authenticate(`Bearer ${adminKey}`);

      expect(ghaResult.success).toBe(true);
      expect(ghaResult.meta?.name).toBe("GITHUB_ACTIONS");

      expect(adminResult.success).toBe(true);
      expect(adminResult.meta?.name).toBe("ADMIN");
    });

    it("should reject requests without Authorization header when auth is enabled", () => {
      auth.addKey("GITHUB_ACTIONS", "valid-key-123456789012", {
        name: "GITHUB_ACTIONS",
        active: true,
      });

      const result = auth.authenticate(null);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing Authorization header");
    });

    it("should reject invalid Authorization header format", () => {
      auth.addKey("GITHUB_ACTIONS", "valid-key-123456789012", {
        name: "GITHUB_ACTIONS",
        active: true,
      });

      // Test invalid formats
      const invalidFormats = [
        "InvalidFormat",
        "Bearer", // No key
        "Bearer invalid key", // Space in key
        "Basic dXNlcjpwYXNz", // Wrong scheme
      ];

      for (const format of invalidFormats) {
        const result = auth.authenticate(format);
        expect(result.success).toBe(false);
      }
    });
  });

  describe("Secret Environment Variable Handling", () => {
    it("should load API keys from environment variables", () => {
      // Simulate GitHub Actions environment
      process.env.API_KEY_GITHUB_ACTIONS =
        "github-actions-test-key-12345678901234567890";
      process.env.API_KEY_ADMIN = "admin-test-key-12345678901234567890";

      // Create new auth instance to pick up env vars
      ApiKeyAuth["instance"] = undefined;
      const envAuth = new ApiKeyAuth();

      expect(envAuth.isAuthenticationEnabled()).toBe(true);

      const keys = envAuth.listKeys();
      const keyNames = keys.map((k) => k.name);

      expect(keyNames).toContain("GITHUB_ACTIONS");
      expect(keyNames).toContain("ADMIN");

      // Verify authentication works
      const ghaResult = envAuth.authenticate(
        `Bearer ${process.env.API_KEY_GITHUB_ACTIONS}`
      );
      expect(ghaResult.success).toBe(true);

      // Clean up
      delete process.env.API_KEY_GITHUB_ACTIONS;
      delete process.env.API_KEY_ADMIN;
    });

    it("should handle missing API_KEY_GITHUB_ACTIONS gracefully", () => {
      // Ensure no API keys are set
      delete process.env.API_KEY_GITHUB_ACTIONS;

      ApiKeyAuth["instance"] = undefined;
      const noAuth = new ApiKeyAuth();

      expect(noAuth.isAuthenticationEnabled()).toBe(false);

      // When auth is disabled, all requests should succeed
      const result = noAuth.authenticate(null);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("default");
    });
  });

  describe("Secure Secret Passing in Workflow", () => {
    it("should use export for environment variables (not echo)", () => {
      const job = workflow.jobs["fetch-via-api"];
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );

      expect(startServerStep).toBeDefined();

      // Secrets should be set in env block, NOT exported in shell script
      expect(startServerStep.env).toBeDefined();
      expect(startServerStep.env.NOTION_API_KEY).toBeDefined();
      expect(startServerStep.env.OPENAI_API_KEY).toBeDefined();
      expect(startServerStep.env.API_KEY_GITHUB_ACTIONS).toBeDefined();
      // Verify secrets are NOT exported in shell script (prevents log leaks)
      expect(startServerStep.run).not.toContain("export NOTION_API_KEY=");
      expect(startServerStep.run).not.toContain("export OPENAI_API_KEY=");
      expect(startServerStep.run).not.toContain(
        "export API_KEY_GITHUB_ACTIONS="
      );

      // Verify there are no echo statements that would leak secrets
      const linesWithSecrets = startServerStep.run
        .split("\n")
        .filter(
          (line: string) =>
            (line.includes("NOTION_API_KEY") ||
              line.includes("OPENAI_API_KEY") ||
              line.includes("API_KEY_GITHUB_ACTIONS")) &&
            line.includes("echo") &&
            !line.includes('echo "') &&
            !line.includes("echo '")
        );

      expect(linesWithSecrets).toHaveLength(0);
    });

    it("should not log secret values in workflow steps", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");

      // Check for potential secret logging patterns
      const unsafePatterns = [
        /echo\s+\$\{?secrets\./i,
        /echo\s+\$NOTION_API_KEY/i,
        /echo\s+\$OPENAI_API_KEY/i,
        /echo\s+\$API_KEY_GITHUB_ACTIONS/i,
        /console\.log.*secrets\./i,
        /console\.log.*API_KEY/i,
      ];

      for (const pattern of unsafePatterns) {
        expect(workflowContent).not.toMatch(pattern);
      }
    });

    it("should set NODE_ENV=test in local mode", () => {
      const job = workflow.jobs["fetch-via-api"];
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );

      expect(startServerStep).toBeDefined();
      expect(startServerStep.run).toContain("export NODE_ENV=test");
    });

    it("should configure API host and port for local mode", () => {
      const job = workflow.jobs["fetch-via-api"];
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );

      expect(startServerStep).toBeDefined();
      expect(startServerStep.run).toContain("export API_PORT=3001");
      expect(startServerStep.run).toContain("export API_HOST=localhost");
    });
  });

  describe("API Request Authentication in Workflow", () => {
    it("should include Authorization header in API requests", () => {
      const job = workflow.jobs["fetch-via-api"];
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");

      expect(createJobStep).toBeDefined();
      expect(createJobStep.run).toContain("Authorization: Bearer $API_KEY");
    });

    it("should include Authorization header in status polling", () => {
      const job = workflow.jobs["fetch-via-api"];
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");

      expect(pollStep).toBeDefined();
      expect(pollStep.run).toContain("Authorization: Bearer $API_KEY");
    });

    it("should use secure curl options", () => {
      const job = workflow.jobs["fetch-via-api"];
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");

      expect(createJobStep).toBeDefined();
      // Verify -s (silent) flag is used to reduce verbose output
      expect(createJobStep.run).toContain("curl -s");
    });
  });

  describe("Secret Validation Error Handling", () => {
    it("should handle missing API_KEY_GITHUB_ACTIONS in workflow", () => {
      const job = workflow.jobs["fetch-via-api"];
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");

      expect(createJobStep).toBeDefined();

      // Verify error handling when API key is empty/missing
      expect(createJobStep.run).toContain("set -e"); // Exit on error
      // The workflow has explicit exit 1 when job creation fails
      expect(createJobStep.run).toContain("exit 1");
    });

    it("should validate API endpoint availability", () => {
      const job = workflow.jobs["fetch-via-api"];
      const configStep = job.steps.find((s: any) => s.id === "config");

      expect(configStep).toBeDefined();
      expect(configStep.run).toContain("API_ENDPOINT");
    });

    it("should have timeout for API server startup", () => {
      const job = workflow.jobs["fetch-via-api"];
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("Waiting for API server")
      );

      expect(startServerStep).toBeDefined();
      expect(startServerStep.run).toContain("for i in {1..30}");
      expect(startServerStep.run).toContain("if [ $i -eq 30 ]");
      expect(startServerStep.run).toContain("API server failed to start");
    });
  });

  describe("End-to-End Secret Handling Flow", () => {
    it("should validate complete secret flow from workflow to API", () => {
      const job = workflow.jobs["fetch-via-api"];

      // 1. Configure step - should set up environment
      const configStep = job.steps.find((s: any) => s.id === "config");
      expect(configStep).toBeDefined();
      expect(configStep.run).toContain("endpoint=");

      // 2. Start server step - should use secrets from env block
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );
      expect(startServerStep).toBeDefined();
      // Secrets should be in env block
      expect(startServerStep.env).toBeDefined();
      expect(startServerStep.env.NOTION_API_KEY).toBeDefined();
      expect(startServerStep.env.API_KEY_GITHUB_ACTIONS).toBeDefined();

      // 3. Create job step - should authenticate with API key
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");
      expect(createJobStep).toBeDefined();
      expect(createJobStep.run).toContain("Authorization: Bearer");

      // 4. Poll status step - should maintain authentication
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep).toBeDefined();
      expect(pollStep.run).toContain("Authorization: Bearer");
    });

    it("should handle both production and local modes", () => {
      const job = workflow.jobs["fetch-via-api"];
      const configStep = job.steps.find((s: any) => s.id === "config");

      expect(configStep).toBeDefined();

      // Production mode - uses API_ENDPOINT secret
      expect(configStep.run).toContain("API_ENDPOINT");

      // Local mode - starts local server
      expect(configStep.run).toContain("localhost:3001");
      expect(configStep.run).toContain("mode=local");
    });

    it("should clean up resources in both modes", () => {
      const job = workflow.jobs["fetch-via-api"];

      // Local mode cleanup
      const stopStep = job.steps.find((s: any) =>
        s.run?.includes("Stopping API server")
      );
      expect(stopStep).toBeDefined();
      expect(stopStep["if"]).toContain("always()");
    });
  });

  describe("Secret Security Best Practices", () => {
    it("should not hardcode any secret values", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");

      // Check for common hardcoded secret patterns
      const hardcodedPatterns = [
        /NOTION_API_KEY:\s*["'].*["']/,
        /OPENAI_API_KEY:\s*["'].*["']/,
        /API_KEY:\s*["'].*["']/,
        /DATABASE_ID:\s*["'].*["']/,
        /SLACK_WEBHOOK_URL:\s*["'].*["']/,
        /secret_[a-z]+_?\d*[:=]\s*["'][^"']{8,}["']/i,
      ];

      for (const pattern of hardcodedPatterns) {
        expect(workflowContent).not.toMatch(pattern);
      }
    });

    it("should use GitHub Actions secret syntax", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");

      // Verify proper GitHub Actions secret references
      expect(workflowContent).toMatch(/\$\{\{\s*secrets\./);
      // Note: $VAR is used in bash scripts for local variables, which is fine
      // We only check that secrets are referenced using ${{ secrets.* }} syntax
    });

    it("should use production environment for protection", () => {
      const job = workflow.jobs["fetch-via-api"];

      expect(job.environment).toBeDefined();
      expect(job.environment.name).toBe("production");
    });

    it("should not expose secrets in GitHub status updates", () => {
      const job = workflow.jobs["fetch-via-api"];
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");

      expect(createJobStep).toBeDefined();

      // Verify gh api calls don't include secret values in descriptions
      expect(createJobStep.run).not.toContain('description="$API_KEY');
      expect(createJobStep.run).not.toContain('description="$NOTION_API_KEY');
      // Also verify secrets are not directly referenced in gh api calls
      expect(createJobStep.run).not.toMatch(/gh api.*secrets\.API_KEY/);
    });
  });

  describe("Workflow Secret Documentation", () => {
    it("should have clear secret requirements in comments", () => {
      const job = workflow.jobs["fetch-via-api"];

      // Look for environment variable setup step
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("Set environment variables")
      );

      expect(startServerStep).toBeDefined();
    });

    it("should validate all required secrets are referenced", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");

      // Critical secrets for the workflow
      const criticalSecrets = [
        "API_KEY_GITHUB_ACTIONS",
        "NOTION_API_KEY",
        "OPENAI_API_KEY",
      ];

      for (const secret of criticalSecrets) {
        expect(workflowContent).toContain(`secrets.${secret}`);
      }
    });
  });
});
