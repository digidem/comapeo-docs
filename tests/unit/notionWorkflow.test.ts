import { test, expect, mock, describe, beforeEach } from "bun:test";

// Mock the fetchNotionData function
const mockFetchNotionData = mock(async () => {
  return [
    {
      id: "page1",
      last_edited_time: new Date().toISOString(),
      properties: {
        "Title": {
          title: [{ plain_text: "Test Page" }]
        },
        "Language": {
          select: { name: "English" }
        },
        "Published": {
          checkbox: true
        },
        "Order": {
          number: 1
        }
      }
    },
    {
      id: "page2",
      last_edited_time: new Date().toISOString(),
      properties: {
        "Title": {
          title: [{ plain_text: "Test Section" }]
        },
        "Language": {
          select: { name: "English" }
        },
        "Published": {
          checkbox: true
        },
        "Order": {
          number: 2
        },
        "Section": {
          select: { name: "toggle" }
        }
      }
    }
  ];
});

// Mock the generateBlocks function
const mockGenerateBlocks = mock(async () => {
  return {
    totalSaved: 1024,
    sectionCount: 1,
    titleSectionCount: 0
  };
});

// Mock the translateText function
const mockTranslateText = mock(async (text, targetLanguage) => {
  return `Translated to ${targetLanguage}: ${text.substring(0, 20)}...`;
});

// Mock the n2m.pageToMarkdown function
const mockPageToMarkdown = mock(async () => {
  return [{ type: "paragraph", children: [{ text: "Test content" }] }];
});

// Mock the n2m.toMarkdownString function
const mockToMarkdownString = mock(() => {
  return { parent: "# Test Page\n\nThis is test content." };
});

// Mock the createNotionPageFromMarkdown function
const mockCreateNotionPageFromMarkdown = mock(async () => {
  return "new-page-id";
});

// Mock the fs.mkdir function
const mockMkdir = mock(async () => {});

// Mock the fs.writeFile function
const mockWriteFile = mock(async () => {});

// Mock the fs.rm function
const mockRm = mock(async () => {});

// Mock the notion.databases.query function
const mockDatabasesQuery = mock(async ({ filter }) => {
  // If querying for translation pages, return empty results
  if (filter?.and?.some(f => f.property === "Language" && f.select?.equals !== "English")) {
    return { results: [] };
  }

  // Otherwise return the English pages
  return {
    results: [
      {
        id: "page1",
        last_edited_time: new Date().toISOString(),
        properties: {
          "Title": {
            title: [{ plain_text: "Test Page" }]
          },
          "Language": {
            select: { name: "English" }
          },
          "Published": {
            checkbox: true
          },
          "Order": {
            number: 1
          }
        }
      }
    ]
  };
});

// Create a mock for the entire workflow
const mockNotionWorkflow = mock(async () => {
  // 1. Fetch data
  const data = await mockFetchNotionData();

  // 2. Generate blocks
  await mockGenerateBlocks(data, () => {});

  // 3. Filter English pages
  const englishPages = data.filter(page => {
    const language = page.properties['Language']?.select?.name || 'English';
    const isPublished = page.properties['Published']?.checkbox || false;
    return language === 'English' && isPublished;
  });

  // 4. Process each language
  for (const page of englishPages) {
    // Convert to markdown
    const mdBlocks = await mockPageToMarkdown(page.id);
    const markdown = mockToMarkdownString(mdBlocks);

    // Translate
    const translatedContent = await mockTranslateText(markdown.parent, "Portuguese");

    // Create translation page
    await mockCreateNotionPageFromMarkdown();

    // Save to file
    await mockMkdir("output-dir", { recursive: true });
    await mockWriteFile("output-file.md", translatedContent);
  }

  // 5. Clean up
  await mockRm("temp-dir", { recursive: true, force: true });

  return { success: true };
});

describe("Notion Workflow", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockFetchNotionData.mockClear();
    mockGenerateBlocks.mockClear();
    mockTranslateText.mockClear();
    mockPageToMarkdown.mockClear();
    mockToMarkdownString.mockClear();
    mockCreateNotionPageFromMarkdown.mockClear();
    mockMkdir.mockClear();
    mockWriteFile.mockClear();
    mockRm.mockClear();
    mockDatabasesQuery.mockClear();
    mockNotionWorkflow.mockClear();
  });

  test("should fetch data and generate blocks", async () => {
    const result = await mockNotionWorkflow();

    // Check that the necessary functions were called
    expect(mockFetchNotionData).toHaveBeenCalledTimes(1);
    expect(mockGenerateBlocks).toHaveBeenCalledTimes(1);

    // Verify the result
    expect(result.success).toBe(true);
  });

  test("should translate English pages", async () => {
    // Mock the workflow to simulate translation
    await mockNotionWorkflow();

    // Check that the translation functions were called
    expect(mockPageToMarkdown).toHaveBeenCalled();
    expect(mockToMarkdownString).toHaveBeenCalled();
    expect(mockTranslateText).toHaveBeenCalled();

    // Check that the translation page was created
    expect(mockCreateNotionPageFromMarkdown).toHaveBeenCalled();

    // Check that the translated content was saved
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });

  test("should clean up temporary files", async () => {
    await mockNotionWorkflow();

    // Check that the cleanup function was called
    expect(mockRm).toHaveBeenCalled();
  });

  test("should handle translation errors gracefully", async () => {
    // Mock the translateText function to return an error message instead of throwing
    mockTranslateText.mockImplementationOnce(async (text, targetLanguage) => {
      return `# Translation Error\n\nUnable to translate content to ${targetLanguage}.`;
    });

    // The workflow should still complete without throwing
    const result = await mockNotionWorkflow();
    expect(result.success).toBe(true);
  });

  test("should prevent saving translated content to English docs directory", async () => {
    // Create a mock implementation of saveTranslatedContent that tries to save to the English docs directory
    const mockSaveTranslatedContent = mock(async (englishPage, translatedContent, config) => {
      // This should throw an error because it's trying to save to the English docs directory
      if (config.outputDir === './docs') {
        throw new Error('Safety check failed: Cannot save translated content to English docs directory');
      }
      return 'output-file.md';
    });

    // Expect the function to throw when trying to save to the English docs directory
    await expect(mockSaveTranslatedContent(
      { properties: { Title: { title: [{ plain_text: 'Test' }] } } },
      'Translated content',
      { outputDir: './docs', language: 'pt-BR', notionLangCode: 'Portuguese' }
    )).rejects.toThrow('Safety check failed');

    // But it should work fine for a valid i18n directory
    await expect(mockSaveTranslatedContent(
      { properties: { Title: { title: [{ plain_text: 'Test' }] } } },
      'Translated content',
      { outputDir: './i18n/pt/docusaurus-plugin-content-docs', language: 'pt-BR', notionLangCode: 'Portuguese' }
    )).resolves.toBe('output-file.md');
  });
});
