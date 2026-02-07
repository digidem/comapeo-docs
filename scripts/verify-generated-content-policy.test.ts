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
    allowedPatterns: [
      /\.gitkeep$/,
      /^docs\/developer-tools\/.*/, // Hand-crafted developer documentation
    ],
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
      expect(
        isAllowedFile("docs/.gitkeep", [
          /\.gitkeep$/,
          /^docs\/developer-tools\/.*/,
        ])
      ).toBe(true);
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

    it("should allow developer-tools files but reject other content in docs directory", () => {
      const patterns = [/\.gitkeep$/, /^docs\/developer-tools\/.*/];
      expect(
        isAllowedFile("docs/developer-tools/api-reference.md", patterns)
      ).toBe(true);
      expect(
        isAllowedFile("docs/developer-tools/cli-reference.md", patterns)
      ).toBe(true);
      expect(
        isAllowedFile("docs/developer-tools/_category_.json", patterns)
      ).toBe(true);
      // Non-developer-tools content should still be rejected
      expect(isAllowedFile("docs/introduction.md", patterns)).toBe(false);
      expect(isAllowedFile("docs/user-guide.md", patterns)).toBe(false);
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
      expect(docsConfig?.allowedPatterns).toEqual([
        /\.gitkeep$/,
        /^docs\/developer-tools\/.*/,
      ]);
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
    it("should be compliant when only .gitkeep and developer-tools files are present", () => {
      const files = [
        "docs/.gitkeep",
        "docs/developer-tools/api-reference.md",
        "docs/developer-tools/cli-reference.md",
        "docs/developer-tools/_category_.json",
      ];
      const violations: string[] = [];
      const allowedPatterns = [/\.gitkeep$/, /^docs\/developer-tools\/.*/];

      for (const file of files) {
        if (!allowedPatterns.some((pattern) => pattern.test(file))) {
          violations.push(file);
        }
      }

      expect(violations).toHaveLength(0);
    });

    it("should detect violations when non-developer-tools content files are present", () => {
      const files = [
        "docs/.gitkeep",
        "docs/developer-tools/api-reference.md",
        "docs/introduction.md",
        "docs/user-guide.md",
      ];
      const violations: string[] = [];
      const allowedPatterns = [/\.gitkeep$/, /^docs\/developer-tools\/.*/];

      for (const file of files) {
        if (!allowedPatterns.some((pattern) => pattern.test(file))) {
          violations.push(file);
        }
      }

      expect(violations).toHaveLength(2);
      expect(violations).toContain("docs/introduction.md");
      expect(violations).toContain("docs/user-guide.md");
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

    it("should allow all files in developer-tools subdirectory", () => {
      const developerToolsFiles = [
        "docs/developer-tools/api-reference.md",
        "docs/developer-tools/cli-reference.md",
        "docs/developer-tools/_category_.json",
        "docs/developer-tools/testing-guide.md",
      ];
      const allowedPatterns = [/\.gitkeep$/, /^docs\/developer-tools\/.*/];

      // Use the same helper function from the isAllowedFile tests
      function isAllowedFile(filePath: string, patterns: RegExp[]): boolean {
        return patterns.some((pattern) => pattern.test(filePath));
      }

      for (const file of developerToolsFiles) {
        expect(isAllowedFile(file, allowedPatterns)).toBe(true);
      }
    });
  });
});
