/**
 * Tests for Docker Hub Authentication Patterns documentation
 *
 * Validates that the documentation examples:
 * - Use proper authentication patterns (access tokens, not passwords)
 * - Follow security best practices (fork protection, version pinning)
 * - Use correct secret naming conventions
 * - Include proper GitHub Actions permissions
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const DOC_PATH = join(
  PROJECT_ROOT,
  ".prd/feat/notion-api-service/DOCKER_HUB_AUTH_PATTERNS.md"
);

describe("Docker Hub Authentication Patterns Documentation", () => {
  let docContent: string;
  let yamlExamples: string[];

  beforeAll(() => {
    docContent = readFileSync(DOC_PATH, "utf-8");
    // Extract YAML code blocks from markdown
    yamlExamples = docContent.match(/```yaml\n([\s\S]*?)```/g) || [];
  });

  describe("Documentation Structure", () => {
    it("should contain required sections", () => {
      expect(docContent).toContain("## Authentication Pattern");
      expect(docContent).toContain("## Required Secrets");
      expect(docContent).toContain("## Security Best Practices");
      expect(docContent).toContain("## Complete Workflow Example");
      expect(docContent).toContain("## Troubleshooting");
    });

    it("should document access token usage (not passwords)", () => {
      expect(docContent).toContain("Access Token");
      expect(docContent).toMatch(/access token/i);
    });

    it("should include secret naming patterns section", () => {
      expect(docContent).toContain("## Alternative Secret Naming Patterns");
    });
  });

  describe("Authentication Pattern Validation", () => {
    it("should recommend docker/login-action@v3.3.0", () => {
      expect(docContent).toContain("docker/login-action@v3.3.0");
    });

    it("should show DOCKER_USERNAME and DOCKER_PASSWORD secrets", () => {
      expect(docContent).toMatch(/DOCKER_USERNAME/);
      expect(docContent).toMatch(/DOCKER_PASSWORD/);
    });

    it("should include fork protection pattern", () => {
      // Check for fork protection condition
      expect(docContent).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository"
      );
      expect(docContent).toContain("github.event_name != 'pull_request'");
    });
  });

  describe("Security Best Practices", () => {
    it("should warn against using account passwords", () => {
      expect(docContent).toMatch(/not.*password/i);
      expect(docContent).toContain("Use Access Tokens, Not Passwords");
    });

    it("should recommend version pinning", () => {
      expect(docContent).toContain("Version Pinning");
      expect(docContent).toContain("@v3.3.0");
    });

    it("should document token scope limitations", () => {
      expect(docContent).toContain("Scope Limitations");
      expect(docContent).toContain("Read");
      expect(docContent).toContain("Write");
      expect(docContent).toContain("Delete");
    });

    it("should include GitHub Actions permissions section", () => {
      expect(docContent).toContain("## GitHub Actions Permissions");
      expect(docContent).toContain("permissions:");
      expect(docContent).toContain("contents: read");
      expect(docContent).toContain("pull-requests: write");
    });
  });

  describe("YAML Example Validation", () => {
    it("should have at least 5 complete workflow examples", () => {
      expect(yamlExamples.length).toBeGreaterThanOrEqual(5);
    });

    it("should use pinned action versions in examples", () => {
      const unpinnedActions = yamlExamples.filter(
        (example) => example.match(/uses:.*@v\d+$/) !== null
      );
      // All examples should use pinned versions
      expect(unpinnedActions.length).toBe(0);
    });

    it("should include docker/login-action in authentication examples", () => {
      const hasLoginAction = yamlExamples.some((example) =>
        example.includes("docker/login-action")
      );
      expect(hasLoginAction).toBe(true);
    });

    it("should show multi-platform build examples", () => {
      const hasMultiPlatform = yamlExamples.some(
        (example) =>
          example.includes("linux/amd64") || example.includes("linux/arm64")
      );
      expect(hasMultiPlatform).toBe(true);
    });
  });

  describe("Secret Naming Convention", () => {
    it("should document both common naming patterns", () => {
      expect(docContent).toContain("DOCKER_USERNAME");
      expect(docContent).toContain("DOCKERHUB_USERNAME");
    });

    it("should indicate which pattern the project uses", () => {
      expect(docContent).toContain("Pattern A");
      expect(docContent).toContain("Pattern B");
      expect(docContent).toContain("This project uses");
    });

    it("should show consistent naming examples", () => {
      expect(docContent).toContain("## Secret Naming Best Practices");
    });
  });

  describe("Troubleshooting Section", () => {
    it("should include common authentication errors", () => {
      expect(docContent).toContain("## Common Errors");
      expect(docContent).toContain("unauthorized: authentication required");
      expect(docContent).toContain(
        "denied: requested access to the resource is denied"
      );
    });

    it("should provide debugging steps", () => {
      expect(docContent).toContain("## Debugging Steps");
    });
  });

  describe("Repository Configuration", () => {
    it("should document the project's Docker Hub repository", () => {
      expect(docContent).toContain("## Repository Configuration");
      expect(docContent).toContain("comapeo-docs");
    });

    it("should include platform targets", () => {
      expect(docContent).toContain("linux/amd64");
      expect(docContent).toContain("linux/arm64");
    });

    it("should list access token scopes", () => {
      expect(docContent).toContain("Access Token Scope");
    });
  });

  describe("Implementation Status", () => {
    it("should include an implementation status checklist", () => {
      expect(docContent).toContain("## Implementation Status");
    });

    it("should mark research and documentation as completed", () => {
      expect(docContent).toContain("- [x] Research completed");
      expect(docContent).toContain("- [x] Documentation created");
    });
  });

  describe("Use Case Patterns", () => {
    it("should include CI build only pattern", () => {
      expect(docContent).toContain("## 1. CI Build Only (No Push)");
    });

    it("should include main branch push pattern", () => {
      expect(docContent).toContain("## 2. Build and Push to Main Branch");
    });

    it("should include tagged releases pattern", () => {
      expect(docContent).toContain("## 3. Tagged Releases");
    });

    it("should include PR preview builds pattern", () => {
      expect(docContent).toContain("## 4. PR Preview Builds");
    });
  });

  describe("References Section", () => {
    it("should include relevant documentation links", () => {
      expect(docContent).toContain("## References");
      expect(docContent).toContain("docker/login-action");
      expect(docContent).toContain("Docker Hub Access Tokens");
    });
  });
});
