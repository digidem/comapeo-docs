import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RUNBOOK_PATH = join(
  process.cwd(),
  "context",
  "workflows",
  "api-service-deployment.md"
);

describe("API Service Deployment Runbook", () => {
  it("should exist in context workflows", () => {
    expect(existsSync(RUNBOOK_PATH)).toBe(true);
  });

  it("should document VPS deployment steps", () => {
    const content = readFileSync(RUNBOOK_PATH, "utf-8");
    expect(content).toContain("## 3. Deploy on VPS");
    expect(content).toContain(
      "docker compose --env-file .env.production up -d --build"
    );
    expect(content).toContain("curl -fsS http://localhost:3001/health");
  });

  it("should document integration into existing docker-compose", () => {
    const content = readFileSync(RUNBOOK_PATH, "utf-8");
    expect(content).toContain("## 4. Integrate into Existing `docker-compose`");
    expect(content).toContain("services:");
    expect(content).toContain("healthcheck:");
    expect(content).toContain("docker compose up -d --build api");
  });

  it("should document GitHub workflow setup and secrets", () => {
    const content = readFileSync(RUNBOOK_PATH, "utf-8");
    expect(content).toContain(".github/workflows/api-notion-fetch.yml");
    expect(content).toContain("API_ENDPOINT");
    expect(content).toContain("API_KEY_GITHUB_ACTIONS");
    expect(content).toContain("NOTION_API_KEY");
    expect(content).toContain("OPENAI_API_KEY");
    expect(content).toContain("Notion Fetch via API");
  });

  it("should include smoke validation checklist", () => {
    const content = readFileSync(RUNBOOK_PATH, "utf-8");
    expect(content).toContain("## 6. Smoke Validation Checklist");
    expect(content).toContain("Auth");
    expect(content).toContain("Job status polling");
    expect(content).toContain("GitHub status context updates");
  });
});
