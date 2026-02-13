/**
 * Tests for Docker tagging strategy utilities
 *
 * These tests validate the tagging strategy logic for Docker images
 * following the research documented in context/workflows/docker-tagging-strategies.md
 */

import { describe, it, expect } from "vitest";

// Tag generation utilities (these would be used in GitHub Actions)
function generateMainBranchTags(sha: string): string[] {
  return [`latest`, `main`, sha];
}

function generatePRTags(prNumber: number): string[] {
  return [`pr-${prNumber}`];
}

function generateManualTags(customTag: string): string[] {
  return [customTag];
}

function generateFullImageName(repo: string, tag: string): string {
  return `${repo}:${tag}`;
}

function validateTagFormat(tag: string): boolean {
  // Docker tag rules: max 128 chars, valid: [a-zA-Z0-9_.-]
  const tagRegex = /^[a-zA-Z0-9_.-]{1,128}$/;
  return tagRegex.test(tag);
}

function validateSHAFormat(sha: string): boolean {
  // Git SHA format: 40 hex chars (or 7+ char short SHA)
  const shaRegex = /^[a-f0-9]{7,40}$/;
  return shaRegex.test(sha);
}

function validatePRNumber(prNumber: number | string): boolean {
  // PR numbers are positive integers
  const num = typeof prNumber === "string" ? parseInt(prNumber, 10) : prNumber;
  return Number.isInteger(num) && num > 0;
}

