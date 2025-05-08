import { test, expect, mock, describe, beforeEach } from "bun:test";
import { LANGUAGES, NOTION_PROPERTIES } from "../../scripts/constants.js";

// Mock the fetchNotionData and fetchNotionDataByLanguage functions
const mockFetchNotionData = mock(async () => [
  {
    id: "page1",
    last_edited_time: "2023-01-01T00:00:00.000Z",
    properties: {
      [NOTION_PROPERTIES.TITLE]: {
        title: [{ plain_text: "Test Page" }]
      },
      [NOTION_PROPERTIES.LANGUAGE]: {
        select: { name: "English" }
      },
      [NOTION_PROPERTIES.PUBLISHED]: {
        checkbox: true
      },
      [NOTION_PROPERTIES.ORDER]: {
        number: 1
      }
    }
  }
]);

const mockFetchNotionDataByLanguage = mock(async (language) => {
  if (language === "Portuguese") {
    return [
      {
        id: "page2",
        last_edited_time: "2023-01-01T00:00:00.000Z",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Página de Teste" }]
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Portuguese" }
          },
          [NOTION_PROPERTIES.PUBLISHED]: {
            checkbox: true
          },
          [NOTION_PROPERTIES.ORDER]: {
            number: 1
          }
        }
      }
    ];
  }
  return [];
});

// Mock the generateBlocks function
const mockGenerateBlocks = mock(async () => ({
  totalSaved: 1024,
  sectionCount: 1,
  titleSectionCount: 1
}));

// Mock the n2m functions
const mockPageToMarkdown = mock(async () => [
  { type: "paragraph", children: [{ text: "Test content" }] }
]);

const mockToMarkdownString = mock(() => ({
  parent: "# Test Page\n\nThis is test content."
}));

// Mock the fs/promises functions
const mockMkdir = mock(async () => {});
const mockWriteFile = mock(async () => {});

// Mock the modules
mock.module("../../scripts/fetchNotionData.js", () => ({
  fetchNotionData: mockFetchNotionData,
  fetchNotionDataByLanguage: mockFetchNotionDataByLanguage
}));

mock.module("../../scripts/generateBlocks.js", () => ({
  generateBlocks: mockGenerateBlocks
}));

mock.module("../../scripts/notionClient.js", () => ({
  n2m: {
    pageToMarkdown: mockPageToMarkdown,
    toMarkdownString: mockToMarkdownString
  }
}));

mock.module("fs/promises", () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile
}));

// Skip the test for now
describe.skip("Fetch Notion Script", () => {


  beforeEach(() => {
    // Reset all mocks
    mockFetchNotionData.mockClear();
    mockFetchNotionDataByLanguage.mockClear();
    mockGenerateBlocks.mockClear();
    mockPageToMarkdown.mockClear();
    mockToMarkdownString.mockClear();
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
  });

  test("should fetch English pages", () => {
    // Check that fetchNotionData was called
    expect(mockFetchNotionData).toHaveBeenCalled();
  });

  test("should generate blocks for English pages", () => {
    // Check that generateBlocks was called with the English pages
    expect(mockGenerateBlocks).toHaveBeenCalled();
  });

  test("should fetch pages for each language in LANGUAGES", () => {
    // Check that fetchNotionDataByLanguage was called for each language
    expect(mockFetchNotionDataByLanguage).toHaveBeenCalledTimes(LANGUAGES.length);

    // Check that it was called with the correct language
    for (const langConfig of LANGUAGES) {
      expect(mockFetchNotionDataByLanguage).toHaveBeenCalledWith(langConfig.notionLangCode);
    }
  });

  test("should process pages for each language", () => {
    // Check that pageToMarkdown was called for each page
    expect(mockPageToMarkdown).toHaveBeenCalled();

    // Check that toMarkdownString was called for each page
    expect(mockToMarkdownString).toHaveBeenCalled();

    // Check that writeFile was called for each page
    expect(mockWriteFile).toHaveBeenCalled();
  });
});
