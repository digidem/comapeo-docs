import { describe, it, expect, vi } from "vitest";

// Mock the docusaurus config before importing the module under test,
// mirroring the pattern used in generateBlocks.test.ts.
vi.mock("../../docusaurus.config", () => ({
  default: {
    i18n: {
      locales: ["en", "pt", "es"],
      defaultLocale: "en",
    },
  },
}));

import { normalizeInternalDocLinks } from "./linkNormalizer";

describe("linkNormalizer", () => {
  describe("normalizeInternalDocLinks", () => {
    it("should normalize a docs link for the default locale (en) without a locale prefix", () => {
      const input = "[link](/docs/Guía Rápida)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe("[link](/docs/guia-rapida)");
    });

    it("should add a locale prefix for a non-default locale (es)", () => {
      const input = "[link](/docs/Guía Rápida)";
      const result = normalizeInternalDocLinks(input, "es");
      expect(result).toBe("[link](/es/docs/guia-rapida)");
    });

    it("should normalize both the path and the fragment", () => {
      const input = "[link](/docs/Page#Título Uno)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe("[link](/docs/page#titulo-uno)");
    });

    it("should leave external links untouched", () => {
      const input = "[link](https://example.com/Árbol)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });

    it("should leave relative links untouched", () => {
      const input = "[link](./local)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });

    it("should not alter image links (lines starting with !)", () => {
      const input = "![img](/docs/Accented Page)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });

    it("should flatten a nested docs path to only the last segment (slug shape)", () => {
      const input = "[link](/docs/Category Name/Sub Page)";
      const result = normalizeInternalDocLinks(input, "pt");
      // buildFrontmatter() writes slug: /${safeSlug} (single level), so the
      // public URL is /pt/docs/sub-page, not /pt/docs/category-name/sub-page.
      expect(result).toBe("[link](/pt/docs/sub-page)");
    });

    it("should not rewrite links inside a fenced code block", () => {
      const input = "```\n[example](/docs/Guía Rápida)\n```";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });

    it("should not rewrite links inside an indented fenced code block", () => {
      const input = "  ```\n  [example](/docs/Guía Rápida)\n  ```";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });

    it("should not rewrite links inside inline code", () => {
      const input = "Use `[link](/docs/Guía Rápida)` as an example.";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });

    it("should normalize multiple docs links on a single line", () => {
      const input = "[a](/docs/Foo) and [b](/docs/Bar)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe("[a](/docs/foo) and [b](/docs/bar)");
    });

    it("should return empty string for empty content", () => {
      const result = normalizeInternalDocLinks("", "en");
      expect(result).toBe("");
    });

    it("should leave plain text with only external links unchanged", () => {
      const input = "plain text with [link](https://example.com)";
      const result = normalizeInternalDocLinks(input, "en");
      expect(result).toBe(input);
    });
  });
});