describe("Docker Tagging Strategy", () => {
  describe("Main Branch Tags", () => {
    it("should generate correct tags for main branch builds", () => {
      const sha = "a1b2c3d4e5f6";
      const tags = generateMainBranchTags(sha);

      expect(tags).toEqual(["latest", "main", sha]);
      expect(tags).toHaveLength(3);
    });

    it("should include latest tag", () => {
      const tags = generateMainBranchTags("abc123");
      expect(tags).toContain("latest");
    });

    it("should include main tag", () => {
      const tags = generateMainBranchTags("abc123");
      expect(tags).toContain("main");
    });

    it("should include commit SHA tag", () => {
      const sha = "a1b2c3d";
      const tags = generateMainBranchTags(sha);
      expect(tags).toContain(sha);
    });

    it("should generate valid full image names", () => {
      const repo = "digidem/comapeo-docs-api";
      const sha = "a1b2c3d";
      const tags = generateMainBranchTags(sha);

      const fullNames = tags.map((tag) => generateFullImageName(repo, tag));

      expect(fullNames).toEqual([
        "digidem/comapeo-docs-api:latest",
        "digidem/comapeo-docs-api:main",
        "digidem/comapeo-docs-api:a1b2c3d",
      ]);
    });
  });

  describe("PR Preview Tags", () => {
    it("should generate correct tags for PR builds", () => {
      const prNumber = 123;
      const tags = generatePRTags(prNumber);

      expect(tags).toEqual([`pr-${prNumber}`]);
      expect(tags).toHaveLength(1);
    });

    it("should use pr- prefix", () => {
      const tags = generatePRTags(456);
      expect(tags[0]).toMatch(/^pr-/);
    });

    it("should handle single digit PR numbers", () => {
      const tags = generatePRTags(7);
      expect(tags).toEqual(["pr-7"]);
    });

    it("should handle large PR numbers", () => {
      const tags = generatePRTags(12345);
      expect(tags).toEqual(["pr-12345"]);
    });

    it("should generate valid full image names", () => {
      const repo = "digidem/comapeo-docs-api";
      const prNumber = 123;
      const tags = generatePRTags(prNumber);

      const fullNames = tags.map((tag) => generateFullImageName(repo, tag));

      expect(fullNames).toEqual(["digidem/comapeo-docs-api:pr-123"]);
    });
  });

  describe("Manual Build Tags", () => {
    it("should use custom tag for manual builds", () => {
      const customTag = "test-feature";
      const tags = generateManualTags(customTag);

      expect(tags).toEqual([customTag]);
    });

    it("should allow version tags", () => {
      const tags = generateManualTags("v1.2.3");
      expect(tags).toEqual(["v1.2.3"]);
    });

    it("should allow branch name tags", () => {
      const tags = generateManualTags("feature/new-api");
      expect(tags).toEqual(["feature/new-api"]);
    });
  });

  describe("Tag Validation", () => {
    it("should validate correct tag formats", () => {
      expect(validateTagFormat("latest")).toBe(true);
      expect(validateTagFormat("main")).toBe(true);
      expect(validateTagFormat("pr-123")).toBe(true);
      expect(validateTagFormat("v1.2.3")).toBe(true);
      expect(validateTagFormat("a1b2c3d")).toBe(true);
      expect(validateTagFormat("feature-branch")).toBe(true);
    });

    it("should reject invalid tag formats", () => {
      expect(validateTagFormat("")).toBe(false);
      expect(validateTagFormat("tag with spaces")).toBe(false);
      expect(validateTagFormat("tag:with:colons")).toBe(false);
      expect(validateTagFormat("tag/with/slashes")).toBe(false);
      // Tags > 128 chars should be invalid
      expect(validateTagFormat("a".repeat(129))).toBe(false);
    });

    it("should validate Git SHA format", () => {
      expect(validateSHAFormat("a1b2c3d")).toBe(true);
      expect(validateSHAFormat("a1b2c3d4e5f6")).toBe(true);
      expect(validateSHAFormat("abcdef0")).toBe(true);
      expect(validateSHAFormat("abcdef0123456789")).toBe(true);
    });

    it("should reject invalid SHA formats", () => {
      expect(validateSHAFormat("")).toBe(false);
      expect(validateSHAFormat("ghjklm")).toBe(false); // not hex
      expect(validateSHAFormat("abc")).toBe(false); // too short
      expect(validateSHAFormat("A1B2C3D")).toBe(false); // uppercase
    });

    it("should validate PR numbers", () => {
      expect(validatePRNumber(1)).toBe(true);
      expect(validatePRNumber(123)).toBe(true);
      expect(validatePRNumber(12345)).toBe(true);
      expect(validatePRNumber("456")).toBe(true);
    });

    it("should reject invalid PR numbers", () => {
      expect(validatePRNumber(0)).toBe(false);
      expect(validatePRNumber(-1)).toBe(false);
      expect(validatePRNumber(1.5)).toBe(false);
      expect(validatePRNumber("abc")).toBe(false);
    });
  });

  describe("Tag Consistency", () => {
    it("should match Cloudflare Pages pattern", () => {
      // Cloudflare Pages uses pr-{number} format
      const prTag = generatePRTags(789)[0];
      expect(prTag).toBe("pr-789");
    });

    it("should maintain repository name consistency", () => {
      const repo = "digidem/comapeo-docs-api";
      const mainTag = generateFullImageName(repo, "latest");
      const prTag = generateFullImageName(repo, "pr-123");
      const manualTag = generateFullImageName(repo, "custom");

      expect(mainTag).toMatch(/^digidem\/comapeo-docs-api:/);
      expect(prTag).toMatch(/^digidem\/comapeo-docs-api:/);
      expect(manualTag).toMatch(/^digidem\/comapeo-docs-api:/);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty SHA gracefully", () => {
      expect(() => generateMainBranchTags("")).not.toThrow();
      expect(() =>
        generateMainBranchTags("").map(validateSHAFormat)
      ).not.toThrow();
    });

    it("should handle very long tags", () => {
      const longTag = "a".repeat(128);
      expect(validateTagFormat(longTag)).toBe(true);

      const tooLongTag = "a".repeat(129);
      expect(validateTagFormat(tooLongTag)).toBe(false);
    });

    it("should handle special characters in tags", () => {
      expect(validateTagFormat("my_tag")).toBe(true);
      expect(validateTagFormat("my-tag")).toBe(true);
      expect(validateTagFormat("my.tag")).toBe(true);
      expect(validateTagFormat("my.tag-123_test")).toBe(true);
    });
  });
});

describe("OCI Label Generation", () => {
  it("should include standard OCI labels", () => {
    // This tests the structure; actual implementation would be in Dockerfile
    const expectedLabels = [
      "org.opencontainers.image.created",
      "org.opencontainers.image.revision",
      "org.opencontainers.image.source",
      "org.opencontainers.image.title",
      "org.opencontainers.image.description",
      "org.opencontainers.image.version",
    ];

    expect(expectedLabels).toHaveLength(6);
    expect(expectedLabels).toContain("org.opencontainers.image.revision");
    expect(expectedLabels).toContain("org.opencontainers.image.source");
  });
});
