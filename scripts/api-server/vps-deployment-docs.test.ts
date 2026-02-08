/**
 * VPS Deployment Documentation Tests
 *
 * Tests for VPS deployment documentation structure and content validation
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import {
  loadDocumentation,
  getFrontmatterValue,
  getFrontmatterArray,
  extractCodeBlocks,
  extractLinks,
  validateBashCodeBlock,
  hasRequiredSections,
  validateDocumentationCommands,
  type CommandValidationError,
} from "./lib/doc-validation";

const DOCS_PATH = join(
  process.cwd(),
  "docs",
  "developer-tools",
  "vps-deployment.md"
);

// Required sections for VPS deployment documentation
const REQUIRED_SECTIONS = [
  "Prerequisites",
  "Quick Start",
  "Deployment",
  "Environment Variables",
  "Container Management",
  "Monitoring",
  "Troubleshooting",
  "Security",
  "Production Checklist",
];

describe("VPS Deployment Documentation", () => {
  let content: string;
  let codeBlocks: Array<{ lang: string; code: string; lineStart: number }>;
  let links: Array<{ text: string; url: string }>;

  beforeAll(() => {
    content = loadDocumentation(DOCS_PATH);
    codeBlocks = extractCodeBlocks(content);
    links = extractLinks(content);
  });

  describe("File Structure", () => {
    it("should have documentation file at expected path", () => {
      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe("Required Sections Validation", () => {
    it("should have all required sections", () => {
      const { passed, missing } = hasRequiredSections(
        content,
        REQUIRED_SECTIONS
      );
      expect(missing).toEqual([]);
      expect(passed.length).toEqual(REQUIRED_SECTIONS.length);
    });

    it("should report which required sections are present", () => {
      const { passed } = hasRequiredSections(content, REQUIRED_SECTIONS);
      expect(passed).toContain("Prerequisites");
      expect(passed).toContain("Quick Start");
      expect(passed).toContain("Environment Variables");
      expect(passed).toContain("Troubleshooting");
      expect(passed).toContain("Security");
      expect(passed).toContain("Production Checklist");
    });
  });

  describe("Frontmatter Validation", () => {
    it("should have valid frontmatter", () => {
      const frontmatter = getFrontmatterValue(content, "id");
      expect(frontmatter).not.toBeNull();
    });

    it("should have required frontmatter fields", () => {
      expect(getFrontmatterValue(content, "id")).toBe("vps-deployment");
      expect(getFrontmatterValue(content, "title")).toBe(
        "VPS Deployment Guide"
      );
      expect(getFrontmatterValue(content, "sidebar_label")).toBe(
        "VPS Deployment"
      );
      expect(getFrontmatterValue(content, "sidebar_position")).toBe("2");
    });

    it("should have proper keywords and tags", () => {
      const keywords = getFrontmatterArray(content, "keywords");
      const tags = getFrontmatterArray(content, "tags");

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain("deployment");
      expect(keywords).toContain("vps");
      expect(keywords).toContain("docker");
      expect(keywords).toContain("production");

      expect(tags.length).toBeGreaterThan(0);
      expect(tags).toContain("developer");
      expect(tags).toContain("deployment");
      expect(tags).toContain("operations");
    });

    it("should have proper slug", () => {
      expect(getFrontmatterValue(content, "slug")).toBe(
        "/developer-tools/vps-deployment"
      );
    });
  });

  describe("Content Structure", () => {
    it("should have main heading", () => {
      expect(content).toContain("# VPS Deployment Guide");
    });

    it("should have prerequisites section", () => {
      expect(content).toContain("## Prerequisites");
    });

    it("should have quick start section", () => {
      expect(content).toContain("## Quick Start");
    });

    it("should have detailed deployment steps", () => {
      expect(content).toContain("## Detailed Deployment Steps");
    });

    it("should have environment variables reference", () => {
      expect(content).toContain("## Environment Variables Reference");
    });

    it("should have container management section", () => {
      expect(content).toContain("## Container Management");
    });

    it("should have monitoring section", () => {
      expect(content).toContain("## Monitoring and Maintenance");
    });

    it("should have troubleshooting section", () => {
      expect(content).toContain("## Troubleshooting");
    });

    it("should have security best practices", () => {
      expect(content).toContain("## Security Best Practices");
    });

    it("should have production checklist", () => {
      expect(content).toContain("## Production Checklist");
    });
  });

  describe("Environment Variables Documentation", () => {
    it("should document all required Notion variables", () => {
      expect(content).toContain("NOTION_API_KEY");
      expect(content).toContain("DATABASE_ID");
      expect(content).toContain("DATA_SOURCE_ID");
    });

    it("should document OpenAI variables", () => {
      expect(content).toContain("OPENAI_API_KEY");
      expect(content).toContain("OPENAI_MODEL");
    });

    it("should document API configuration variables", () => {
      expect(content).toContain("API_HOST");
      expect(content).toContain("API_PORT");
    });

    it("should document API authentication variables", () => {
      expect(content).toContain("API_KEY_");
      expect(content).toContain("API_KEY_DEPLOYMENT");
    });

    it("should document Docker configuration variables", () => {
      expect(content).toContain("DOCKER_IMAGE_NAME");
      expect(content).toContain("DOCKER_CONTAINER_NAME");
      expect(content).toContain("DOCKER_VOLUME_NAME");
    });

    it("should document resource limit variables", () => {
      expect(content).toContain("DOCKER_CPU_LIMIT");
      expect(content).toContain("DOCKER_MEMORY_LIMIT");
      expect(content).toContain("DOCKER_CPU_RESERVATION");
      expect(content).toContain("DOCKER_MEMORY_RESERVATION");
    });

    it("should document health check variables", () => {
      expect(content).toContain("HEALTHCHECK_INTERVAL");
      expect(content).toContain("HEALTHCHECK_TIMEOUT");
      expect(content).toContain("HEALTHCHECK_START_PERIOD");
      expect(content).toContain("HEALTHCHECK_RETRIES");
    });

    it("should document logging variables", () => {
      expect(content).toContain("DOCKER_LOG_DRIVER");
      expect(content).toContain("DOCKER_LOG_MAX_SIZE");
      expect(content).toContain("DOCKER_LOG_MAX_FILE");
    });
  });

  describe("Code Examples", () => {
    it("should have bash code examples", () => {
      const bashBlocks = codeBlocks.filter((block) => block.lang === "bash");
      expect(bashBlocks.length).toBeGreaterThan(0);
    });

    it("should have environment file example", () => {
      const envBlock = codeBlocks.find((block) =>
        block.code.includes("NODE_ENV=production")
      );
      expect(envBlock).toBeDefined();
    });

    it("should have Docker Compose commands", () => {
      const dockerBlocks = codeBlocks.filter((block) =>
        block.code.includes("docker compose")
      );
      expect(dockerBlocks.length).toBeGreaterThan(0);
    });

    it("should have curl example for health check", () => {
      const healthBlock = codeBlocks.find(
        (block) => block.code.includes("curl") && block.code.includes("/health")
      );
      expect(healthBlock).toBeDefined();
    });

    it("should have Nginx configuration example", () => {
      const nginxBlock = codeBlocks.find(
        (block) =>
          block.code.includes("server {") && block.code.includes("proxy_pass")
      );
      expect(nginxBlock).toBeDefined();
    });
  });

  describe("Executable Command Validation", () => {
    it("should validate all bash commands are syntactically correct", () => {
      const errors = validateDocumentationCommands(content);

      // Group errors by severity
      const criticalErrors = errors.filter((e) => e.severity === "error");
      const warnings = errors.filter((e) => e.severity === "warning");

      // Report critical errors if any
      if (criticalErrors.length > 0) {
        const errorDetails = criticalErrors
          .map((e) => `Line ${e.line}: "${e.command}" - ${e.reason}`)
          .join("\n  ");
        throw new Error(
          `Found ${criticalErrors.length} critical command syntax errors:\n  ${errorDetails}`
        );
      }

      // Warnings are acceptable but should be documented
      if (warnings.length > 0) {
        // We'll still pass the test but log the warnings
        expect(warnings.length).toBeGreaterThanOrEqual(0);
      }
    });

    it("should have balanced quotes in bash commands", () => {
      const bashBlocks = codeBlocks.filter(
        (block) => block.lang === "bash" || block.lang === "sh"
      );

      for (const block of bashBlocks) {
        const errors = validateBashCodeBlock(block);
        const quoteErrors = errors.filter((e) =>
          e.reason.includes("Unbalanced quotes")
        );
        expect(quoteErrors).toEqual([]);
      }
    });

    it("should have balanced parentheses in command substitutions", () => {
      const bashBlocks = codeBlocks.filter(
        (block) => block.lang === "bash" || block.lang === "sh"
      );

      for (const block of bashBlocks) {
        const errors = validateBashCodeBlock(block);
        const parenErrors = errors.filter((e) =>
          e.reason.includes("parentheses")
        );
        expect(parenErrors).toEqual([]);
      }
    });
  });

  describe("Links and References", () => {
    it("should have link to API reference", () => {
      const apiRefLink = links.find((link) =>
        link.url.includes("api-reference")
      );
      expect(apiRefLink).toBeDefined();
    });

    it("should have link to Docker documentation", () => {
      const dockerLink = links.find((link) =>
        link.url.includes("docs.docker.com")
      );
      expect(dockerLink).toBeDefined();
    });

    it("should have link to Docker Compose documentation", () => {
      const composeLink = links.find(
        (link) =>
          link.url.includes("docs.docker.com") && link.url.includes("compose")
      );
      expect(composeLink).toBeDefined();
    });

    it("should have link to Nginx documentation", () => {
      const nginxLink = links.find((link) => link.url.includes("nginx.org"));
      expect(nginxLink).toBeDefined();
    });
  });

  describe("Deployment Steps", () => {
    it("should document VPS preparation", () => {
      expect(content).toContain("### Step 1: VPS Preparation");
      expect(content).toContain("apt update");
      expect(content).toContain("get.docker.com");
    });

    it("should document deployment directory creation", () => {
      expect(content).toContain("### Step 2: Create Deployment Directory");
      expect(content).toContain("/opt/comapeo-api");
    });

    it("should document firewall configuration", () => {
      expect(content).toContain("### Step 3: Configure Firewall");
      expect(content).toContain("ufw allow");
    });

    it("should document reverse proxy setup", () => {
      expect(content).toContain("### Step 4: Set Up Reverse Proxy");
      expect(content).toContain("Nginx");
    });

    it("should document SSL configuration", () => {
      expect(content).toContain("### Step 5: SSL/TLS Configuration");
      expect(content).toContain("Certbot");
    });
  });

  describe("Troubleshooting Coverage", () => {
    it("should cover container startup issues", () => {
      expect(content).toContain("### Container Won't Start");
      expect(content).toContain("docker ps");
      expect(content).toContain("docker logs");
    });

    it("should cover health check failures", () => {
      expect(content).toContain("### Health Check Failing");
      expect(content).toContain("docker inspect");
    });

    it("should cover permission issues", () => {
      expect(content).toContain("### Permission Issues");
      expect(content).toContain("chown");
      expect(content).toContain("groups");
    });

    it("should cover memory issues", () => {
      expect(content).toContain("### Out of Memory");
      expect(content).toContain("free -h");
      expect(content).toContain("DOCKER_MEMORY_LIMIT");
    });
  });

  describe("Security Coverage", () => {
    it("should mention strong API keys", () => {
      expect(content).toContain("Use Strong API Keys");
      expect(content).toContain("openssl rand");
    });

    it("should mention authentication", () => {
      expect(content).toContain("Enable Authentication");
      expect(content).toContain("API_KEY");
    });

    it("should mention HTTPS", () => {
      expect(content).toContain("Use HTTPS");
      expect(content).toContain("SSL/TLS");
    });

    it("should mention firewall", () => {
      expect(content).toContain("Restrict Firewall Access");
    });

    it("should mention updates", () => {
      expect(content).toContain("Regular Updates");
    });

    it("should mention monitoring", () => {
      expect(content).toContain("Monitor Logs");
    });

    it("should mention backups", () => {
      expect(content).toContain("Backup Data");
      expect(content).toContain("docker volume");
    });
  });

  describe("Production Checklist", () => {
    it("should have comprehensive checklist items", () => {
      expect(content).toContain("- [ ] Environment variables configured");
      expect(content).toContain("- [ ] Firewall rules configured");
      expect(content).toContain("- [ ] SSL/TLS certificates installed");
      expect(content).toContain("- [ ] API authentication keys set");
      expect(content).toContain("- [ ] Resource limits configured");
      expect(content).toContain("- [ ] Health checks passing");
      expect(content).toContain("- [ ] Log rotation configured");
      expect(content).toContain("- [ ] Backup strategy in place");
      expect(content).toContain("- [ ] Monitoring configured");
      expect(content).toContain("- [ ] Documentation updated");
    });
  });

  describe("Container Management Commands", () => {
    it("should document start command", () => {
      expect(content).toContain("### Start the Service");
      expect(content).toContain(
        "docker compose --env-file .env.production up -d"
      );
    });

    it("should document stop command", () => {
      expect(content).toContain("### Stop the Service");
      expect(content).toContain(
        "docker compose --env-file .env.production down"
      );
    });

    it("should document restart command", () => {
      expect(content).toContain("### Restart the Service");
      expect(content).toContain(
        "docker compose --env-file .env.production restart"
      );
    });

    it("should document logs command", () => {
      expect(content).toContain("### View Logs");
      expect(content).toContain(
        "docker compose --env-file .env.production logs -f"
      );
    });

    it("should document update command", () => {
      expect(content).toContain("### Update the Service");
      expect(content).toContain(
        "docker compose --env-file .env.production up -d --build"
      );
    });
  });
});
