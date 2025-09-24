import { describe, it, expect } from "vitest";
import {
  ContentGenerator,
  ContentType,
  ContentLength,
} from "./contentGenerator";

describe("ContentGenerator", () => {
  describe("detectContentType", () => {
    it("should detect intro content type", () => {
      expect(
        ContentGenerator.detectContentType("Introduction to CoMapeo")
      ).toBe("intro");
      expect(ContentGenerator.detectContentType("Overview of Features")).toBe(
        "intro"
      );
      expect(ContentGenerator.detectContentType("About CoMapeo")).toBe("intro");
      expect(ContentGenerator.detectContentType("Getting Started")).toBe(
        "intro"
      );
    });

    it("should detect tutorial content type", () => {
      expect(ContentGenerator.detectContentType("Quick Start Tutorial")).toBe(
        "tutorial"
      );
      expect(ContentGenerator.detectContentType("Step by Step Guide")).toBe(
        "tutorial"
      );
      expect(ContentGenerator.detectContentType("How to Setup CoMapeo")).toBe(
        "tutorial"
      );
      expect(
        ContentGenerator.detectContentType("Installation Walkthrough")
      ).toBe("tutorial");
    });

    it("should detect reference content type", () => {
      expect(ContentGenerator.detectContentType("API Reference")).toBe(
        "reference"
      );
      expect(ContentGenerator.detectContentType("Documentation Index")).toBe(
        "reference"
      );
      expect(ContentGenerator.detectContentType("Technical Spec")).toBe(
        "reference"
      );
    });

    it("should detect troubleshooting content type", () => {
      expect(
        ContentGenerator.detectContentType("Troubleshooting Common Issues")
      ).toBe("troubleshooting");
      expect(
        ContentGenerator.detectContentType("Known Issues and Workarounds")
      ).toBe("troubleshooting");
      expect(ContentGenerator.detectContentType("Error Messages")).toBe(
        "troubleshooting"
      );
      expect(
        ContentGenerator.detectContentType("Fix Installation Problems")
      ).toBe("troubleshooting");
      expect(
        ContentGenerator.detectContentType("Debug Connection Issues")
      ).toBe("troubleshooting");
    });

    it("should default to general for unrecognized titles", () => {
      expect(ContentGenerator.detectContentType("Some Feature")).toBe(
        "general"
      );
      expect(ContentGenerator.detectContentType("")).toBe("general");
      expect(ContentGenerator.detectContentType("Configuration Options")).toBe(
        "general"
      );
      expect(ContentGenerator.detectContentType("FAQ")).toBe("general");
    });

    it("should handle case insensitive matching", () => {
      expect(ContentGenerator.detectContentType("TUTORIAL Guide")).toBe(
        "tutorial"
      );
      expect(ContentGenerator.detectContentType("api REFERENCE")).toBe(
        "reference"
      );
      expect(ContentGenerator.detectContentType("TROUBLESHOOT Issues")).toBe(
        "troubleshooting"
      );
    });
  });

  describe("generateContent", () => {
    it("should generate content for all types", () => {
      const types: ContentType[] = [
        "intro",
        "tutorial",
        "reference",
        "troubleshooting",
        "general",
      ];
      const lengths: ContentLength[] = ["short", "medium", "long"];

      types.forEach((type) => {
        lengths.forEach((length) => {
          const result = ContentGenerator.generateContent({ type, length });
          expect(Array.isArray(result)).toBe(true);
          expect(result.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("generateCompletePage", () => {
    it("should generate complete page with title", () => {
      const result = ContentGenerator.generateCompletePage({
        type: "intro",
        length: "medium",
        title: "Test Page",
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should generate different content for different types", () => {
      const intro = ContentGenerator.generateCompletePage({
        type: "intro",
        length: "medium",
        title: "Test Intro",
      });

      const tutorial = ContentGenerator.generateCompletePage({
        type: "tutorial",
        length: "medium",
        title: "Test Tutorial",
      });

      expect(intro.length).toBeGreaterThan(0);
      expect(tutorial.length).toBeGreaterThan(0);
      // Content should be different
      expect(JSON.stringify(intro)).not.toBe(JSON.stringify(tutorial));
    });

    it("should handle empty title gracefully", () => {
      const result = ContentGenerator.generateCompletePage({
        type: "general",
        length: "medium",
        title: "",
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should generate valid Notion block structure", () => {
      const blocks = ContentGenerator.generateCompletePage({
        type: "intro",
        length: "medium",
        title: "Test Documentation",
      });

      blocks.forEach((block) => {
        expect(block).toHaveProperty("type");
        expect(typeof block.type).toBe("string");
      });
    });

    it("should respect content length parameter", () => {
      const shortContent = ContentGenerator.generateCompletePage({
        type: "intro",
        length: "short",
        title: "Short Test",
      });

      const longContent = ContentGenerator.generateCompletePage({
        type: "intro",
        length: "long",
        title: "Long Test",
      });

      expect(shortContent.length).toBeGreaterThan(0);
      expect(longContent.length).toBeGreaterThan(0);
      // Long content should generally have more blocks than short
      expect(longContent.length).toBeGreaterThanOrEqual(shortContent.length);
    });
  });

  describe("language support", () => {
    it("should generate content for different languages", () => {
      const englishContent = ContentGenerator.generateContent({
        type: "intro",
        length: "medium",
        language: "English",
      });

      const spanishContent = ContentGenerator.generateContent({
        type: "intro",
        length: "medium",
        language: "Spanish",
      });

      expect(englishContent.length).toBeGreaterThan(0);
      expect(spanishContent.length).toBeGreaterThan(0);
    });
  });
});
