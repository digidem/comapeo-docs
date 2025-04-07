import { test, expect, mock, describe, beforeEach } from "bun:test";
import { LANGUAGES, MAIN_LANGUAGE, NOTION_PROPERTIES, NotionPage } from "../../scripts/constants.js";

// Mock the notion client
const mockDatabasesQuery = mock(async () => ({
  results: [
    {
      id: "page1",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: "Test Page" }]
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: MAIN_LANGUAGE }
        },
        [NOTION_PROPERTIES.PUBLISHED]: {
          checkbox: true
        },
        [NOTION_PROPERTIES.ORDER]: {
          number: 1
        }
      }
    }
  ]
}));

// Mock the n2m module
const mockPageToMarkdown = mock(async () => [
  { type: "paragraph", children: [{ text: "Test content" }] }
]);

const mockToMarkdownString = mock(() => ({
  parent: "# Test Page\n\nThis is test content."
}));

// Mock the translateText function
const mockTranslateText = mock(async (text, targetLanguage) => {
  return `Translated to ${targetLanguage}: ${text.substring(0, 20)}...`;
});

// Mock the fs module
const mockMkdir = mock(async () => {});
const mockWriteFile = mock(async () => {});
const mockRm = mock(async () => {});
const mockAccess = mock(async () => {});
const mockReadFile = mock(async () => "# Test Page\n\nThis is test content.");

// Mock the createNotionPageFromMarkdown function
const mockCreateNotionPageFromMarkdown = mock(async () => "new-page-id");

// Mock the modules
mock.module("../../scripts/notionClient.js", () => ({
  notion: {
    databases: {
      query: mockDatabasesQuery
    }
  },
  n2m: {
    pageToMarkdown: mockPageToMarkdown,
    toMarkdownString: mockToMarkdownString
  },
  DATABASE_ID: "test-database-id"
}));

mock.module("../../scripts/openaiTranslator.js", () => ({
  translateText: mockTranslateText
}));

mock.module("fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  rm: mockRm,
  access: mockAccess,
  readFile: mockReadFile
}));

mock.module("../../scripts/markdownToNotion.js", () => ({
  createNotionPageFromMarkdown: mockCreateNotionPageFromMarkdown
}));

// Import the module after mocking
import { findTranslationPage, needsTranslationUpdate, saveTranslatedContent } from "../../scripts/translateNotionPages.js";

describe("Translate Notion Pages", () => {
  beforeEach(() => {
    // Reset all mocks
    mockDatabasesQuery.mockClear();
    mockPageToMarkdown.mockClear();
    mockToMarkdownString.mockClear();
    mockTranslateText.mockClear();
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
    mockRm.mockClear();
    mockCreateNotionPageFromMarkdown.mockClear();
  });

  test("findTranslationPage should find existing translation pages", async () => {
    // Mock the database query to return a translation page
    mockDatabasesQuery.mockImplementationOnce(async () => ({
      results: [
        {
          id: "translation-page-id",
          last_edited_time: "2023-01-02T00:00:00.000Z",
          properties: {
            [NOTION_PROPERTIES.TITLE]: {
              title: [{ plain_text: "Test Page" }]
            },
            [NOTION_PROPERTIES.LANGUAGE]: {
              select: { name: "Portuguese" }
            }
          }
        }
      ]
    }));

    const englishPage = {
      id: "page1",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: "Test Page" }]
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: MAIN_LANGUAGE }
        }
      }
    } as NotionPage;

    const result = await findTranslationPage(englishPage, "Portuguese");

    // Check that the database query was called with the correct parameters
    expect(mockDatabasesQuery).toHaveBeenCalledWith({
      database_id: "test-database-id",
      filter: {
        and: [
          {
            property: NOTION_PROPERTIES.TITLE,
            title: {
              equals: "Test Page"
            }
          },
          {
            property: NOTION_PROPERTIES.LANGUAGE,
            select: {
              equals: "Portuguese"
            }
          }
        ]
      }
    });

    // Check that the result is the translation page
    expect(result).toBeDefined();
    expect(result?.id).toBe("translation-page-id");
  });

  test("needsTranslationUpdate should return true when English page is newer", () => {
    const englishPage = {
      id: "page1",
      last_edited_time: "2023-01-02T00:00:00.000Z",
      properties: {}
    } as NotionPage;

    const translationPage = {
      id: "translation-page-id",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      properties: {}
    } as NotionPage;

    const result = needsTranslationUpdate(englishPage, translationPage);

    expect(result).toBe(true);
  });

  test("needsTranslationUpdate should return false when translation page is newer", () => {
    const englishPage = {
      id: "page1",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      properties: {}
    } as NotionPage;

    const translationPage = {
      id: "translation-page-id",
      last_edited_time: "2023-01-02T00:00:00.000Z",
      properties: {}
    } as NotionPage;

    const result = needsTranslationUpdate(englishPage, translationPage);

    expect(result).toBe(false);
  });

  test.skip("saveTranslatedContent should save content to the correct location", async () => {
    const englishPage = {
      id: "page1",
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: "Test Page" }]
        }
      }
    } as NotionPage;

    const translatedContent = "# Test Page (Translated)\n\nThis is translated content.";
    const config = LANGUAGES[0]; // Use the first language from the constants

    await saveTranslatedContent(englishPage, translatedContent, config);

    // Check that the directory was created
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(config.outputDir), { recursive: true });

    // Check that the file was written
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".md"),
      translatedContent,
      "utf8"
    );

    // Check that createNotionPageFromMarkdown was called
    expect(mockCreateNotionPageFromMarkdown).toHaveBeenCalledWith(
      expect.anything(),
      "test-database-id",
      "Test Page",
      translatedContent,
      expect.objectContaining({
        [NOTION_PROPERTIES.LANGUAGE]: expect.objectContaining({
          select: { name: config.notionLangCode }
        })
      }),
      true,
      config.notionLangCode
    );
  });
});
