import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as yaml from "js-yaml";

describe("Docker Publish Workflow", () => {
  const workflowPath = resolve(
    __dirname,
    "../.github/workflows/docker-publish.yml"
  );
  let workflowContent: string;
  let workflow: any;

  beforeAll(() => {
    workflowContent = readFileSync(workflowPath, "utf-8");
    workflow = yaml.load(workflowContent);
  });

  describe("Workflow Structure", () => {
    it("should have valid name", () => {
      expect(workflow.name).toBe("Docker Publish");
    });

    it("should have on triggers configured", () => {
      expect(workflow.on).toBeDefined();
      expect(workflow.on.push).toBeDefined();
      expect(workflow.on.pull_request).toBeDefined();
      expect(workflow.on.workflow_dispatch).toBeDefined();
    });
  });

  describe("Triggers", () => {
    it("should trigger on push to main branch", () => {
      expect(workflow.on.push.branches).toContain("main");
    });

    it("should trigger on pull request to main branch", () => {
      expect(workflow.on.pull_request.branches).toContain("main");
    });

    it("should have workflow_dispatch enabled", () => {
      expect(workflow.on.workflow_dispatch).toBeDefined();
    });

    it("should have correct path filters for push", () => {
      const paths = workflow.on.push.paths;
      expect(paths).toContain("Dockerfile");
      expect(paths).toContain(".dockerignore");
      expect(paths).toContain("package.json");
      expect(paths).toContain("bun.lockb*");
      expect(paths).toContain("scripts/**");
      expect(paths).toContain("tsconfig.json");
      expect(paths).toContain("docusaurus.config.ts");
      expect(paths).toContain("src/client/**");
    });

    it("should have matching path filters for pull_request", () => {
      const pushPaths = workflow.on.push.paths;
      const prPaths = workflow.on.pull_request.paths;
      expect(pushPaths).toEqual(prPaths);
    });
  });

  describe("Concurrency", () => {
    it("should have concurrency configured", () => {
      expect(workflow.concurrency).toBeDefined();
      expect(workflow.concurrency.group).toContain("github.workflow");
      expect(workflow.concurrency.group).toContain("github.ref");
    });

    it("should cancel in-progress for pull requests only", () => {
      const cancelExpr = workflow.concurrency["cancel-in-progress"];
      expect(cancelExpr).toContain("github.event_name == 'pull_request'");
    });
  });

  describe("Environment Variables", () => {
    it("should set REGISTRY to docker.io", () => {
      expect(workflow.env.REGISTRY).toBe("docker.io");
    });

    it("should set IMAGE_NAME to the API image repository", () => {
      expect(workflow.env.IMAGE_NAME).toBe("communityfirst/comapeo-docs-api");
    });
  });

  describe("Jobs", () => {
    it("should have build job", () => {
      expect(workflow.jobs.build).toBeDefined();
    });

    it("should run on ubuntu-latest", () => {
      expect(workflow.jobs.build["runs-on"]).toBe("ubuntu-latest");
    });

    it("should have correct permissions", () => {
      const permissions = workflow.jobs.build.permissions;
      expect(permissions.contents).toBe("read");
      expect(permissions).not.toHaveProperty("packages");
      expect(permissions["pull-requests"]).toBe("write");
    });
  });

  describe("Build Steps", () => {
    let steps: any[];

    beforeAll(() => {
      steps = workflow.jobs.build.steps;
    });

    it("should have checkout step", () => {
      const checkout = steps.find((s: any) =>
        s.uses?.includes("actions/checkout")
      );
      expect(checkout).toBeDefined();
      expect(checkout.uses).toContain("actions/checkout@");
    });

    it("should set up QEMU", () => {
      const qemu = steps.find((s: any) =>
        s.uses?.includes("docker/setup-qemu-action")
      );
      expect(qemu).toBeDefined();
      expect(qemu.uses).toContain("docker/setup-qemu-action@");
    });

    it("should set up Docker Buildx", () => {
      const buildx = steps.find((s: any) =>
        s.uses?.includes("docker/setup-buildx-action")
      );
      expect(buildx).toBeDefined();
      expect(buildx.uses).toContain("docker/setup-buildx-action@");
    });
    it("should determine publish mode using non-fork equality check", () => {
      const publish = steps.find((s: any) => s.id === "publish");
      expect(publish).toBeDefined();
      expect(publish.run).toContain(
        '"${{ github.event.pull_request.head.repo.full_name }}" != "${{ github.repository }}"'
      );
    });

    it("should login to Docker Hub for non-PR events", () => {
      const login = steps.find((s: any) =>
        s.uses?.includes("docker/login-action")
      );
      expect(login).toBeDefined();
      expect(login.uses).toContain("docker/login-action@");
      expect(login.if).toBe("steps.publish.outputs.push == 'true'");
      expect(login.with.username).toContain("secrets.DOCKERHUB_USERNAME");
      expect(login.with.password).toContain("secrets.DOCKERHUB_TOKEN");
    });

    it("should extract metadata with correct tags", () => {
      const meta = steps.find((s: any) => s.id === "meta");
      expect(meta).toBeDefined();
      expect(meta.uses).toContain("docker/metadata-action@");
      expect(meta.with.tags).toContain("type=raw,value=latest");
      expect(meta.with.tags).toContain("type=sha,prefix=");
      expect(meta.with.tags).toContain(
        "type=raw,value=pr-${{ github.event.number }}"
      );
    });

    it("should build and push with correct configuration", () => {
      const build = steps.find((s: any) => s.id === "build");
      expect(build).toBeDefined();
      expect(build.uses).toContain("docker/build-push-action@");
      expect(build.with.platforms).toContain("linux/amd64");
      expect(build.with.platforms).toContain("linux/arm64");
      expect(build.with.push).toBe(
        "${{ steps.publish.outputs.push == 'true' }}"
      );
      expect(build.with["cache-from"]).toContain("type=gha");
      expect(build.with["cache-to"]).toContain("type=gha,mode=max");
    });

    it("should create PR comment for non-fork PRs", () => {
      const comment = steps.find((s: any) =>
        s.uses?.includes("actions/github-script")
      );
      expect(comment).toBeDefined();
      expect(comment.if).toContain("github.event_name == 'pull_request'");
      expect(comment.if).toContain("steps.publish.outputs.push == 'true'");
      expect(comment.uses).toContain("actions/github-script@");
      expect(comment.with.script).toContain("docker pull");
      expect(comment.with.script).toContain("docker run");
    });
  });

  describe("Security", () => {
    it("should not expose secrets in workflow", () => {
      expect(workflowContent).not.toMatch(/password:\s*['"]\w+/);
      expect(workflowContent).not.toMatch(/token:\s*['"]\w+/);
    });

    it("should use secrets for authentication", () => {
      expect(workflowContent).toContain("secrets.DOCKERHUB_USERNAME");
      expect(workflowContent).toContain("secrets.DOCKERHUB_TOKEN");
    });

    it("should not push for pull requests", () => {
      const loginStep = workflow.jobs.build.steps.find((s: any) =>
        s.uses?.includes("docker/login-action")
      );
      const buildStep = workflow.jobs.build.steps.find(
        (s: any) => s.id === "build"
      );

      expect(loginStep.if).toBe("steps.publish.outputs.push == 'true'");
      expect(buildStep.with.push).toBe(
        "${{ steps.publish.outputs.push == 'true' }}"
      );
    });

    it("should only comment on non-fork PRs", () => {
      const commentStep = workflow.jobs.build.steps.find((s: any) =>
        s.uses?.includes("actions/github-script")
      );
      expect(commentStep.if).toContain("github.event_name == 'pull_request'");
      expect(commentStep.if).toContain("steps.publish.outputs.push == 'true'");
    });
  });

  describe("Tag Strategy", () => {
    it("should tag as latest and sha for main branch", () => {
      const meta = workflow.jobs.build.steps.find((s: any) => s.id === "meta");
      const tags = meta.with.tags;

      expect(tags).toContain("type=raw,value=latest");
      expect(tags).toContain("type=sha,prefix=");
      expect(tags).toContain("type=raw,value=pr-${{ github.event.number }}");
    });

    it("should tag as pr-{number} for pull requests", () => {
      const meta = workflow.jobs.build.steps.find((s: any) => s.id === "meta");
      const tags = meta.with.tags;

      expect(tags).toContain("type=raw,value=pr-${{ github.event.number }}");
    });
  });

  describe("Multi-Platform Build", () => {
    it("should build for linux/amd64", () => {
      const build = workflow.jobs.build.steps.find(
        (s: any) => s.id === "build"
      );
      expect(build.with.platforms).toContain("linux/amd64");
    });

    it("should build for linux/arm64", () => {
      const build = workflow.jobs.build.steps.find(
        (s: any) => s.id === "build"
      );
      expect(build.with.platforms).toContain("linux/arm64");
    });
  });

  describe("Registry Cache", () => {
    it("should use GitHub Actions cache", () => {
      const build = workflow.jobs.build.steps.find(
        (s: any) => s.id === "build"
      );
      expect(build.with["cache-from"]).toBe("type=gha");
      expect(build.with["cache-to"]).toBe("type=gha,mode=max");
    });
  });
});
