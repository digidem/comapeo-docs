import { beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as yaml from "js-yaml";
import { ApiKeyAuth } from "./auth";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github/workflows/api-validate.yml"
);

describe("GitHub Actions Secret Handling", () => {
  let workflow: any;
  let workflowContent: string;

  beforeEach(() => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
    workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
    workflow = yaml.load(workflowContent);
  });

  describe("Workflow secret references", () => {
    const requiredSecrets = [
      "API_KEY_GITHUB_ACTIONS",
      "NOTION_API_KEY",
      "DATABASE_ID",
      "DATA_SOURCE_ID",
      "OPENAI_API_KEY",
    ];

    it.each(requiredSecrets)(
      "references secret: %s without hardcoding",
      (s) => {
        expect(workflowContent).toContain(`secrets.${s}`);
        expect(workflowContent).not.toContain(`${s}: "`);
        expect(workflowContent).not.toContain(`${s}: '`);
      }
    );

    it("maps API key secret to Authorization header usage", () => {
      const job = workflow.jobs["api-validate"];
      expect(job.env.API_KEY_CI).toContain(
        "${{ secrets.API_KEY_GITHUB_ACTIONS"
      );

      const smokeStep = job.steps.find(
        (step: any) => step.name === "Run API smoke assertions"
      );
      expect(smokeStep).toBeDefined();
      expect(smokeStep.run).toContain("Authorization: Bearer ${API_KEY_CI}");
    });

    it("passes Notion/OpenAI secrets via workflow env", () => {
      const job = workflow.jobs["api-validate"];
      expect(job.env.NOTION_API_KEY).toBe("${{ secrets.NOTION_API_KEY }}");
      expect(job.env.DATABASE_ID).toBe("${{ secrets.DATABASE_ID }}");
      expect(job.env.DATA_SOURCE_ID).toBe("${{ secrets.DATA_SOURCE_ID }}");
      expect(job.env.OPENAI_API_KEY).toBe("${{ secrets.OPENAI_API_KEY }}");
    });
  });

  describe("API key auth compatibility", () => {
    it("accepts GitHub Actions bearer token style keys", () => {
      // Reset singleton for isolated test behavior.
      ApiKeyAuth.resetInstance();
      const auth = ApiKeyAuth.getInstance();

      const token = "gha_" + "a".repeat(32);
      auth.addKey("GITHUB_ACTIONS", token, {
        name: "GITHUB_ACTIONS",
        active: true,
      });

      const result = auth.authenticate(`Bearer ${token}`);
      expect(result.success).toBe(true);
      expect(result.meta?.name).toBe("GITHUB_ACTIONS");
    });
  });
});
