/**
 * Test fixtures for Notion API responses and common test data
 */

export const mockNotionPage = {
  id: "test-page-id-123",
  last_edited_time: "2024-01-01T00:00:00.000Z",
  properties: {
    Title: {
      title: [{ plain_text: "Test Page Title" }],
    },
    Status: {
      select: { name: "Ready to publish" },
    },
    Order: {
      number: 1,
    },
    Language: {
      select: { name: "English" },
    },
    "Element Type": {
      select: { name: "Getting Started" },
    },
  },
  parent: {
    type: "database_id",
    database_id: "test-database-id",
  },
  url: "https://notion.so/test-page-id-123",
};

export const mockNotionPageWithTranslation = {
  ...mockNotionPage,
  id: "test-page-translation-456",
  properties: {
    ...mockNotionPage.properties,
    Title: {
      title: [{ plain_text: "Página de Teste" }],
    },
    Language: {
      select: { name: "Portuguese" },
    },
  },
};

export const mockNotionBlock = {
  id: "block-123",
  type: "paragraph",
  paragraph: {
    rich_text: [
      {
        type: "text",
        text: { content: "This is a test paragraph block." },
        plain_text: "This is a test paragraph block.",
      },
    ],
  },
  has_children: false,
};

export const mockNotionImageBlock = {
  id: "image-block-456",
  type: "image",
  image: {
    type: "external",
    external: {
      url: "https://example.com/test-image.jpg",
    },
  },
  has_children: false,
};

export const mockImageBuffer = Buffer.from("fake-image-data-for-testing");

export const mockProcessedImageResult = {
  outputBuffer: Buffer.from("compressed-image-data"),
  originalSize: 1024,
  processedSize: 512,
};

export const mockDatabaseQueryResponse = {
  results: [mockNotionPage],
  next_cursor: null,
  has_more: false,
};

export const mockBlocksListResponse = {
  results: [mockNotionBlock, mockNotionImageBlock],
  next_cursor: null,
  has_more: false,
};

export const mockTranslationConfig = {
  language: "pt-BR",
  notionLangCode: "Portuguese",
  outputDir: "./i18n/pt/docusaurus-plugin-content-docs/current",
};

export const mockEnvironmentVariables = {
  NOTION_API_KEY: "test-notion-api-key",
  DATABASE_ID: "test-database-id",
  OPENAI_API_KEY: "test-openai-api-key",
  OPENAI_MODEL: "gpt-4",
  NODE_ENV: "test",
};
