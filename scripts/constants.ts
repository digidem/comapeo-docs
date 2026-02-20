/**
 * Constants used across the Notion workflow scripts
 */
import dotenv from "dotenv";

// Load environment variables and override system variables
// so local .env values take precedence
dotenv.config({ override: true });

// Main language configuration
export const MAIN_LANGUAGE = "English";

// Notion property names
export const NOTION_PROPERTIES = {
  TITLE: "Content elements",
  LANGUAGE: "Language",
  STATUS: "Publish Status",
  ORDER: "Order",
  TAGS: "Tags",
  ELEMENT_TYPE: "Element Type",
  READY_FOR_TRANSLATION: "Ready for translation",
  READY_TO_PUBLISH: "Ready to publish",
  PUBLISHED_DATE: "Date Published",
} as const;

// Translation language configurations
export interface TranslationConfig {
  language: string;
  notionLangCode: string;
  outputDir: string;
}

// Notion page type
export interface NotionPage {
  id: string;
  last_edited_time: string;
  properties: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const LANGUAGES: TranslationConfig[] = [
  {
    language: "pt-BR",
    notionLangCode: "Portuguese",
    outputDir: "./i18n/pt/docusaurus-plugin-content-docs/current",
  },
  // Add more languages as needed
  // Example:
  {
    language: "es",
    notionLangCode: "Spanish",
    outputDir: "./i18n/es/docusaurus-plugin-content-docs/current",
  },
];

// Maximum number of retries for API calls
export const MAX_RETRIES = 3;

// Notion API limits
export const NOTION_API_CHUNK_SIZE = 50; // Notion API has a limit of 100 blocks per request, using 50 to be safe

// Image processing constants
export const IMAGE_MAX_WIDTH = 1280;
export const JPEG_QUALITY = 80;
export const PNG_COMPRESSION_LEVEL = 9;
export const WEBP_QUALITY = 80;
export const PNG_QUALITY_RANGE = [0.6, 0.8];

// OpenAI constants
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
export const DEFAULT_OPENAI_TEMPERATURE = 0.3;
export const DEFAULT_OPENAI_MAX_TOKENS = 4096;

/**
 * GPT-5.2 supports custom temperature ONLY when reasoning_effort="none"
 * Based on: https://platform.openai.com/docs/guides/reasoning
 */
const GPT5_2_MODEL = "gpt-5.2";

/**
 * Gets model-specific parameters for OpenAI API requests.
 * GPT-5 models have different temperature support depending on variant:
 * - gpt-5, gpt-5-nano, gpt-5-mini: Only temperature=1 (or omit)
 * - gpt-5.2 with reasoning_effort="none": Supports custom temperature
 * - Other models: Use DEFAULT_OPENAI_TEMPERATURE
 *
 * @param modelName The OpenAI model name (e.g., "gpt-5-nano", "gpt-4o")
 * @param options Optional configuration for reasoning behavior
 * @returns Request params object with temperature and optionally reasoning_effort
 */
export function getModelParams(
  modelName: string,
  options: { useReasoningNone?: boolean } = {}
): { temperature: number; reasoning_effort?: "none" } {
  // Normalize model name for consistent matching
  const normalizedModel = modelName.trim().toLowerCase();

  // GPT-5.2 with reasoning_effort="none" supports custom temperature
  if (normalizedModel === GPT5_2_MODEL && options.useReasoningNone) {
    return {
      temperature: DEFAULT_OPENAI_TEMPERATURE,
      reasoning_effort: "none",
    };
  }

  // GPT-5 models (gpt-5, gpt-5-nano, gpt-5-mini) only support temperature=1
  const gpt5BaseModels = ["gpt-5", "gpt-5-nano", "gpt-5-mini"];
  const isGpt5BaseModel = gpt5BaseModels.some(
    (m) => normalizedModel === m || normalizedModel.startsWith(m + "-")
  );

  if (isGpt5BaseModel) {
    return { temperature: 1 };
  }

  // All other models use configured temperature
  return { temperature: DEFAULT_OPENAI_TEMPERATURE };
}

// Safety messages
export const ENGLISH_MODIFICATION_ERROR =
  "SAFETY ERROR: Cannot create or update English pages. This is a critical safety measure to prevent data loss.";
export const ENGLISH_DIR_SAVE_ERROR =
  "Safety check failed: Cannot save translated content to English docs directory";

// Translation retry configuration
export const TRANSLATION_MAX_RETRIES = 3;
export const TRANSLATION_RETRY_BASE_DELAY_MS = 750;

// Test environment configuration
export const SAFE_BRANCH_PATTERNS = [
  "test/*",
  "fix/*",
  "feat/*",
  "chore/*",
  "refactor/*",
];

export const PROTECTED_BRANCHES = ["main", "master", "content"];

export function isTestMode(): boolean {
  return (
    process.env.TEST_MODE === "true" ||
    !!process.env.TEST_DATABASE_ID ||
    !!process.env.TEST_DATA_SOURCE_ID
  );
}

export function getTestDataSourceId(): string | undefined {
  return process.env.TEST_DATA_SOURCE_ID;
}

export function getTestDatabaseId(): string | undefined {
  return process.env.TEST_DATABASE_ID;
}

export function isSafeTestBranch(branch: string): boolean {
  // In test mode, only allow safe branch patterns
  if (!isTestMode()) {
    return true; // If not in test mode, allow any branch
  }

  // Check if branch matches any safe pattern
  const isSafePattern = SAFE_BRANCH_PATTERNS.some((pattern) => {
    // Use literal string comparison instead of RegExp to avoid ESLint warning
    // SAFE_BRANCH_PATTERNS uses "*" as wildcard, so we do simple prefix check
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2); // Remove "/*" suffix
      return branch.startsWith(prefix + "/");
    }
    return branch === pattern;
  });

  // Check if branch contains "test" (case-insensitive)
  const hasTestInName = /test/i.test(branch);

  // Check if branch is a protected branch (never allow in test mode)
  const isProtected = PROTECTED_BRANCHES.includes(branch);

  return (isSafePattern || hasTestInName) && !isProtected;
}
