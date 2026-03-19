import { describe, it, expect } from "vitest";
import { createSafeSlug } from "./slugUtils";

describe("slugUtils", () => {
  describe("createSafeSlug", () => {
    it("should convert basic Latin text to lowercase hyphenated slug", () => {
      expect(createSafeSlug("Hello World")).toBe("hello-world");
    });

    it("should strip accented Latin characters", () => {
      expect(createSafeSlug("Título con acentos")).toBe("titulo-con-acentos");
    });

    it("should handle Spanish accented characters", () => {
      expect(createSafeSlug("Guía Rápida")).toBe("guia-rapida");
    });

    it("should handle Portuguese characters", () => {
      expect(createSafeSlug("Instalação")).toBe("instalacao");
    });

    it("should handle ñ and accented vowels in Spanish words", () => {
      expect(createSafeSlug("Niño & Acción")).toBe("nino-accion");
    });

    it("should return an empty string for empty input", () => {
      expect(createSafeSlug("")).toBe("");
    });

    it("should strip diacritics from accented letters", () => {
      expect(createSafeSlug("éàü")).toBe("eau");
    });

    it("should preserve numbers in the slug", () => {
      expect(createSafeSlug("FAQ Section 2")).toBe("faq-section-2");
    });

    it("should collapse multiple spaces and hyphens into a single hyphen", () => {
      expect(createSafeSlug("hello   ---  world")).toBe("hello-world");
    });

    it("should strip leading and trailing hyphens", () => {
      expect(createSafeSlug("--hello--")).toBe("hello");
    });

    it("should produce an empty string for CJK-only input (known limitation)", () => {
      expect(createSafeSlug("安装指南")).toBe("");
    });

    it("should extract only the Latin portion from mixed CJK and Latin input", () => {
      expect(createSafeSlug("安装 Setup 指南")).toBe("setup");
    });
  });
});
