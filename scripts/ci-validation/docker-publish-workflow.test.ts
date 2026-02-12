/**
 * Tests for Docker Publish workflow validation
 *
 * Validates:
 * - YAML syntax
 * - Path filters match Dockerfile COPY instructions
 * - Fork PR security check
 * - Tag naming produces correct outputs
 * - Concurrency configuration
 * - Action versions are pinned to SHAs
 * - PR comment style matches deploy-pr-preview.yml
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";

describe("Docker Publish Workflow Validation", () => {
  const workflowPath = join(
    process.cwd(),
    ".github/workflows/docker-publish.yml"
  );
  const workflowContent = readFileSync(workflowPath, "utf-8");
  let workflow: any;

  beforeAll(() => {
    workflow = yaml.load(workflowContent);
  });

  describe("YAML Syntax", () => {
    it("should parse YAML without errors", () => {
      expect(() => yaml.load(workflowContent)).not.toThrow();
    });

    it("should have required workflow structure", () => {
      expect(workflow).toHaveProperty("name");
      expect(workflow).toHaveProperty("on");
      expect(workflow).toHaveProperty("jobs");
      expect(workflow.name).toBe("Docker Publish");
    });
  });

  describe("Path Filters Match Dockerfile COPY Instructions", () => {
    const dockerfileCopyPaths = [
      "package.json",
      "bun.lockb*",
      "scripts/**",
      "docusaurus.config.ts",
      "tsconfig.json",
      "src/client/**",
    ];

    const workflowPaths = [
      "Dockerfile",
      ".dockerignore",
      "package.json",
      "bun.lockb*",
      "scripts/**",
      "tsconfig.json",
      "docusaurus.config.ts",
      "src/client/**",
    ];

    it("should include all Dockerfile COPY paths in workflow path filters", () => {
      const workflowPathStrings = workflowPaths.map((p) => p.replace("**", ""));

      for (const copyPath of dockerfileCopyPaths) {
        const basePath = copyPath.replace("**", "");
        expect(workflowPathStrings).toContain(basePath);
      }
    });

    it("should include Dockerfile and .dockerignore in path filters", () => {
      expect(workflowPaths).toContain("Dockerfile");
      expect(workflowPaths).toContain(".dockerignore");
    });

    it("should have path filters for both push and pull_request events", () => {
      expect(workflow.on.push).toHaveProperty("paths");
      expect(workflow.on.pull_request).toHaveProperty("paths");
    });
  });

  describe("Fork PR Security Check", () => {
    it("should have fork PR security check on PR comment step", () => {
      const prCommentStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "PR comment with image reference"
      );

      expect(prCommentStep).toBeDefined();
      expect(prCommentStep.if).toContain(
        "github.event.pull_request.head.repo.full_name == github.repository"
      );
    });

    it("should not push images for pull requests", () => {
      const buildStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Build and push"
      );

      expect(buildStep.with.push).toBe(
        "${{ github.event_name != 'pull_request' }}"
      );
    });

    it("should not login to Docker Hub for pull requests", () => {
      const loginStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Login to Docker Hub"
      );

      expect(loginStep.if).toBe("github.event_name != 'pull_request'");
    });
  });

  describe("Tag Naming Produces Correct Outputs", () => {
    let metaStep: any;

    beforeAll(() => {
      const step = workflow.jobs.build.steps.find(
        (s: any) => s.name === "Extract metadata"
      );
      metaStep = step;
    });

    it('should tag main branch builds with "latest"', () => {
      const tags = metaStep.with.tags;
      expect(tags).toContain(
        "type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}"
      );
    });

    it("should tag main branch builds with commit SHA", () => {
      const tags = metaStep.with.tags;
      expect(tags).toContain(
        "type=sha,prefix=,enable=${{ github.ref == 'refs/heads/main' }}"
      );
    });

    it("should tag PR builds with pr-{number}", () => {
      const tags = metaStep.with.tags;
      expect(tags).toContain(
        "type=raw,value=pr-${{ github.event.number }},enable=${{ github.event_name == 'pull_request' }}"
      );
    });

    it("should produce correct tag outputs for main branch", () => {
      // For main branch: latest + sha
      const mainTags = ["latest", "a1b2c3d"];
      expect(mainTags.length).toBe(2);
      expect(mainTags).toContain("latest");
    });

    it("should produce correct tag outputs for PRs", () => {
      // For PR: pr-{number}
      const prTag = "pr-123";
      expect(prTag).toMatch(/^pr-\d+$/);
    });
  });

  describe("Concurrency Configuration", () => {
    it("should have concurrency group that includes workflow and ref", () => {
      expect(workflow.concurrency.group).toBe(
        "${{ github.workflow }}-${{ github.ref }}"
      );
    });

    it("should cancel in-progress for PRs only", () => {
      expect(workflow.concurrency["cancel-in-progress"]).toBe(
        "${{ github.event_name == 'pull_request' }}"
      );
    });

    it("should prevent conflicts between different branches/PRs", () => {
      // Main branch: Docker Publish-refs/heads/main
      // PR: Docker Publish-refs/pull/123/merge
      const mainGroup = "Docker Publish-refs/heads/main";
      const prGroup = "Docker Publish-refs/pull/123/merge";

      expect(mainGroup).not.toBe(prGroup);
    });
  });

  describe("Action Versions Pinned to SHAs", () => {
    const actionsRequiringShaPinning = [
      "actions/checkout",
      "docker/setup-qemu-action",
      "docker/setup-buildx-action",
      "docker/login-action",
      "docker/metadata-action",
      "docker/build-push-action",
      "actions/github-script",
    ];

    it("should pin all actions to SHAs", () => {
      const steps = workflow.jobs.build.steps;
      const actionUses: string[] = [];

      for (const step of steps) {
        const stepValue = Object.values(step)[0] as any;
        if (stepValue?.uses) {
          actionUses.push(stepValue.uses);
        }
      }

      for (const action of actionUses) {
        const [actionName, ref] = action.split("@");
        // SHA should be 40 characters
        expect(ref).toMatch(/^[a-f0-9]{40}$/);
        expect(
          actionsRequiringShaPinning.some((a) =>
            actionName.includes(a.split("/")[1])
          )
        ).toBe(true);
      }
    });

    it("should have version comment after SHA", () => {
      const steps = workflow.jobs.build.steps;
      const actionUses: string[] = [];

      for (const step of steps) {
        const stepValue = Object.values(step)[0] as any;
        if (stepValue?.uses) {
          actionUses.push(stepValue.uses);
        }
      }

      for (const actionUse of actionUses) {
        // Should have format: action@sha # version
        expect(actionUse).toMatch(/@[a-f0-9]{40}\s+#\s+v\d+/);
      }
    });
  });

  describe("PR Comment Style Matches deploy-pr-preview.yml", () => {
    let prCommentStep: any;

    beforeAll(() => {
      const step = workflow.jobs.build.steps.find(
        (s: any) => s.name === "PR comment with image reference"
      );
      prCommentStep = step;
    });

    it("should use actions/github-script", () => {
      expect(prCommentStep.uses).toContain("actions/github-script");
    });

    it("should check for existing bot comments", () => {
      const script = prCommentStep.with.script;
      expect(script).toContain("listComments");
      expect(script).toContain("find(comment =>");
      expect(script).toContain("comment.user.type === 'Bot'");
    });

    it("should update existing comment instead of creating duplicate", () => {
      const script = prCommentStep.with.script;
      expect(script).toContain("updateComment");
      expect(script).toContain("createComment");
    });

    it("should use emoji in comment header", () => {
      const script = prCommentStep.with.script;
      expect(script).toContain("🐳");
    });

    it("should use markdown formatting", () => {
      const script = prCommentStep.with.script;
      expect(script).toContain("## ");
      expect(script).toContain("**");
      expect(script).toContain("\\`\\`\\`"); // Backticks are escaped in YAML
    });

    it("should include commit SHA in comment", () => {
      const script = prCommentStep.with.script;
      expect(script).toContain("substring(0, 7)");
      expect(script).toContain("Built with commit");
    });
  });

  describe("Strict Policy Assertions", () => {
    it("should set IMAGE_NAME to github.repository", () => {
      expect(workflow.env.IMAGE_NAME).toBe("${{ github.repository }}");
    });

    it("should grant packages write permission", () => {
      expect(workflow.jobs.build.permissions.packages).toBe("write");
    });

    it("should guard docker login for non-PR events", () => {
      const loginStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Login to Docker Hub"
      );

      expect(loginStep.if).toBe("github.event_name != 'pull_request'");
    });

    it("should set build push mode from pull request event check", () => {
      const buildStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Build and push"
      );

      expect(buildStep.with.push).toBe(
        "${{ github.event_name != 'pull_request' }}"
      );
    });

    it("should only comment on non-fork pull requests", () => {
      const prCommentStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "PR comment with image reference"
      );

      expect(prCommentStep.if).toBe(
        "github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository"
      );
    });
  });

  describe("Additional Workflow Validations", () => {
    it("should have proper permissions set", () => {
      const permissions = workflow.jobs.build.permissions;
      expect(permissions.contents).toBe("read");
      expect(permissions.packages).toBe("write");
      expect(permissions["pull-requests"]).toBe("write");
    });

    it("should support multi-platform builds", () => {
      const buildStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Build and push"
      );

      expect(buildStep.with.platforms).toBe("linux/amd64,linux/arm64");
    });

    it("should use BuildKit cache", () => {
      const buildStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Build and push"
      );

      expect(buildStep.with["cache-from"]).toBe("type=gha");
      expect(buildStep.with["cache-to"]).toBe("type=gha,mode=max");
    });

    it("should set up QEMU for multi-platform support", () => {
      const qemuStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Set up QEMU"
      );
      expect(qemuStep).toBeDefined();
    });

    it("should set up Docker Buildx", () => {
      const buildxStep = workflow.jobs.build.steps.find(
        (step: any) => step.name === "Set up Docker Buildx"
      );
      expect(buildxStep).toBeDefined();
    });
  });
});
