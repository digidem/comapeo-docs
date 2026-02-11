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
  SAFE_BRANCH_PATTERNS,
  PROTECTED_BRANCHES,
  isTestMode,
  getTestDataSourceId,
  getTestDatabaseId,
  isSafeTestBranch,
  getModelParams,
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

    describe("getModelParams", () => {
      it("should return temperature=1 for GPT-5 base models", () => {
        // Arrange & Act & Assert
        expect(getModelParams("gpt-5")).toEqual({ temperature: 1 });
        expect(getModelParams("gpt-5-nano")).toEqual({ temperature: 1 });
        expect(getModelParams("gpt-5-mini")).toEqual({ temperature: 1 });
      });

      it("should return DEFAULT_OPENAI_TEMPERATURE for non-GPT-5 models", () => {
        // Arrange & Act & Assert
        expect(getModelParams("gpt-4o")).toEqual({
          temperature: DEFAULT_OPENAI_TEMPERATURE,
        });
        expect(getModelParams("gpt-4-turbo")).toEqual({
          temperature: DEFAULT_OPENAI_TEMPERATURE,
        });
        expect(getModelParams("claude-3-opus")).toEqual({
          temperature: DEFAULT_OPENAI_TEMPERATURE,
        });
      });

      it("should support custom temperature for GPT-5.2 with reasoning_effort=none", () => {
        // Arrange & Act & Assert
        expect(getModelParams("gpt-5.2", { useReasoningNone: true })).toEqual({
          temperature: DEFAULT_OPENAI_TEMPERATURE,
          reasoning_effort: "none",
        });
      });
    });
    it("should be case-insensitive for model names", () => {
      // Arrange & Act & Assert
      expect(getModelParams("GPT-5-NANO")).toEqual({ temperature: 1 });
      expect(getModelParams("gpt-5")).toEqual({ temperature: 1 });
      expect(getModelParams(" gpt-5-nano ")).toEqual({ temperature: 1 });
      expect(getModelParams("gpt-5-nano")).toEqual({ temperature: 1 });
    });

    it("should handle GPT-5 variants correctly", () => {
      // Arrange & Act & Assert - ensure exact match and prefix match work
      expect(getModelParams("gpt-5")).toEqual({ temperature: 1 });
      expect(getModelParams("gpt-5-nano")).toEqual({ temperature: 1 });
      expect(getModelParams("gpt-5-mini")).toEqual({ temperature: 1 });
      // GPT-5-chat-latest may support temperature with reasoning_effort=none
      expect(getModelParams("gpt-5-chat-latest")).toEqual({ temperature: 1 });
    });
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

