import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/api-validate.yml"
);

describe("API Validate workflow", () => {
  let workflow: any;
  let workflowContent: string;

  beforeEach(() => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
    workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
    workflow = yaml.load(workflowContent);
  });

  it("defines manual dispatch and workflow-file scoped triggers", () => {
    expect(workflow.on).toBeDefined();
    expect(workflow.on.workflow_dispatch).toBeDefined();
    expect(workflow.on.push.paths).toContain(
      ".github/workflows/api-validate.yml"
    );
    expect(workflow.on.pull_request.paths).toContain(
      ".github/workflows/api-validate.yml"
    );
  });

  it("defines a local validation job with CI lock hold env", () => {
    const job = workflow.jobs["api-validate"];
    expect(job).toBeDefined();
    expect(job["timeout-minutes"]).toBe(20);
    expect(job.env.CI_FETCH_HOLD_MS).toBe("3000");
  });

  it("includes setup, start, smoke, and cleanup steps", () => {
    const job = workflow.jobs["api-validate"];
    const stepNames = job.steps.map((step: any) => step.name);

    expect(stepNames).toContain("Install dependencies");
    expect(stepNames).toContain("Rebuild sharp for CI environment");
    expect(stepNames).toContain("Start local API");
    expect(stepNames).toContain("Run API smoke assertions");
    expect(stepNames).toContain("Cleanup local API");
  });

  it("asserts 401 envelope and deterministic 202 then 409 lock behavior", () => {
    expect(workflowContent).toContain('.error.code == "UNAUTHORIZED"');
    expect(workflowContent).toContain('test "${HTTP_CODE}" = "202"');
    expect(workflowContent).toContain('"type":"fetch-ready"');
    expect(workflowContent).toContain('"type":"fetch-all"');
    expect(workflowContent).toContain('.error.code == "CONFLICT"');
  });

  it("polls terminal job and validates dry-run response shape", () => {
    expect(workflowContent).toContain("/jobs/${JOB_ID}");
    expect(workflowContent).toContain('test "${STATUS}" = "completed"');
    expect(workflowContent).toContain(".dryRun == true");
    expect(workflowContent).toContain(".commitHash == null");
  });
});
