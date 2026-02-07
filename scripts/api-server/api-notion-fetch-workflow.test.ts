/**
 * Tests for the API Notion Fetch GitHub workflow
 *
 * This test validates:
 * 1. Workflow YAML structure is valid
 * 2. All required secrets and inputs are properly defined
 * 3. API interaction logic is correct
 * 4. Error handling and polling mechanisms work
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/api-notion-fetch.yml"
);

describe("API Notion Fetch Workflow", () => {
  let workflow: any;

  beforeEach(() => {
    // Check if workflow file exists
    expect(existsSync(WORKFLOW_PATH)).toBe(true);

    // Read and parse workflow
    const content = readFileSync(WORKFLOW_PATH, "utf-8");
    workflow = parseYaml(content);
  });

  describe("Workflow Structure", () => {
    it("should have a valid name", () => {
      expect(workflow.name).toBe("Notion Fetch via API");
    });

    it("should have proper triggers defined", () => {
      expect(workflow.on).toBeDefined();
      expect(workflow.on.workflow_dispatch).toBeDefined();
      expect(workflow.on.repository_dispatch).toBeDefined();
      expect(workflow.on.schedule).toBeDefined();
    });

    it("should have concurrency settings", () => {
      expect(workflow.concurrency).toBeDefined();
      expect(workflow.concurrency.group).toBe("notion-api-fetch");
      expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    });

    it("should have at least one job defined", () => {
      expect(workflow.jobs).toBeDefined();
      expect(Object.keys(workflow.jobs).length).toBeGreaterThan(0);
    });
  });

  describe("Workflow Dispatch Inputs", () => {
    it("should have job_type input with valid choices", () => {
      const inputs = workflow.on.workflow_dispatch.inputs;
      expect(inputs.job_type).toBeDefined();
      expect(inputs.job_type.type).toBe("choice");
      expect(inputs.job_type.default).toBe("notion:fetch-all");
      expect(inputs.job_type.options).toContain("notion:fetch-all");
      expect(inputs.job_type.options).toContain("notion:fetch");
      expect(inputs.job_type.options).toContain("notion:translate");
    });

    it("should have max_pages input with default value", () => {
      const inputs = workflow.on.workflow_dispatch.inputs;
      expect(inputs.max_pages).toBeDefined();
      expect(inputs.max_pages.default).toBe("5");
    });

    it("should have force input as boolean", () => {
      const inputs = workflow.on.workflow_dispatch.inputs;
      expect(inputs.force).toBeDefined();
      expect(inputs.force.type).toBe("boolean");
      expect(inputs.force.default).toBe(false);
    });
  });

  describe("Job Configuration", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
      expect(job).toBeDefined();
    });

    it("should have proper timeout settings", () => {
      expect(job["timeout-minutes"]).toBe(60);
    });

    it("should have production environment configured", () => {
      expect(job.environment).toBeDefined();
      expect(job.environment.name).toBe("production");
    });

    it("should reference the API endpoint in environment URL", () => {
      expect(job.environment.url).toContain(
        "${{ steps.create-job.outputs.api_url }}"
      );
    });
  });

  describe("Required Secrets", () => {
    const requiredSecrets = [
      "NOTION_API_KEY",
      "DATA_SOURCE_ID",
      "DATABASE_ID",
      "OPENAI_API_KEY",
      "API_KEY_GITHUB_ACTIONS",
      "SLACK_WEBHOOK_URL",
    ];

    it.each(requiredSecrets)("should reference secret: %s", (secret) => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      expect(workflowContent).toContain(`secrets.${secret}`);
    });
  });

  describe("API Integration Steps", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
    });

    it("should have a step to configure API endpoint", () => {
      expect(job.steps).toBeDefined();
      const configStep = job.steps.find((s: any) => s.id === "config");
      expect(configStep).toBeDefined();
    });

    it("should have a step to create job via API", () => {
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");
      expect(createJobStep).toBeDefined();
      expect(createJobStep.run).toContain("POST");
      expect(createJobStep.run).toContain("/jobs");
    });

    it("should have a step to poll job status", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep).toBeDefined();
      expect(pollStep.run).toContain("polling");
      expect(pollStep.run).toContain("STATUS");
    });

    it("should handle completed status", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain("completed");
      expect(pollStep.run).toContain('state="success"');
    });

    it("should handle failed status", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain("failed");
      expect(pollStep.run).toContain('state="failure"');
    });

    it("should have timeout handling", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain("MAX_WAIT");
      expect(pollStep.run).toContain("timed out");
    });
  });

  describe("GitHub Status Reporting", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
    });

    it("should set pending status when job is created", () => {
      const createJobStep = job.steps.find((s: any) => s.id === "create-job");
      expect(createJobStep.run).toContain('state="pending"');
      expect(createJobStep.run).toContain("gh api");
    });

    it("should update status to success on completion", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain('state="success"');
    });

    it("should update status to failure on job failure", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain('state="failure"');
    });

    it("should include job URL in status", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      expect(workflowContent).toContain("target_url");
      expect(workflowContent).toContain("/jobs/");
    });
  });

  describe("Local Mode (Fallback)", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
    });

    it("should have condition for local mode", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      expect(workflowContent).toContain("mode == 'local'");
    });

    it("should setup Bun in local mode", () => {
      const bunStep = job.steps.find((s: any) => s["if"]?.includes("local"));
      expect(bunStep).toBeDefined();
      expect(bunStep.uses).toContain("setup-bun");
    });

    it("should install dependencies in local mode", () => {
      const installStep = job.steps.find((s: any) =>
        s.run?.includes("bun install")
      );
      expect(installStep).toBeDefined();
    });

    it("should start API server in local mode", () => {
      const startServerStep = job.steps.find((s: any) =>
        s.run?.includes("bun run api:server")
      );
      expect(startServerStep).toBeDefined();
    });

    it("should stop API server in local mode on completion", () => {
      const stopStep = job.steps.find((s: any) =>
        s.run?.includes("Stopping API server")
      );
      expect(stopStep).toBeDefined();
      expect(stopStep["if"]).toContain("always()");
    });
  });

  describe("Notifications", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
    });

    it("should create job summary", () => {
      const summaryStep = job.steps.find((s: any) => s.id === "summary");
      expect(summaryStep).toBeDefined();
    });

    it("should notify Slack on completion", () => {
      const slackStep = job.steps.find((s: any) =>
        s.uses?.includes("slack-github-action")
      );
      expect(slackStep).toBeDefined();
      expect(slackStep["if"]).toContain("always()");
    });
  });

  describe("Security and Best Practices", () => {
    it("should use GitHub Actions checkout@v4", () => {
      const job = workflow.jobs["fetch-via-api"];
      const checkoutStep = job.steps.find((s: any) =>
        s.uses?.startsWith("actions/checkout")
      );
      expect(checkoutStep).toBeDefined();
      expect(checkoutStep.uses).toBe("actions/checkout@v4");
    });

    it("should use API key authentication", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      expect(workflowContent).toContain("Authorization: Bearer");
      expect(workflowContent).toContain("API_KEY_GITHUB_ACTIONS");
    });

    it("should have proper error handling", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      expect(workflowContent).toContain("set -e");
      expect(workflowContent).toContain("|| true");
      expect(workflowContent).toContain("|| exit 1");
    });
  });

  describe("Job Types", () => {
    const expectedJobTypes = [
      "notion:fetch-all",
      "notion:fetch",
      "notion:translate",
      "notion:status-translation",
      "notion:status-draft",
      "notion:status-publish",
      "notion:status-publish-production",
    ];

    it.each(expectedJobTypes)("should support job type: %s", (jobType) => {
      const inputs = workflow.on.workflow_dispatch.inputs;
      expect(inputs.job_type.options).toContain(jobType);
    });
  });

  describe("Polling Configuration", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
    });

    it("should have configurable polling interval", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain("POLL_INTERVAL");
    });

    it("should have reasonable timeout period", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain("MAX_WAIT=3600");
    });

    it("should update elapsed time counter", () => {
      const pollStep = job.steps.find((s: any) => s.id === "poll-status");
      expect(pollStep.run).toContain("ELAPSED");
    });
  });

  describe("API Endpoint Configuration", () => {
    let job: any;

    beforeEach(() => {
      job = workflow.jobs["fetch-via-api"];
    });

    it("should support production API endpoint", () => {
      const configStep = job.steps.find((s: any) => s.id === "config");
      expect(configStep.run).toContain("API_ENDPOINT");
    });

    it("should fallback to localhost for testing", () => {
      const configStep = job.steps.find((s: any) => s.id === "config");
      expect(configStep.run).toContain("localhost:3001");
    });

    it("should output endpoint URL for use in other steps", () => {
      const configStep = job.steps.find((s: any) => s.id === "config");
      expect(configStep.run).toContain('echo "endpoint=');
      expect(configStep.run).toContain(">> $GITHUB_OUTPUT");
    });
  });
});
