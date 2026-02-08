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
      expect(content).toContain("### Step 3.4: Verify Deployment");
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

    it("should list optional Cloudflare Pages secrets", () => {
      expect(content).toContain("CLOUDFLARE_API_TOKEN");
      expect(content).toContain("CLOUDFLARE_ACCOUNT_ID");
    });

    it("should list optional notification secrets", () => {
      expect(content).toContain("SLACK_WEBHOOK_URL");
    });

    it("should list optional configuration secrets with defaults", () => {
      expect(content).toContain("DEFAULT_DOCS_PAGE");
      expect(content).toContain("OPENAI_MODEL");
      expect(content).toContain("Default");
    });

    it("should explain implications of missing Cloudflare secrets", () => {
      expect(content).toMatch(/CLOUDFLARE.*deploy.*will not work/);
    });

    it("should document all available GitHub workflows", () => {
      expect(content).toContain("## Step 5.2: Available GitHub Workflows");
    });

    it("should document Notion Fetch via API workflow with job types", () => {
      expect(content).toContain("Notion Fetch via API");
      expect(content).toContain("api-notion-fetch.yml");
      expect(content).toContain("notion:fetch-all");
      expect(content).toContain("notion:fetch");
      expect(content).toContain("notion:translate");
      expect(content).toContain("notion:status-translation");
      expect(content).toContain("notion:status-draft");
      expect(content).toContain("notion:status-publish");
      expect(content).toContain("notion:status-publish-production");
    });

    it("should document Sync Notion Docs workflow", () => {
      expect(content).toContain("Sync Notion Docs");
      expect(content).toContain("sync-docs.yml");
      expect(content).toContain("content branch");
    });

    it("should document Translate Notion Docs workflow", () => {
      expect(content).toContain("Translate Notion Docs");
      expect(content).toContain("translate-docs.yml");
      expect(content).toContain("multiple languages");
    });

    it("should document Deploy PR Preview workflow with labels", () => {
      expect(content).toContain("Deploy PR Preview");
      expect(content).toContain("deploy-pr-preview.yml");
      expect(content).toContain("PR Labels for Content Generation");
      expect(content).toContain("fetch-all-pages");
      expect(content).toContain("fetch-10-pages");
      expect(content).toContain("fetch-5-pages");
    });

    it("should document Deploy to Production workflow", () => {
      expect(content).toContain("Deploy to Production");
      expect(content).toContain("deploy-production.yml");
      expect(content).toContain("Cloudflare Pages");
      expect(content).toMatch(/environment.*production.*test/);
    });

    it("should document Deploy to GitHub Pages workflow", () => {
      expect(content).toContain("Deploy to GitHub Pages");
      expect(content).toContain("deploy-staging.yml");
      expect(content).toContain("GitHub Pages");
    });

    it("should explain how to trigger the workflow", () => {
      expect(content).toContain("Test GitHub Workflow");
      expect(content).toContain("Run workflow");
    });

    it("should provide verification steps for workflow secrets", () => {
      expect(content).toContain("## Step 5.4: Verify Workflow Secrets");
      expect(content).toMatch(/authentication errors/);
      expect(content).toMatch(/health endpoint/);
      expect(content).toMatch(/GitHub status checks/);
    });

    it("should document common workflow issues", () => {
      expect(content).toMatch(/\*\*Common Issues:\*\*/);
      expect(content).toMatch(/CLOUDFLARE.*will cause deployment failures/);
      expect(content).toMatch(/SLACK_WEBHOOK_URL.*notification failures/);
      expect(content).toMatch(/API_ENDPOINT.*prevent workflow communication/);
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

    it("should include GitHub secrets verification in checklist", () => {
      expect(content).toContain("All required GitHub secrets are configured");
      expect(content).toContain("API_ENDPOINT");
      expect(content).toContain("API_KEY_GITHUB_ACTIONS");
      expect(content).toContain("NOTION_API_KEY");
      expect(content).toContain("DATABASE_ID");
      expect(content).toContain("DATA_SOURCE_ID");
      expect(content).toContain("OPENAI_API_KEY");
      expect(content).toContain("CLOUDFLARE_API_TOKEN");
      expect(content).toContain("CLOUDFLARE_ACCOUNT_ID");
      expect(content).toContain("SLACK_WEBHOOK_URL");
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

  describe("Existing Stack Integration", () => {
    let content: string;

    beforeAll(() => {
      content = readFileSync(RUNBOOK_PATH, "utf-8");
    });

    it("should document both standalone and existing stack deployment options", () => {
      expect(content).toContain("Option A: Standalone Deployment");
      expect(content).toContain("Option B: Existing Stack Integration");
    });

    it("should describe when to use standalone deployment", () => {
      expect(content).toMatch(/Option A.*first-time users/s);
      expect(content).toMatch(/dedicated.*docker-compose stack/s);
      expect(content).toMatch(/dedicated VPS.*isolated service/s);
    });

    it("should describe when to use existing stack integration", () => {
      expect(content).toMatch(/Option B.*production environments/s);
      expect(content).toMatch(/existing docker-compose\.yml/s);
      expect(content).toMatch(/alongside other containers/s);
    });

    it("should provide service definition for existing stacks", () => {
      expect(content).toContain(
        "Add this service to your existing docker-compose.yml"
      );
      expect(content).toContain("# ... your existing services ...");
    });

    it("should include configurable context path in service definition", () => {
      expect(content).toContain("context: ./path/to/comapeo-docs");
      expect(content).toContain("Adjust path as needed");
    });

    it("should show how to configure shared networking", () => {
      expect(content).toContain("networks:");
      expect(content).toContain("your-existing-network");
    });

    it("should include volume configuration for existing stacks", () => {
      expect(content).toMatch(/volumes:.*comapeo-job-data:/s);
      expect(content).toContain("# ... your existing volumes ...");
    });

    it("should show how to integrate with external networks", () => {
      expect(content).toContain("external: true");
      expect(content).toContain("If using an external network");
    });

    it("should provide Nginx reverse proxy configuration example", () => {
      expect(content).toContain("location /api/");
      expect(content).toContain("proxy_pass http://api:3001/");
      expect(content).toContain("proxy_set_header Host $host");
    });

    it("should document internal service-to-service communication", () => {
      expect(content).toContain("Other containers can reach the API at:");
      expect(content).toContain("http://api:3001/health");
    });

    it("should explain how to add environment variables to existing .env", () => {
      expect(content).toContain("Add to your existing .env file");
      expect(content).toMatch(/cat >> \.env/s);
    });

    it("should provide instructions for copying Dockerfile", () => {
      expect(content).toContain("Copy the `Dockerfile`");
      expect(content).toContain("build context");
    });

    it("should provide deployment commands for existing stack", () => {
      expect(content).toMatch(/For Existing Stack Integration/s);
      expect(content).toContain(
        "docker compose --env-file .env up -d --build api"
      );
    });

    it("should provide verification commands for existing stack", () => {
      expect(content).toMatch(
        /# Existing stack\s+docker compose.*\.env.*ps api/s
      );
    });

    it("should provide log checking for existing stack", () => {
      expect(content).toMatch(
        /# Existing stack\s+docker compose.*\.env.*logs/s
      );
    });

    it("should provide restart commands for existing stack", () => {
      expect(content).toMatch(/restart api/s);
    });

    it("should provide stop commands for existing stack", () => {
      expect(content).toMatch(/stop api/);
      expect(content).toMatch(/rm -f api/);
    });

    it("should warn about port binding considerations", () => {
      expect(content).toContain("127.0.0.1:3001:3001");
      expect(content).toMatch(/restrict to localhost/s);
    });

    it("should demonstrate environment variable substitution in service definition", () => {
      expect(content).toMatch(
        /API_KEY_GITHUB_ACTIONS:\s*\$\{API_KEY_GITHUB_ACTIONS\}/s
      );
      expect(content).toMatch(
        /API_KEY_DEPLOYMENT:\s*\$\{API_KEY_DEPLOYMENT\}/s
      );
    });
  });
});
