import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockNotionPage, installTestNotionEnv } from "../test-utils";

const mockFetchNotionData = vi.fn();
const mockSortAndExpandNotionData = vi.fn();
const mockTranslateText = vi.fn();
const mockTranslateJson = vi.fn();
const mockExtractTranslatableText = vi.fn();
const mockGetLanguageName = vi.fn();
const mockCreateNotionPageFromMarkdown = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockAccess = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();

const mockN2m = {
  pageToMarkdown: vi.fn(),
  toMarkdownString: vi.fn(),
};

vi.mock("fs/promises", () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
    readdir: mockReaddir,
    stat: mockStat,
  },
}));

vi.mock("../notionClient", () => ({
  notion: {},
  // DATA_SOURCE_ID is primary, DATABASE_ID is fallback (standardization policy)
  DATABASE_ID: "test-database-id",
  DATA_SOURCE_ID: "test-data-source-id",
  n2m: mockN2m,
}));

vi.mock("../fetchNotionData.js", () => ({
  fetchNotionData: mockFetchNotionData,
  sortAndExpandNotionData: mockSortAndExpandNotionData,
}));

vi.mock("./translateFrontMatter", () => ({
  translateText: mockTranslateText,
  TranslationError: class TranslationError extends Error {
    isCritical = true;
  },
}));

vi.mock("./translateCodeJson", () => ({
  translateJson: mockTranslateJson,
  extractTranslatableText: mockExtractTranslatableText,
  getLanguageName: mockGetLanguageName,
}));

vi.mock("./markdownToNotion", () => ({
  createNotionPageFromMarkdown: mockCreateNotionPageFromMarkdown,
}));

function findSummaryLog(logSpy: ReturnType<typeof vi.spyOn>) {
  const summaryLine = logSpy.mock.calls
    .map((args) => args.map(String).join(" "))
    .find((line) => line.startsWith("TRANSLATION_SUMMARY "));

  expect(summaryLine).toBeTruthy();
  return JSON.parse(summaryLine!.slice("TRANSLATION_SUMMARY ".length));
}

