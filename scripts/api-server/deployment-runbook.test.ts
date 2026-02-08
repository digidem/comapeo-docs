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
  describe("File Structure", () => {
    it("should exist in context workflows", () => {
      expect(existsSync(RUNBOOK_PATH)).toBe(true);
    });

    it("should have content", () => {
      const content = readFileSync(RUNBOOK_PATH, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe("First-Time Operator Friendliness", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should have deployment overview with time estimate", () => {
      expect(content).toContain("## Deployment Overview");
      expect(content).toContain("Estimated Time");
    });

    it("should start with preparation steps on local machine", () => {
      expect(content).toContain("## Part 1: Preparation");
      expect(content).toContain("Local Machine");
      expect(content).toContain("Clone Repository");
    });

    it("should guide through API key generation", () => {
      expect(content).toContain("Generate API Keys");
      expect(content).toContain("openssl rand");
    });

    it("should explain where to get required secrets", () => {
      expect(content).toContain("Gather Required Secrets");
      expect(content).toContain("Where to Get It");
    });

    it("should provide environment file creation instructions", () => {
      expect(content).toContain("Create Environment File");
      expect(content).toContain(".env.production");
      expect(content).toContain("NODE_ENV=production");
    });
  });

  describe("VPS Deployment Steps", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should document VPS setup", () => {
      expect(content).toContain("## Part 2: VPS Setup");
      expect(content).toContain("Install Docker");
    });

    it("should include deployment commands", () => {
      expect(content).toContain(
        "docker compose --env-file .env.production up -d --build"
      );
      expect(content).toContain("docker compose --env-file .env.production ps");
    });

    it("should include health check verification", () => {
      expect(content).toContain("curl http://localhost:3001/health");
      expect(content).toContain("### Step 3.3: Verify Deployment");
    });

    it("should provide verification steps", () => {
      expect(content).toContain("**Verify**");
      expect(content).toContain("**Expected Output**");
    });
  });

  describe("GitHub Integration", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should document GitHub workflow setup", () => {
      expect(content).toContain("## Part 5: GitHub Integration");
      expect(content).toContain("Add GitHub Secrets");
    });

    it("should list required GitHub secrets", () => {
      expect(content).toContain("API_ENDPOINT");
      expect(content).toContain("API_KEY_GITHUB_ACTIONS");
      expect(content).toContain("NOTION_API_KEY");
      expect(content).toContain("OPENAI_API_KEY");
    });

    it("should explain how to trigger the workflow", () => {
      expect(content).toContain("Test GitHub Workflow");
      expect(content).toContain("Run workflow");
    });
  });

  describe("Validation and Checklist", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should include validation checklist", () => {
      expect(content).toContain("## Validation Checklist");
      expect(content).toContain("- [ ]");
    });

    it("should verify container is running", () => {
      expect(content).toContain("docker ps");
      expect(content).toContain("comapeo-api-server");
    });

    it("should verify health check", () => {
      expect(content).toContain('{"status":"ok"}');
    });

    it("should include firewall verification", () => {
      expect(content).toContain("sudo ufw status");
    });
  });

  describe("Troubleshooting", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should have troubleshooting section with symptoms", () => {
      expect(content).toContain("## Troubleshooting");
      expect(content).toContain("**Symptoms**");
    });

    it("should cover container startup issues", () => {
      expect(content).toContain("Container Won't Start");
      expect(content).toContain("docker compose logs");
    });

    it("should cover health check failures", () => {
      expect(content).toContain("Health Check Failing");
      expect(content).toContain("curl -v");
    });

    it("should cover permission issues", () => {
      expect(content).toContain("Permission Issues");
      expect(content).toContain("chown");
      expect(content).toContain("groups");
    });

    it("should cover memory issues", () => {
      expect(content).toContain("Out of Memory");
      expect(content).toContain("free -h");
      expect(content).toContain("DOCKER_MEMORY_LIMIT");
    });

    it("should provide diagnosis commands", () => {
      expect(content).toContain("**Diagnosis**");
      expect(content).toContain("**Solution**");
    });
  });

  describe("Ongoing Operations", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should document log viewing", () => {
      expect(content).toContain("## Ongoing Operations");
      expect(content).toContain("### View Logs");
      expect(content).toContain("logs -f api");
    });

    it("should document service restart", () => {
      expect(content).toContain("### Restart Service");
      expect(content).toContain("--env-file .env.production restart");
    });

    it("should document service update", () => {
      expect(content).toContain("### Update Service");
      expect(content).toContain("git pull");
      expect(content).toContain("up -d --build");
    });

    it("should document backup procedure", () => {
      expect(content).toContain("### Backup Data");
      expect(content).toContain("docker run --rm -v");
      expect(content).toContain("backup");
    });
  });

  describe("Structure and Clarity", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should use clear section numbering with parts", () => {
      expect(content).toContain("## Part 1:");
      expect(content).toContain("## Part 2:");
      expect(content).toContain("## Part 3:");
    });

    it("should use step numbering within parts", () => {
      expect(content).toContain("### Step 1.1:");
      expect(content).toContain("### Step 2.1:");
      expect(content).toContain("### Step 3.1:");
    });

    it("should highlight verification points", () => {
      const verifyCount = (content.match(/\*\*Verify\*\*/g) || []).length;
      expect(verifyCount).toBeGreaterThan(3);
    });

    it("should provide expected outputs", () => {
      const expectedCount = (content.match(/\*\*Expected/g) || []).length;
      expect(expectedCount).toBeGreaterThanOrEqual(2);
    });

    it("should use code blocks for commands", () => {
      expect(content).toContain("```bash");
    });

    it("should include reference links", () => {
      expect(content).toContain("## Additional Resources");
      expect(content).toContain("](../");
    });
  });
});
