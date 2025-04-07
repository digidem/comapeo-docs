import { test, expect, describe } from "bun:test";
import {
  LANGUAGES,
  MAIN_LANGUAGE,
  NOTION_PROPERTIES,
  TEMP_DIR,
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
  ENGLISH_DIR_SAVE_ERROR
} from "../../scripts/constants.js";

describe("Constants", () => {
  test("LANGUAGES should be an array with at least one language", () => {
    expect(Array.isArray(LANGUAGES)).toBe(true);
    expect(LANGUAGES.length).toBeGreaterThan(0);
    
    // Check the structure of the first language
    const firstLanguage = LANGUAGES[0];
    expect(firstLanguage).toHaveProperty("language");
    expect(firstLanguage).toHaveProperty("notionLangCode");
    expect(firstLanguage).toHaveProperty("outputDir");
  });

  test("MAIN_LANGUAGE should be a non-empty string", () => {
    expect(typeof MAIN_LANGUAGE).toBe("string");
    expect(MAIN_LANGUAGE.length).toBeGreaterThan(0);
  });

  test("NOTION_PROPERTIES should contain all required properties", () => {
    expect(NOTION_PROPERTIES).toHaveProperty("TITLE");
    expect(NOTION_PROPERTIES).toHaveProperty("LANGUAGE");
    expect(NOTION_PROPERTIES).toHaveProperty("PUBLISHED");
    expect(NOTION_PROPERTIES).toHaveProperty("ORDER");
    expect(NOTION_PROPERTIES).toHaveProperty("TAGS");
    expect(NOTION_PROPERTIES).toHaveProperty("SECTION");
    
    // All properties should be non-empty strings
    Object.values(NOTION_PROPERTIES).forEach(prop => {
      expect(typeof prop).toBe("string");
      expect(prop.length).toBeGreaterThan(0);
    });
  });

  test("TEMP_DIR should be a valid directory path", () => {
    expect(typeof TEMP_DIR).toBe("string");
    expect(TEMP_DIR.length).toBeGreaterThan(0);
    expect(TEMP_DIR).toContain("./");
  });

  test("MAX_RETRIES should be a positive number", () => {
    expect(typeof MAX_RETRIES).toBe("number");
    expect(MAX_RETRIES).toBeGreaterThan(0);
  });

  test("NOTION_API_CHUNK_SIZE should be a positive number", () => {
    expect(typeof NOTION_API_CHUNK_SIZE).toBe("number");
    expect(NOTION_API_CHUNK_SIZE).toBeGreaterThan(0);
    // Notion API has a limit of 100 blocks per request
    expect(NOTION_API_CHUNK_SIZE).toBeLessThanOrEqual(100);
  });

  test("Image processing constants should have valid values", () => {
    expect(typeof IMAGE_MAX_WIDTH).toBe("number");
    expect(IMAGE_MAX_WIDTH).toBeGreaterThan(0);
    
    expect(typeof JPEG_QUALITY).toBe("number");
    expect(JPEG_QUALITY).toBeGreaterThanOrEqual(0);
    expect(JPEG_QUALITY).toBeLessThanOrEqual(100);
    
    expect(typeof PNG_COMPRESSION_LEVEL).toBe("number");
    expect(PNG_COMPRESSION_LEVEL).toBeGreaterThanOrEqual(0);
    expect(PNG_COMPRESSION_LEVEL).toBeLessThanOrEqual(9);
    
    expect(typeof WEBP_QUALITY).toBe("number");
    expect(WEBP_QUALITY).toBeGreaterThanOrEqual(0);
    expect(WEBP_QUALITY).toBeLessThanOrEqual(100);
    
    expect(Array.isArray(PNG_QUALITY_RANGE)).toBe(true);
    expect(PNG_QUALITY_RANGE.length).toBe(2);
    expect(PNG_QUALITY_RANGE[0]).toBeGreaterThanOrEqual(0);
    expect(PNG_QUALITY_RANGE[1]).toBeLessThanOrEqual(1);
  });

  test("OpenAI constants should have valid values", () => {
    expect(typeof DEFAULT_OPENAI_MODEL).toBe("string");
    expect(DEFAULT_OPENAI_MODEL.length).toBeGreaterThan(0);
    
    expect(typeof DEFAULT_OPENAI_TEMPERATURE).toBe("number");
    expect(DEFAULT_OPENAI_TEMPERATURE).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_OPENAI_TEMPERATURE).toBeLessThanOrEqual(1);
    
    expect(typeof DEFAULT_OPENAI_MAX_TOKENS).toBe("number");
    expect(DEFAULT_OPENAI_MAX_TOKENS).toBeGreaterThan(0);
  });

  test("Error messages should be non-empty strings", () => {
    expect(typeof ENGLISH_MODIFICATION_ERROR).toBe("string");
    expect(ENGLISH_MODIFICATION_ERROR.length).toBeGreaterThan(0);
    
    expect(typeof ENGLISH_DIR_SAVE_ERROR).toBe("string");
    expect(ENGLISH_DIR_SAVE_ERROR.length).toBeGreaterThan(0);
  });
});