describe("notion-translate index", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();

    const englishPage = createMockNotionPage({
      id: "english-page-1",
      title: "Hello World",
      status: "Ready for translation",
      language: "English",
      order: 7,
      parentItem: "parent-1",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });

    mockFetchNotionData.mockReset();
    mockSortAndExpandNotionData.mockReset();
    mockTranslateText.mockReset();
    mockTranslateJson.mockReset();
    mockExtractTranslatableText.mockReset();
    mockGetLanguageName.mockReset();
    mockCreateNotionPageFromMarkdown.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockReset();
    mockAccess.mockReset();
    mockReaddir.mockReset();
    mockStat.mockReset();
    mockN2m.pageToMarkdown.mockReset();
    mockN2m.toMarkdownString.mockReset();

    mockFetchNotionData.mockImplementation(async (filter) => {
      if (
        filter?.and?.some(
          (condition: { property?: string }) =>
            condition.property === "Publish Status"
        )
      ) {
        return [englishPage];
      }
      return [];
    });
    mockSortAndExpandNotionData.mockImplementation(async (pages) => pages);
    mockN2m.pageToMarkdown.mockResolvedValue([]);
    mockN2m.toMarkdownString.mockReturnValue({
      parent: "# Hello\n\nEnglish markdown",
    });
    mockTranslateText.mockResolvedValue({
      markdown: "# Ola",
      title: "Ola",
    });
    mockTranslateJson.mockResolvedValue("{}");
    mockExtractTranslatableText.mockReturnValue({
      "homepage.cta": { message: "Get started" },
    });
    mockGetLanguageName.mockImplementation((lang: string) =>
      lang === "pt" ? "Portuguese" : "Spanish"
    );
    mockCreateNotionPageFromMarkdown.mockResolvedValue("translation-page-id");
    mockReadFile.mockResolvedValue('{"hello":{"message":"Hello"}}');
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockAccess.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );
    mockReaddir.mockResolvedValue(["es", "pt"]);
    mockStat.mockResolvedValue({
      isDirectory: () => true,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("returns an accurate success summary and logs TRANSLATION_SUMMARY", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    const summary = await main();

    expect(summary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      newTranslations: 2,
      updatedTranslations: 0,
      skippedTranslations: 0,
      failedTranslations: 0,
      codeJsonFailures: 0,
      themeFailures: 0,
    });
    expect(summary.failures).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toEqual(summary);
  });

  it("verifies success contract: processedLanguages > 0 and all failures = 0", async () => {
    // Success contract from PRD:
    // - processedLanguages > 0 (at least one language was processed)
    // - failedTranslations = 0 (no document translation failures)
    // - codeJsonFailures = 0 (no UI string translation failures)
    // - themeFailures = 0 (no navbar/footer translation failures)
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    const summary = await main();

    // Verify success contract conditions
    expect(summary.processedLanguages).toBeGreaterThan(0);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.codeJsonFailures).toBe(0);
    expect(summary.themeFailures).toBe(0);

    // Verify no errors were logged
    expect(errorSpy).not.toHaveBeenCalled();

    // Verify TRANSLATION_SUMMARY was emitted
    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toBeDefined();
    expect(loggedSummary.processedLanguages).toBeGreaterThan(0);
  });

  it("fails with explicit contract when no pages are ready for translation", async () => {
    mockFetchNotionData.mockResolvedValue([]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "No English pages found with status 'Ready for translation'."
    );

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 0,
      processedLanguages: 0,
      newTranslations: 0,
      updatedTranslations: 0,
      skippedTranslations: 0,
      failedTranslations: 0,
      codeJsonFailures: 0,
      themeFailures: 0,
    });
  });

  it("exits with failure on partial doc translation failures and reports counts", async () => {
    mockTranslateText.mockImplementation(
      async (_markdown: string, _title: string, targetLanguage: string) => {
        if (targetLanguage === "es") {
          throw new Error("es translation failed");
        }
        return {
          markdown: "# translated",
          title: "translated title",
        };
      }
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      failedTranslations: 1,
      codeJsonFailures: 0,
      themeFailures: 0,
    });
    expect(loggedSummary.failures).toHaveLength(1);
  });

  it("exits with failure on total code/theme translation failures and reports counts", async () => {
    mockTranslateJson.mockRejectedValue(new Error("openai outage"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { main } = await import("./index");

    await expect(main()).rejects.toThrow(
      "Translation workflow completed with failures"
    );

    const loggedSummary = findSummaryLog(logSpy);
    expect(loggedSummary).toMatchObject({
      totalEnglishPages: 1,
      processedLanguages: 2,
      codeJsonFailures: 2,
      themeFailures: 4,
    });
    expect(loggedSummary.failures).toHaveLength(6);
  });

  it("emits TRANSLATION_SUMMARY even when required environment is missing", async () => {
    // This test verifies that env validation failures still emit TRANSLATION_SUMMARY
    // The env validation happens inside try/catch, so even early failures emit the summary
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Clear environment variables before importing the module
    const originalEnv = { ...process.env };
    delete process.env.NOTION_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DATA_SOURCE_ID;
    delete process.env.DATABASE_ID;

    try {
      // Import the module with empty environment to trigger env validation failure
      const { main } = await import("./index");

      // Use regex for partial match since error includes list of missing variables
      await expect(main()).rejects.toThrow(
        /Missing required environment variables/
      );

      // Verify that TRANSLATION_SUMMARY was still emitted despite env failure
      const summaryLine = logSpy.mock.calls
        .map((args) => args.map(String).join(" "))
        .find((line) => line.startsWith("TRANSLATION_SUMMARY "));

      expect(summaryLine).toBeTruthy();
      const loggedSummary = JSON.parse(
        summaryLine!.slice("TRANSLATION_SUMMARY ".length)
      );
      expect(loggedSummary).toMatchObject({
        totalEnglishPages: 0,
        processedLanguages: 0,
        newTranslations: 0,
        updatedTranslations: 0,
        skippedTranslations: 0,
        failedTranslations: 0,
        codeJsonFailures: 0,
        themeFailures: 0,
      });
    } finally {
      // Restore environment variables safely
      Object.assign(process.env, originalEnv);
    }
  });

  describe("code.json soft-fail behavior", () => {
    it("continues doc translation when code.json is missing (soft-fail)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock readFile to simulate ENOENT (file not found)
      mockReadFile.mockRejectedValue(
        Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" })
      );

      const { main } = await import("./index");

      // Should NOT throw - should continue with doc translation
      const summary = await main();

      // Verify warning was logged (ignore Docusaurus warnings)
      const codeJsonWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("English code.json")
      );
      expect(codeJsonWarnings.length).toBeGreaterThan(0);

      // Verify doc translation still happened
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 2, // Docs were translated
        codeJsonFailures: 0, // No actual failures when source is missing (soft-fail)
        codeJsonSourceFileMissing: true, // Flag indicates source was missing
        themeFailures: 0, // Theme should still work (doesn't depend on code.json)
      });

      // Verify the failure is marked as non-critical
      const codeJsonFailure = summary.failures.find(
        (f) => f.title === "code.json (source file)"
      );
      expect(codeJsonFailure).toBeDefined();
      expect(codeJsonFailure?.isCritical).toBe(false);
      expect(codeJsonFailure?.error).toContain("Source file not found");

      // Verify TRANSLATION_SUMMARY was emitted
      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toEqual(summary);
    });

    it("continues doc translation when code.json is malformed (soft-fail)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock readFile to return invalid JSON
      mockReadFile.mockResolvedValue('{"invalid": json}');

      const { main } = await import("./index");

      // Should NOT throw - should continue with doc translation
      const summary = await main();

      // Verify warning was logged (ignore Docusaurus warnings)
      const codeJsonWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("English code.json")
      );
      expect(codeJsonWarnings.length).toBeGreaterThan(0);

      // Verify doc translation still happened
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 2, // Docs were translated
        codeJsonFailures: 0, // No actual failures when source is malformed (soft-fail)
        codeJsonSourceFileMissing: true, // Flag indicates source was malformed
        themeFailures: 0,
      });

      // Verify the failure is marked as non-critical
      const codeJsonFailure = summary.failures.find(
        (f) => f.title === "code.json (source file)"
      );
      expect(codeJsonFailure).toBeDefined();
      expect(codeJsonFailure?.isCritical).toBe(false);
      expect(codeJsonFailure?.error).toContain("Source file malformed");

      // Verify TRANSLATION_SUMMARY was emitted
      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toEqual(summary);
    });

    it("translates code.json successfully when file is valid", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Mock valid code.json
      mockReadFile.mockResolvedValue('{"hello": {"message": "Hello"}}');

      const { main } = await import("./index");

      const summary = await main();

      // Verify code.json-specific warnings (allow Docusaurus warnings)
      const codeJsonWarnings = warnSpy.mock.calls.filter((args) =>
        String(args[0]).includes("English code.json")
      );
      expect(codeJsonWarnings.length).toBe(0);

      // Verify code.json was translated successfully
      expect(summary).toMatchObject({
        totalEnglishPages: 1,
        processedLanguages: 2,
        newTranslations: 2,
        codeJsonFailures: 0, // No failures when file is valid
        codeJsonSourceFileMissing: false, // Source file was present
      });

      // Verify translateJson was called:
      // - 2 times for code.json (pt and es)
      // - 4 times for theme (navbar + footer) × 2 languages = 4
      // Total: 6 times
      expect(mockTranslateJson).toHaveBeenCalledTimes(6);

      // Verify TRANSLATION_SUMMARY was emitted
      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toEqual(summary);
    });

    it("reports individual code.json translation failures separately", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Mock valid code.json
      mockReadFile.mockResolvedValue('{"hello": {"message": "Hello"}}');

      // Mock translateJson to fail for Portuguese but succeed for Spanish
      mockTranslateJson.mockImplementation(
        async (_json: string, targetLang: string) => {
          if (targetLang === "Portuguese") {
            throw new Error("Portuguese translation failed");
          }
          return '{"hello": {"message": "Hola"}}';
        }
      );

      const { main } = await import("./index");

      // Should throw due to translation failures
      await expect(main()).rejects.toThrow(
        "Translation workflow completed with failures"
      );

      const loggedSummary = findSummaryLog(logSpy);
      expect(loggedSummary).toMatchObject({
        codeJsonFailures: 1, // Portuguese failed
        codeJsonSourceFileMissing: false, // Source file was present
      });

      // Verify the failure is for Portuguese code.json
      const ptFailure = loggedSummary.failures.find(
        (f: { title: string; language: string }) =>
          f.title === "code.json" && f.language === "pt-BR"
      );
      expect(ptFailure).toBeDefined();
      expect(ptFailure?.error).toContain("Portuguese translation failed");
    });
  });

  describe("deterministic file output", () => {
    it("produces identical file paths when running translation twice with no source changes", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});

      // Track all files written in the first run
      const firstRunFiles: Map<string, string> = new Map();

      // Capture writeFile calls in the first run
      mockWriteFile.mockImplementation(
        async (filePath: string, content: string) => {
          firstRunFiles.set(filePath, content);
          return Promise.resolve();
        }
      );

      const { main: main1 } = await import("./index");
      await main1();

      const firstRunFileCount = firstRunFiles.size;
      const firstRunFilePaths = Array.from(firstRunFiles.keys());

      // Reset mocks for second run
      mockWriteFile.mockClear();

      // Track all files written in the second run
      const secondRunFiles: Map<string, string> = new Map();
      mockWriteFile.mockImplementation(
        async (filePath: string, content: string) => {
          secondRunFiles.set(filePath, content);
          return Promise.resolve();
        }
      );

      // Reset other mocks for the second run
      mockFetchNotionData.mockReset();
      mockSortAndExpandNotionData.mockReset();
      mockFetchNotionData.mockImplementation(async (filter) => {
        if (
          filter?.and?.some(
            (condition: { property?: string }) =>
              condition.property === "Publish Status"
          )
        ) {
          return [
            createMockNotionPage({
              id: "english-page-1",
              title: "Hello World",
              status: "Ready for translation",
              language: "English",
              order: 7,
              parentItem: "parent-1",
              elementType: "Page",
              lastEdited: "2026-02-01T00:00:00.000Z",
            }),
          ];
        }
        return [];
      });
      mockSortAndExpandNotionData.mockImplementation(async (pages) => pages);

      // Get a fresh import for the second run
      const { main: main2 } = await import("./index");

      // Run translation a second time with the same source
      await main2();

      const secondRunFileCount = secondRunFiles.size;
      const secondRunFilePaths = Array.from(secondRunFiles.keys());

      // Verify: same number of files written
      expect(secondRunFileCount).toBe(firstRunFileCount);

      // Verify: identical file paths (no -1/-2 suffix drift)
      expect(secondRunFilePaths).toEqual(firstRunFilePaths);

      // Verify: file contents are identical
      for (const filePath of firstRunFilePaths) {
        expect(secondRunFiles.get(filePath)).toBe(firstRunFiles.get(filePath));
      }

      // Verify: no files have suffixes like -1, -2, -3
      const filesWithNumericSuffixes = firstRunFilePaths.filter(
        (path) =>
          /-\d+\.md$/.test(path) ||
          /-\d+\.json$/.test(path) ||
          /-\d+\/_category_\.json$/.test(path)
      );
      expect(filesWithNumericSuffixes).toEqual([]);
    });

    it("generates deterministic filenames using stable page ID", async () => {
      const { saveTranslatedContentToDisk } = await import("./index");

      const mockPage = createMockNotionPage({
        id: "abc123def456", // Stable ID
        title: "Test Page",
        elementType: "Page",
      });

      const mockConfig = {
        language: "pt-BR",
        notionLangCode: "Portuguese",
        outputDir: "/test/output",
      };

      const filePath1 = await saveTranslatedContentToDisk(
        mockPage,
        "# Test Content",
        mockConfig
      );

      const filePath2 = await saveTranslatedContentToDisk(
        mockPage,
        "# Test Content",
        mockConfig
      );

      // Both calls should produce the same exact path
      expect(filePath1).toBe(filePath2);

      // The filename should include the stable page ID (sanitized)
      expect(filePath1).toContain("abc123def456");
      expect(filePath1).toContain("test-page");
    });
  });
});