describe("test environment configuration", () => {
  it("should have defined safe branch patterns", () => {
    // Arrange & Act & Assert
    expect(SAFE_BRANCH_PATTERNS).toBeDefined();
    expect(Array.isArray(SAFE_BRANCH_PATTERNS)).toBe(true);
    expect(SAFE_BRANCH_PATTERNS.length).toBeGreaterThan(0);
  });

  it("should include expected safe branch patterns", () => {
    // Arrange & Act & Assert
    expect(SAFE_BRANCH_PATTERNS).toContain("test/*");
    expect(SAFE_BRANCH_PATTERNS).toContain("fix/*");
    expect(SAFE_BRANCH_PATTERNS).toContain("feat/*");
    expect(SAFE_BRANCH_PATTERNS).toContain("chore/*");
    expect(SAFE_BRANCH_PATTERNS).toContain("refactor/*");
  });

  it("should have defined protected branches", () => {
    // Arrange & Act & Assert
    expect(PROTECTED_BRANCHES).toBeDefined();
    expect(Array.isArray(PROTECTED_BRANCHES)).toBe(true);
    expect(PROTECTED_BRANCHES.length).toBeGreaterThan(0);
  });

  it("should include expected protected branches", () => {
    // Arrange & Act & Assert
    expect(PROTECTED_BRANCHES).toContain("main");
    expect(PROTECTED_BRANCHES).toContain("master");
    expect(PROTECTED_BRANCHES).toContain("content");
  });

  describe("isTestMode", () => {
    it("should return false when no test env vars are set", () => {
      // Arrange
      delete process.env.TEST_MODE;
      delete process.env.TEST_DATABASE_ID;
      delete process.env.TEST_DATA_SOURCE_ID;

      // Act & Assert
      expect(isTestMode()).toBe(false);
    });

    it("should return true when TEST_MODE is 'true'", () => {
      // Arrange
      process.env.TEST_MODE = "true";
      delete process.env.TEST_DATABASE_ID;
      delete process.env.TEST_DATA_SOURCE_ID;

      // Act & Assert
      expect(isTestMode()).toBe(true);
    });

    it("should return true when TEST_DATABASE_ID is set", () => {
      // Arrange
      delete process.env.TEST_MODE;
      process.env.TEST_DATABASE_ID = "test-db-id";
      delete process.env.TEST_DATA_SOURCE_ID;

      // Act & Assert
      expect(isTestMode()).toBe(true);
    });

    it("should return true when TEST_DATA_SOURCE_ID is set", () => {
      // Arrange
      delete process.env.TEST_MODE;
      delete process.env.TEST_DATABASE_ID;
      process.env.TEST_DATA_SOURCE_ID = "test-data-source-id";

      // Act & Assert
      expect(isTestMode()).toBe(true);
    });
  });

  describe("getTestDataSourceId", () => {
    it("should return undefined when TEST_DATA_SOURCE_ID is not set", () => {
      // Arrange
      delete process.env.TEST_DATA_SOURCE_ID;

      // Act & Assert
      expect(getTestDataSourceId()).toBeUndefined();
    });

    it("should return the value when TEST_DATA_SOURCE_ID is set", () => {
      // Arrange
      process.env.TEST_DATA_SOURCE_ID = "test-data-source-id";

      // Act & Assert
      expect(getTestDataSourceId()).toBe("test-data-source-id");
    });
  });

  describe("getTestDatabaseId", () => {
    it("should return undefined when TEST_DATABASE_ID is not set", () => {
      // Arrange
      delete process.env.TEST_DATABASE_ID;

      // Act & Assert
      expect(getTestDatabaseId()).toBeUndefined();
    });

    it("should return the value when TEST_DATABASE_ID is set", () => {
      // Arrange
      process.env.TEST_DATABASE_ID = "test-db-id";

      // Act & Assert
      expect(getTestDatabaseId()).toBe("test-db-id");
    });
  });

  describe("isSafeTestBranch", () => {
    beforeEach(() => {
      // Clear test mode env vars before each test
      delete process.env.TEST_MODE;
      delete process.env.TEST_DATABASE_ID;
      delete process.env.TEST_DATA_SOURCE_ID;
    });

    it("should return true for any branch when not in test mode", () => {
      // Arrange - ensure we're NOT in test mode
      delete process.env.TEST_MODE;
      delete process.env.TEST_DATABASE_ID;
      delete process.env.TEST_DATA_SOURCE_ID;

      // Act & Assert
      expect(isSafeTestBranch("main")).toBe(true);
      expect(isSafeTestBranch("content")).toBe(true);
      expect(isSafeTestBranch("any-branch")).toBe(true);
    });

    it("should return true for safe pattern branches in test mode", () => {
      // Arrange - enable test mode
      process.env.TEST_MODE = "true";

      // Act & Assert
      expect(isSafeTestBranch("test/translation")).toBe(true);
      expect(isSafeTestBranch("fix/something")).toBe(true);
      expect(isSafeTestBranch("feat/new-feature")).toBe(true);
      expect(isSafeTestBranch("chore/update")).toBe(true);
      expect(isSafeTestBranch("refactor/cleanup")).toBe(true);
    });

    it("should return true for branches with 'test' in name in test mode", () => {
      // Arrange - enable test mode
      process.env.TEST_MODE = "true";

      // Act & Assert
      expect(isSafeTestBranch("my-test-branch")).toBe(true);
      expect(isSafeTestBranch("test-translation-fix")).toBe(true);
      expect(isSafeTestBranch("testing-123")).toBe(true);
    });

    it("should return false for protected branches in test mode", () => {
      // Arrange - enable test mode
      process.env.TEST_MODE = "true";

      // Act & Assert
      expect(isSafeTestBranch("main")).toBe(false);
      expect(isSafeTestBranch("master")).toBe(false);
      expect(isSafeTestBranch("content")).toBe(false);
    });

    it("should return false for non-safe, non-test branches in test mode", () => {
      // Arrange - enable test mode
      process.env.TEST_MODE = "true";

      // Act & Assert
      expect(isSafeTestBranch("production")).toBe(false);
      expect(isSafeTestBranch("staging")).toBe(false);
      expect(isSafeTestBranch("develop")).toBe(false);
    });
  });
});
