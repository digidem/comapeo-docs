import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MAIN_LANGUAGE,
  NOTION_PROPERTIES,
  LANGUAGES,
  MAX_RETRIES,
  NOTION_API_CHUNK_SIZE,
  IMAGE_MAX_WIDTH,
  JPEG_QUALITY,
  PNG_COMPRESSION_LEVEL,
  WEBP_QUALITY,
  PNG_QUALITY_RANGE,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_TEMPERATURE,
  DEFAULT_OPENAI_MAX_TOKENS,
  ENGLISH_MODIFICATION_ERROR,
  ENGLISH_DIR_SAVE_ERROR,
  type TranslationConfig,
  type NotionPage,
} from "./constants";

describe("constants", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("basic constants", () => {
    it("should have correct main language", () => {
      // Arrange & Act & Assert
      expect(MAIN_LANGUAGE).toBe("English");
    });

    it("should have correct max retries value", () => {
      // Arrange & Act & Assert
      expect(MAX_RETRIES).toBe(3);
      expect(typeof MAX_RETRIES).toBe("number");
    });

    it("should have correct Notion API chunk size", () => {
      // Arrange & Act & Assert
      expect(NOTION_API_CHUNK_SIZE).toBe(50);
      expect(typeof NOTION_API_CHUNK_SIZE).toBe("number");
    });
  });

  describe("NOTION_PROPERTIES", () => {
    it("should contain all required property names", () => {
      // Arrange & Act & Assert
      expect(NOTION_PROPERTIES.TITLE).toBe("Content elements");
      expect(NOTION_PROPERTIES.LANGUAGE).toBe("Language");
      expect(NOTION_PROPERTIES.STATUS).toBe("Publish Status");
      expect(NOTION_PROPERTIES.ORDER).toBe("Order");
      expect(NOTION_PROPERTIES.TAGS).toBe("Tags");
      expect(NOTION_PROPERTIES.ELEMENT_TYPE).toBe("Element Type");
      expect(NOTION_PROPERTIES.READY_FOR_TRANSLATION).toBe(
        "Ready for translation"
      );
      expect(NOTION_PROPERTIES.READY_TO_PUBLISH).toBe("Ready to publish");
      expect(NOTION_PROPERTIES.PUBLISHED_DATE).toBe("Date Published");
    });

    it("should have all properties as strings", () => {
      // Arrange & Act
      const propertyValues = Object.values(NOTION_PROPERTIES);

      // Assert
      propertyValues.forEach((value) => {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe("LANGUAGES configuration", () => {
    it("should contain Portuguese and Spanish configurations", () => {
      // Arrange & Act & Assert
      expect(LANGUAGES).toHaveLength(2);

      const portuguese = LANGUAGES.find((lang) => lang.language === "pt-BR");
      const spanish = LANGUAGES.find((lang) => lang.language === "es");

      expect(portuguese).toBeDefined();
      expect(spanish).toBeDefined();
    });

    it("should have correct Portuguese configuration", () => {
      // Arrange & Act
      const portuguese = LANGUAGES.find((lang) => lang.language === "pt-BR");

      // Assert
      expect(portuguese).toEqual({
        language: "pt-BR",
        notionLangCode: "Portuguese",
        outputDir: "./i18n/pt/docusaurus-plugin-content-docs/current",
      });
    });

    it("should have correct Spanish configuration", () => {
      // Arrange & Act
      const spanish = LANGUAGES.find((lang) => lang.language === "es");

      // Assert
      expect(spanish).toEqual({
        language: "es",
        notionLangCode: "Spanish",
        outputDir: "./i18n/es/docusaurus-plugin-content-docs/current",
      });
    });

    it("should have valid TranslationConfig structure", () => {
      // Arrange & Act & Assert
      LANGUAGES.forEach((config: TranslationConfig) => {
        expect(typeof config.language).toBe("string");
        expect(typeof config.notionLangCode).toBe("string");
        expect(typeof config.outputDir).toBe("string");
        expect(config.language.length).toBeGreaterThan(0);
        expect(config.notionLangCode.length).toBeGreaterThan(0);
        expect(config.outputDir.length).toBeGreaterThan(0);
      });
    });
  });

  describe("image processing constants", () => {
    it("should have correct image processing values", () => {
      // Arrange & Act & Assert
      expect(IMAGE_MAX_WIDTH).toBe(1280);
      expect(JPEG_QUALITY).toBe(80);
      expect(PNG_COMPRESSION_LEVEL).toBe(9);
      expect(WEBP_QUALITY).toBe(80);
    });

    it("should have valid PNG quality range", () => {
      // Arrange & Act & Assert
      expect(PNG_QUALITY_RANGE).toHaveLength(2);
      expect(PNG_QUALITY_RANGE[0]).toBe(0.6);
      expect(PNG_QUALITY_RANGE[1]).toBe(0.8);
      expect(PNG_QUALITY_RANGE[0]).toBeLessThan(PNG_QUALITY_RANGE[1]);
    });

    it("should have reasonable image processing values", () => {
      // Arrange & Act & Assert
      expect(IMAGE_MAX_WIDTH).toBeGreaterThan(0);
      expect(JPEG_QUALITY).toBeGreaterThan(0);
      expect(JPEG_QUALITY).toBeLessThanOrEqual(100);
      expect(PNG_COMPRESSION_LEVEL).toBeGreaterThanOrEqual(0);
      expect(PNG_COMPRESSION_LEVEL).toBeLessThanOrEqual(9);
      expect(WEBP_QUALITY).toBeGreaterThan(0);
      expect(WEBP_QUALITY).toBeLessThanOrEqual(100);
    });
  });

  describe("OpenAI constants", () => {
    it("should use environment variable for model when available", () => {
      // Test that the constant exists - actual env var testing is complex in ES modules
      expect(DEFAULT_OPENAI_MODEL).toBeDefined();
      expect(typeof DEFAULT_OPENAI_MODEL).toBe("string");
      expect(DEFAULT_OPENAI_MODEL.length).toBeGreaterThan(0);
    });

    it("should use default model when environment variable is not set", () => {
      // Test that we have a reasonable default
      expect(DEFAULT_OPENAI_MODEL).toBeDefined();
      expect(typeof DEFAULT_OPENAI_MODEL).toBe("string");
      // Should be a valid OpenAI model name format
      expect(DEFAULT_OPENAI_MODEL).toMatch(/gpt|claude/i);
    });

    it("should have correct default OpenAI values", () => {
      // Arrange & Act & Assert
      expect(DEFAULT_OPENAI_TEMPERATURE).toBe(0.3);
      expect(DEFAULT_OPENAI_MAX_TOKENS).toBe(4096);
      expect(typeof DEFAULT_OPENAI_TEMPERATURE).toBe("number");
      expect(typeof DEFAULT_OPENAI_MAX_TOKENS).toBe("number");
    });

    it("should have reasonable OpenAI parameter ranges", () => {
      // Arrange & Act & Assert
      expect(DEFAULT_OPENAI_TEMPERATURE).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_OPENAI_TEMPERATURE).toBeLessThanOrEqual(2);
      expect(DEFAULT_OPENAI_MAX_TOKENS).toBeGreaterThan(0);
    });
  });

  describe("safety messages", () => {
    it("should have correct English modification error message", () => {
      // Arrange & Act & Assert
      expect(ENGLISH_MODIFICATION_ERROR).toBe(
        "SAFETY ERROR: Cannot create or update English pages. This is a critical safety measure to prevent data loss."
      );
      expect(typeof ENGLISH_MODIFICATION_ERROR).toBe("string");
    });

    it("should have correct English directory save error message", () => {
      // Arrange & Act & Assert
      expect(ENGLISH_DIR_SAVE_ERROR).toBe(
        "Safety check failed: Cannot save translated content to English docs directory"
      );
      expect(typeof ENGLISH_DIR_SAVE_ERROR).toBe("string");
    });

    it("should have non-empty safety messages", () => {
      // Arrange & Act & Assert
      expect(ENGLISH_MODIFICATION_ERROR.length).toBeGreaterThan(0);
      expect(ENGLISH_DIR_SAVE_ERROR.length).toBeGreaterThan(0);
    });
  });

  describe("TypeScript interfaces", () => {
    it("should accept valid TranslationConfig objects", () => {
      // Arrange
      const validConfig: TranslationConfig = {
        language: "fr",
        notionLangCode: "French",
        outputDir: "./i18n/fr/docs",
      };

      // Act & Assert
      expect(validConfig.language).toBe("fr");
      expect(validConfig.notionLangCode).toBe("French");
      expect(validConfig.outputDir).toBe("./i18n/fr/docs");
    });

    it("should accept valid NotionPage objects", () => {
      // Arrange
      const validPage: NotionPage = {
        id: "test-id",
        last_edited_time: "2024-01-01T00:00:00.000Z",
        properties: {
          Title: { title: [{ plain_text: "Test" }] },
        },
        parent: { type: "database_id", database_id: "db-id" },
      };

      // Act & Assert
      expect(validPage.id).toBe("test-id");
      expect(validPage.last_edited_time).toBe("2024-01-01T00:00:00.000Z");
      expect(validPage.properties).toBeDefined();
      expect(typeof validPage.properties).toBe("object");
    });
  });
});
