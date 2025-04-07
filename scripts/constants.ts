/**
 * Constants used across the Notion workflow scripts
 */

// Main language configuration
export const MAIN_LANGUAGE = 'English';

// Notion property names
export const NOTION_PROPERTIES = {
  TITLE: 'Title',
  LANGUAGE: 'Language',
  PUBLISHED: 'Published',
  ORDER: 'Order',
  TAGS: 'Tags',
  SECTION: 'Section'
};

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
    language: 'pt-BR',
    notionLangCode: 'Portuguese',
    outputDir: './i18n/pt/docusaurus-plugin-content-docs'
  },
  // Add more languages as needed
  // Example:
  // {
  //   language: 'es',
  //   notionLangCode: 'Spanish',
  //   outputDir: './i18n/es/docusaurus-plugin-content-docs'
  // },
];

// Directory for temporary translations
export const TEMP_DIR = './temp_translations';

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
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_OPENAI_TEMPERATURE = 0.3;
export const DEFAULT_OPENAI_MAX_TOKENS = 4096;

// Safety messages
export const ENGLISH_MODIFICATION_ERROR = 'SAFETY ERROR: Cannot create or update English pages. This is a critical safety measure to prevent data loss.';
export const ENGLISH_DIR_SAVE_ERROR = 'Safety check failed: Cannot save translated content to English docs directory';
