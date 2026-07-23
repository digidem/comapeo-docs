/**
 * Tests for verify-generated-content-policy script
 *
 * These tests exercise the REAL implementation by importing it directly.
 * Importing the module is safe here: its top-level `main()` call is guarded
 * by `if (import.meta.main)`, which is false for imported modules under
 * vitest, so no git commands run at import time.
 */

import { describe, it, expect, vi } from "vitest";

// The policy script imports `$` from Bun's shell. Under vitest's Node
// runtime there is no installable "bun" package, so mock the module. The
// mock is never actually invoked: these tests only exercise isAllowedFile
// and GENERATED_DIRECTORIES, and main() (the sole caller of $) is guarded
// by `import.meta.main`, which is false for imported modules.
vi.mock("bun", () => ({
  $: () => {
    throw new Error("bun shell is not available under vitest");
  },
}));

import {
  GENERATED_DIRECTORIES,
  isAllowedFile,
} from "./verify-generated-content-policy";

const docsConfig = GENERATED_DIRECTORIES.find((d) => d.path === "docs")!;
const i18nConfig = GENERATED_DIRECTORIES.find((d) => d.path === "i18n")!;
const imagesConfig = GENERATED_DIRECTORIES.find(
  (d) => d.path === "static/images"
)!;

describe("verify-generated-content-policy", () => {
  describe("isAllowedFile", () => {
    it("should allow .gitkeep files in docs directory", () => {
      expect(isAllowedFile("docs/.gitkeep", docsConfig.allowedPatterns)).toBe(
        true
      );
    });

    it("should allow .gitkeep files in i18n directory", () => {
      expect(isAllowedFile("i18n/.gitkeep", i18nConfig.allowedPatterns)).toBe(
        true
      );
    });

    it("should allow code.json files in i18n directory", () => {
      expect(
        isAllowedFile("i18n/es/code.json", i18nConfig.allowedPatterns)
      ).toBe(true);
      expect(
        isAllowedFile("i18n/pt/code.json", i18nConfig.allowedPatterns)
      ).toBe(true);
    });

    it("should allow .emoji-cache.json in static/images directory", () => {
      expect(
        isAllowedFile(
          "static/images/.emoji-cache.json",
          imagesConfig.allowedPatterns
        )
      ).toBe(true);
    });

    it("should allow developer-tools files but reject other content in docs directory", () => {
      expect(
        isAllowedFile(
          "docs/developer-tools/api-reference.md",
          docsConfig.allowedPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "docs/developer-tools/cli-reference.md",
          docsConfig.allowedPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "docs/developer-tools/_category_.json",
          docsConfig.allowedPatterns
        )
      ).toBe(true);
      // Non-developer-tools content should still be rejected
      expect(
        isAllowedFile("docs/introduction.md", docsConfig.allowedPatterns)
      ).toBe(false);
      expect(
        isAllowedFile("docs/user-guide.md", docsConfig.allowedPatterns)
      ).toBe(false);
    });

    it("should reject content translation files in i18n directory", () => {
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-plugin-content-docs/current/api-reference.md",
          i18nConfig.allowedPatterns
        )
      ).toBe(false);
    });

    it("should reject image files in static/images directory", () => {
      expect(
        isAllowedFile(
          "static/images/notion/test.png",
          imagesConfig.allowedPatterns
        )
      ).toBe(false);
    });
  });

  describe("theme translation file exceptions", () => {
    const i18nPatterns = i18nConfig.allowedPatterns;

    it("should allow the hand-maintained docusaurus-theme-classic navbar/footer files", () => {
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-theme-classic/navbar.json",
          i18nPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-theme-classic/footer.json",
          i18nPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "i18n/pt/docusaurus-theme-classic/navbar.json",
          i18nPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "i18n/pt/docusaurus-theme-classic/footer.json",
          i18nPatterns
        )
      ).toBe(true);
    });

    it("should reject neighboring theme files that are not navbar/footer", () => {
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-theme-classic/other.json",
          i18nPatterns
        )
      ).toBe(false);
    });

    it("should still allow code.json alongside the theme exceptions", () => {
      expect(isAllowedFile("i18n/es/code.json", i18nPatterns)).toBe(true);
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
      // Three patterns: .gitkeep, code.json, and the theme navbar/footer
      // exception. RegExp instances can't be compared by reference, so assert
      // the count here and validate behavior via sample paths.
      expect(i18nConfig?.allowedPatterns).toHaveLength(3);
      expect(isAllowedFile("i18n/.gitkeep", i18nConfig!.allowedPatterns)).toBe(
        true
      );
      expect(
        isAllowedFile("i18n/es/code.json", i18nConfig!.allowedPatterns)
      ).toBe(true);
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-theme-classic/navbar.json",
          i18nConfig!.allowedPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-theme-classic/footer.json",
          i18nConfig!.allowedPatterns
        )
      ).toBe(true);
      expect(
        isAllowedFile(
          "i18n/es/docusaurus-theme-classic/other.json",
          i18nConfig!.allowedPatterns
        )
      ).toBe(false);
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

  describe("Policy compliance scenarios", () => {
    it("should be compliant when only .gitkeep and developer-tools files are present", () => {
      const files = [
        "docs/.gitkeep",
        "docs/developer-tools/api-reference.md",
        "docs/developer-tools/cli-reference.md",
        "docs/developer-tools/_category_.json",
      ];
      const violations = files.filter(
        (file) => !isAllowedFile(file, docsConfig.allowedPatterns)
      );

      expect(violations).toHaveLength(0);
    });

    it("should detect violations when non-developer-tools content files are present", () => {
      const files = [
        "docs/.gitkeep",
        "docs/developer-tools/api-reference.md",
        "docs/introduction.md",
        "docs/user-guide.md",
      ];
      const violations = files.filter(
        (file) => !isAllowedFile(file, docsConfig.allowedPatterns)
      );

      expect(violations).toHaveLength(2);
      expect(violations).toContain("docs/introduction.md");
      expect(violations).toContain("docs/user-guide.md");
    });

    it("should allow code.json and theme files in i18n but not content files", () => {
      const files = [
        "i18n/es/code.json",
        "i18n/pt/code.json",
        "i18n/es/docusaurus-theme-classic/navbar.json",
        "i18n/pt/docusaurus-theme-classic/footer.json",
        "i18n/es/docusaurus-plugin-content-docs/current/intro.md",
      ];
      const violations = files.filter(
        (file) => !isAllowedFile(file, i18nConfig.allowedPatterns)
      );

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

      for (const file of developerToolsFiles) {
        expect(isAllowedFile(file, docsConfig.allowedPatterns)).toBe(true);
      }
    });
  });
});
