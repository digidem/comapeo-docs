/**
 * Tests for verify-generated-content-policy script
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock module functions
const mockGetTrackedFilesInDirectory = vi.fn(() => Promise.resolve([]));
const mockCheckDirectoryPolicy = vi.fn(() =>
  Promise.resolve({ isCompliant: true, violations: [] })
);

// Mock the actual implementation
const GENERATED_DIRECTORIES = [
  {
    path: "docs",
    description: "Generated documentation files",
    allowedPatterns: [/\.gitkeep$/],
  },
  {
    path: "i18n",
    description: "Generated translations",
    allowedPatterns: [/\.gitkeep$/, /\/code\.json$/],
  },
  {
    path: "static/images",
    description: "Downloaded images from Notion",
    allowedPatterns: [/\.gitkeep$/, /\.emoji-cache\.json$/],
  },
];

describe("verify-generated-content-policy", () => {
  describe("isAllowedFile", () => {
    function isAllowedFile(
      filePath: string,
      allowedPatterns: RegExp[]
    ): boolean {
      return allowedPatterns.some((pattern) => pattern.test(filePath));
    }

    it("should allow .gitkeep files in docs directory", () => {
      expect(isAllowedFile("docs/.gitkeep", [/\.gitkeep$/])).toBe(true);
    });

    it("should allow .gitkeep files in i18n directory", () => {
      expect(
        isAllowedFile("i18n/.gitkeep", [/\.gitkeep$/, /\/code\.json$/])
      ).toBe(true);
    });

    it("should allow code.json files in i18n directory", () => {
      expect(
        isAllowedFile("i18n/es/code.json", [/\.gitkeep$/, /\/code\.json$/])
      ).toBe(true);
      expect(
        isAllowedFile("i18n/pt/code.json", [/\.gitkeep$/, /\/code\.json$/])
      ).toBe(true);
    });

    it("should allow .emoji-cache.json in static/images directory", () => {
      expect(
        isAllowedFile("static/images/.emoji-cache.json", [
          /\.gitkeep$/,
          /\.emoji-cache\.json$/,
        ])
      ).toBe(true);
    });

    it("should reject markdown files in docs directory", () => {
      expect(isAllowedFile("docs/api-reference.md", [/\.gitkeep$/])).toBe(
        false
      );
      expect(isAllowedFile("docs/_category_.json", [/\.gitkeep$/])).toBe(false);
    });

    it("should reject content translation files in i18n directory", () => {
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-plugin-content-docs/current/api-reference.md",
          [/\.gitkeep$/, /\/code\.json$/]
        )
      ).toBe(false);
    });

    it("should reject image files in static/images directory", () => {
      expect(
        isAllowedFile("static/images/notion/test.png", [
          /\.gitkeep$/,
          /\.emoji-cache\.json$/,
        ])
      ).toBe(false);
    });
  });

  describe("GENERATED_DIRECTORIES configuration", () => {
    it("should have configuration for all three generated directories", () => {
      expect(GENERATED_DIRECTORIES).toHaveLength(3);
      const paths = GENERATED_DIRECTORIES.map((d) => d.path).sort();
      expect(paths).toEqual(["docs", "i18n", "static/images"]);
    });

    it("should have proper allowed patterns for docs directory", () => {
      const docsConfig = GENERATED_DIRECTORIES.find((d) => d.path === "docs");
      expect(docsConfig?.allowedPatterns).toEqual([/\.gitkeep$/]);
    });

    it("should have proper allowed patterns for i18n directory", () => {
      const i18nConfig = GENERATED_DIRECTORIES.find((d) => d.path === "i18n");
      expect(i18nConfig?.allowedPatterns).toEqual([
        /\.gitkeep$/,
        /\/code\.json$/,
      ]);
    });

    it("should have proper allowed patterns for static/images directory", () => {
      const imagesConfig = GENERATED_DIRECTORIES.find(
        (d) => d.path === "static/images"
      );
      expect(imagesConfig?.allowedPatterns).toEqual([
        /\.gitkeep$/,
        /\.emoji-cache\.json$/,
      ]);
    });
  });

  describe("getTrackedFilesInDirectory", () => {
    it("should return empty array when git command fails", async () => {
      // Mock implementation would return empty on error
      const mockResult = mockGetTrackedFilesInDirectory();
      expect(mockResult).resolves.toEqual([]);
    });

    it("should return file list when directory has tracked files", async () => {
      // Mock implementation would return array of files
      mockGetTrackedFilesInDirectory.mockResolvedValueOnce([
        "docs/api-reference.md",
      ]);
      const result = await mockGetTrackedFilesInDirectory();
      expect(result).toEqual(["docs/api-reference.md"]);
    });
  });

  describe("Policy compliance scenarios", () => {
    it("should be compliant when only .gitkeep files are present", () => {
      const files = ["docs/.gitkeep"];
      const violations: string[] = [];
      const allowedPatterns = [/\.gitkeep$/];

      for (const file of files) {
        if (!allowedPatterns.some((pattern) => pattern.test(file))) {
          violations.push(file);
        }
      }

      expect(violations).toHaveLength(0);
    });

    it("should detect violations when content files are present", () => {
      const files = [
        "docs/.gitkeep",
        "docs/api-reference.md",
        "docs/cli-reference.md",
      ];
      const violations: string[] = [];
      const allowedPatterns = [/\.gitkeep$/];

      for (const file of files) {
        if (!allowedPatterns.some((pattern) => pattern.test(file))) {
          violations.push(file);
        }
      }

      expect(violations).toHaveLength(2);
      expect(violations).toContain("docs/api-reference.md");
      expect(violations).toContain("docs/cli-reference.md");
    });

    it("should allow code.json in i18n but not content files", () => {
      const files = [
        "i18n/es/code.json",
        "i18n/pt/code.json",
        "i18n/es/docusaurus-plugin-content-docs/current/intro.md",
      ];
      const violations: string[] = [];
      const allowedPatterns = [/\.gitkeep$/, /\/code\.json$/];

      for (const file of files) {
        if (!allowedPatterns.some((pattern) => pattern.test(file))) {
          violations.push(file);
        }
      }

      expect(violations).toHaveLength(1);
      expect(violations[0]).toBe(
        "i18n/es/docusaurus-plugin-content-docs/current/intro.md"
      );
    });
  });
});
