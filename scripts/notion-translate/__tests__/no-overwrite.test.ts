/**
 * Integration tests for the no-overwrite translation strategy (Issue #171).
 *
 * Tests the routing logic in processLanguageTranslations() that determines
 * whether to use the automated path (when an existing translation is found)
 * or the normal new-translation path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockNotionPage, installTestNotionEnv } from "../../test-utils";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that trigger module resolution
// ---------------------------------------------------------------------------

const mockFetchNotionData = vi.fn();
const mockSortAndExpandNotionData = vi.fn();
const mockTranslateText = vi.fn();
const mockTranslateJson = vi.fn();
const mockExtractTranslatableText = vi.fn();
const mockGetLanguageName = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockAccess = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockBlocksChildrenList = vi.fn();
const mockPagesRetrieve = vi.fn();
const mockResolveCanonicalDocsRelativePath = vi.fn();
const mockNotionDataSourcesQuery = vi.fn();
const mockNotionDataSourcesRetrieve = vi.fn();
const mockNotionDatabasesRetrieve = vi.fn();
const mockNotionPagesCreate = vi.fn();
const mockNotionPagesUpdate = vi.fn();
const mockNotionBlocksChildrenList = vi.fn();
const mockNotionBlocksChildrenAppend = vi.fn();
const mockNotionBlocksDelete = vi.fn();
const defaultMockDatabaseId = "test-database-id";
const defaultMockDataSourceId = "test-data-source-id";
let mockDatabaseId: string | undefined = defaultMockDatabaseId;
let mockDataSourceId: string | undefined = defaultMockDataSourceId;
const mockSchedulerDestroy = vi.fn();
const mockGetRequestScheduler = vi.fn(() => ({
  destroy: mockSchedulerDestroy,
}));

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

vi.mock("../../notionClient", () => ({
  notion: {
    dataSources: {
      query: mockNotionDataSourcesQuery,
      retrieve: mockNotionDataSourcesRetrieve,
    },
    databases: { retrieve: mockNotionDatabasesRetrieve },
    pages: { create: mockNotionPagesCreate, update: mockNotionPagesUpdate },
    blocks: {
      children: {
        list: mockNotionBlocksChildrenList,
        append: mockNotionBlocksChildrenAppend,
      },
      delete: mockNotionBlocksDelete,
    },
  },
  get DATABASE_ID() {
    return mockDatabaseId;
  },
  get DATA_SOURCE_ID() {
    return mockDataSourceId;
  },
  n2m: mockN2m,
  enhancedNotion: {
    dataSourcesQuery: mockNotionDataSourcesQuery,
    blocksChildrenList: mockBlocksChildrenList,
    pagesRetrieve: mockPagesRetrieve,
  },
}));

vi.mock("../../fetchNotionData.js", () => ({
  fetchNotionData: mockFetchNotionData,
  sortAndExpandNotionData: mockSortAndExpandNotionData,
}));

vi.mock("../../notion-fetch/requestScheduler", () => ({
  getRequestScheduler: mockGetRequestScheduler,
}));

vi.mock("../../notion-fetch/pageMetadataCache.js", () => ({
  resolveCanonicalDocsRelativePath: mockResolveCanonicalDocsRelativePath,
}));

vi.mock("../translateFrontMatter", () => ({
  translateText: mockTranslateText,
  TranslationError: class TranslationError extends Error {
    isCritical = true;
  },
}));

vi.mock("../translateCodeJson", () => ({
  translateJson: mockTranslateJson,
  extractTranslatableText: mockExtractTranslatableText,
  getLanguageName: mockGetLanguageName,
}));

// ---------------------------------------------------------------------------
// Helper: set up common mock defaults for a given English page
// ---------------------------------------------------------------------------

type FilterCondition = {
  property?: string;
  select?: { equals?: string };
  relation?: { contains?: string };
};

function createLanguageSchemaResponse(optionNames: string[] = []) {
  return {
    properties: {
      Language: {
        type: "select",
        select: {
          options: optionNames.map((name) => ({ name })),
        },
      },
    },
  };
}

function setupCommonMocks(
  englishPage: ReturnType<typeof createMockNotionPage>,
  translationsByLanguage: Record<
    string,
    ReturnType<typeof createMockNotionPage>
  > = {}
) {
  mockFetchNotionData.mockImplementation(async (filter: unknown) => {
    const f = filter as { and?: FilterCondition[] };
    // English page fetch (Publish Status filter)
    if (f?.and?.some((c) => c.property === "Publish Status") || !f?.and) {
      return [englishPage];
    }
    // Translation lookup (Parent item + Language)
    const langCondition = f?.and?.find((c) => c.property === "Language");
    if (langCondition?.select?.equals) {
      const lang = langCondition.select.equals;
      return translationsByLanguage[lang] ? [translationsByLanguage[lang]] : [];
    }
    return [];
  });
  mockSortAndExpandNotionData.mockImplementation(
    async (pages: unknown[]) => pages
  );
  mockN2m.pageToMarkdown.mockResolvedValue([]);
  mockN2m.toMarkdownString.mockReturnValue({
    parent: "# Translated\n\nContent",
  });
  mockBlocksChildrenList.mockResolvedValue({
    results: [
      {
        type: "heading_1",
        has_children: false,
        heading_1: { rich_text: [{ plain_text: "Translated content" }] },
      },
    ],
    has_more: false,
    next_cursor: null,
  });
  mockNotionDataSourcesQuery.mockResolvedValue({
    results: [],
    has_more: false,
  });
  mockNotionDataSourcesRetrieve.mockResolvedValue(
    createLanguageSchemaResponse([
      "Portuguese",
      "Spanish",
      "PT - automated",
      "ES - automated",
    ])
  );
  mockNotionDatabasesRetrieve.mockResolvedValue(
    createLanguageSchemaResponse([
      "Portuguese",
      "Spanish",
      "PT - automated",
      "ES - automated",
    ])
  );
  mockNotionPagesCreate.mockResolvedValue({ id: "new-page-id" });
  mockNotionPagesUpdate.mockResolvedValue({});
  mockNotionBlocksChildrenList.mockResolvedValue({
    results: [],
    has_more: false,
  });
  mockNotionBlocksChildrenAppend.mockResolvedValue({});
  mockNotionBlocksDelete.mockResolvedValue({});
  mockTranslateText.mockResolvedValue({
    markdown: "# Traduzido",
    title: "Traduzido",
  });
  mockTranslateJson.mockResolvedValue("{}");
  mockExtractTranslatableText.mockReturnValue({});
  mockGetLanguageName.mockImplementation((lang: string) =>
    lang === "pt" ? "Portuguese" : "Spanish"
  );
  mockResolveCanonicalDocsRelativePath.mockImplementation((pageId: string) =>
    pageId === englishPage.id ? "test-page.md" : null
  );
  // Default: i18n file does NOT exist
  mockAccess.mockRejectedValue(new Error("ENOENT"));
  mockReadFile.mockResolvedValue("");
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  // translateThemeConfig needs readdir to return an iterable
  mockReaddir.mockResolvedValue([]);
}

// ---------------------------------------------------------------------------
// Helper: set up mocks for three-level hierarchy (ParentContainer → ChildEnglish,
// ChildPT).  The key difference from setupCommonMocks is that the "Publish Status"
// filter returns MULTIPLE English pages (both ParentContainer and ChildEnglish),
// matching how fetchPublishedEnglishPages() returns all Language=English pages.
// ---------------------------------------------------------------------------

function setupThreeLevelMocks(
  englishPages: ReturnType<typeof createMockNotionPage>[],
  translationsByLanguage: Record<
    string,
    ReturnType<typeof createMockNotionPage>
  > = {}
) {
  // Collect all page IDs that should resolve to a canonical path
  const canonicalPageIds = new Set(englishPages.map((p) => p.id));

  mockFetchNotionData.mockImplementation(async (filter: unknown) => {
    const f = filter as { and?: FilterCondition[] };
    // English page fetch (Publish Status filter or no filter)
    if (f?.and?.some((c) => c.property === "Publish Status") || !f?.and) {
      return englishPages;
    }
    // Translation lookup (Parent item + Language)
    const langCondition = f?.and?.find((c) => c.property === "Language");
    if (langCondition?.select?.equals) {
      const lang = langCondition.select.equals;
      return translationsByLanguage[lang] ? [translationsByLanguage[lang]] : [];
    }
    return [];
  });
  mockSortAndExpandNotionData.mockImplementation(
    async (pages: unknown[]) => pages
  );
  mockN2m.pageToMarkdown.mockResolvedValue([]);
  mockN2m.toMarkdownString.mockReturnValue({
    parent: "# Translated\n\nContent",
  });
  mockBlocksChildrenList.mockResolvedValue({
    results: [
      {
        type: "heading_1",
        has_children: false,
        heading_1: { rich_text: [{ plain_text: "Translated content" }] },
      },
    ],
    has_more: false,
    next_cursor: null,
  });
  mockNotionDataSourcesQuery.mockResolvedValue({
    results: [],
    has_more: false,
  });
  mockNotionDataSourcesRetrieve.mockResolvedValue(
    createLanguageSchemaResponse([
      "Portuguese",
      "Spanish",
      "PT - automated",
      "ES - automated",
    ])
  );
  mockNotionDatabasesRetrieve.mockResolvedValue(
    createLanguageSchemaResponse([
      "Portuguese",
      "Spanish",
      "PT - automated",
      "ES - automated",
    ])
  );
  mockNotionPagesCreate.mockResolvedValue({ id: "new-page-id" });
  mockNotionPagesUpdate.mockResolvedValue({});
  mockNotionBlocksChildrenList.mockResolvedValue({
    results: [],
    has_more: false,
  });
  mockNotionBlocksChildrenAppend.mockResolvedValue({});
  mockNotionBlocksDelete.mockResolvedValue({});
  mockTranslateText.mockResolvedValue({
    markdown: "# Traduzido",
    title: "Traduzido",
  });
  mockTranslateJson.mockResolvedValue("{}");
  mockExtractTranslatableText.mockReturnValue({});
  mockGetLanguageName.mockImplementation((lang: string) =>
    lang === "pt" ? "Portuguese" : "Spanish"
  );
  mockResolveCanonicalDocsRelativePath.mockImplementation((pageId: string) =>
    canonicalPageIds.has(pageId) ? "test-page.md" : null
  );
  // Default: i18n file does NOT exist
  mockAccess.mockRejectedValue(new Error("ENOENT"));
  mockReadFile.mockResolvedValue("");
  mockWriteFile.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  // translateThemeConfig needs readdir to return an iterable
  mockReaddir.mockResolvedValue([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("no-overwrite translation routing (Issue #171)", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = installTestNotionEnv();
    vi.resetModules();
    vi.resetAllMocks();
    mockDatabaseId = defaultMockDatabaseId;
    mockDataSourceId = defaultMockDataSourceId;
    // Re-wire mocks after reset
    mockGetRequestScheduler.mockReturnValue({ destroy: mockSchedulerDestroy });
    mockNotionDataSourcesRetrieve.mockReset();
  });

  afterEach(() => {
    restoreEnv();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: No existing translation → normal new-translation path
  // -------------------------------------------------------------------------
  it("Scenario 1: no existing translation → creates new translation normally", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc1",
      title: "Test Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-1",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage);
    // No Portuguese or Spanish translations returned
    mockNotionDataSourcesQuery.mockResolvedValue({
      results: [],
      has_more: false,
    });

    const { main } = await import("../index.js");
    const summary = await main({});

    // Both languages create new pages — no automated path
    expect(summary.automatedTranslations).toBe(0);
    expect(summary.newTranslations).toBe(2); // pt-BR + es
    expect(summary.failedTranslations).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Existing translation, translation is NEWER → skips
  // -------------------------------------------------------------------------
  it("Scenario 2: existing translation is newer than English → skips (no update)", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc2",
      title: "Test Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-2",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z", // English is OLDER
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc2",
      title: "Página de Teste",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-2",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z", // Translation is NEWER
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc2",
      title: "Página de Prueba",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-2",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });
    // Translation blocks exist with content → needsTranslationUpdate returns needsUpdate=false

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.skippedTranslations).toBe(2); // both languages skipped
    expect(summary.automatedTranslations).toBe(0);
    expect(summary.newTranslations).toBe(0);
    expect(summary.updatedTranslations).toBe(0);
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();
    expect(mockNotionPagesUpdate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Existing translation, English IS newer → automated path
  // -------------------------------------------------------------------------
  it("Scenario 3: existing translation, English is newer → automated path (new page, not update)", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc3",
      title: "Test Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-3",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z", // English is NEWER
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc3",
      title: "Página de Teste",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-3",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z", // Translation is OLDER
    });

    setupCommonMocks(englishPage, { Portuguese: ptTranslation });

    const { main } = await import("../index.js");
    const summary = await main({});

    // Portuguese → automated path (English newer, existing translation exists)
    // Spanish → normal new translation path (no existing translation)
    expect(summary.automatedTranslations).toBe(1);
    expect(summary.newTranslations).toBe(1); // Spanish
    expect(summary.updatedTranslations).toBe(0); // No updates
    expect(summary.failedTranslations).toBe(0);

    // Automated path always creates (forceCreate) — never updates
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(2); // 1 automated PT + 1 new ES
    expect(mockNotionPagesUpdate).toHaveBeenCalledTimes(0);

    // Disk write called for the automated translation
    expect(mockWriteFile).toHaveBeenCalled();
    const writeCalls = mockWriteFile.mock.calls.map(
      ([p]: [string]) => p as string
    );
    const automatedWrite = writeCalls.some((p) =>
      p.includes("automated-translations")
    );
    expect(automatedWrite).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: localOnly + existing i18n file → automated path, no Notion calls
  // -------------------------------------------------------------------------
  it("Scenario 4: localOnly mode with existing i18n file → automated path, no Notion calls", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc4",
      title: "Test Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-4",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage);
    // In localOnly mode, no Notion queries for translations
    // But we simulate an existing i18n file on disk
    mockAccess.mockResolvedValue(undefined); // i18n file EXISTS

    const { main } = await import("../index.js");
    const summary = await main({ localOnly: true });

    expect(summary.automatedTranslations).toBe(2); // Both PT and ES routes automated
    expect(summary.newTranslations).toBe(0);
    expect(summary.failedTranslations).toBe(0);

    // localOnly → no Notion API calls
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();
    expect(mockNotionPagesUpdate).not.toHaveBeenCalled();

    // Disk write to automated-translations/ directory
    const writeCalls = mockWriteFile.mock.calls.map(
      ([p]: [string]) => p as string
    );
    const automatedWrite = writeCalls.some((p) =>
      p.includes("automated-translations")
    );
    expect(automatedWrite).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: localOnly + NO existing i18n file → normal new translation
  // -------------------------------------------------------------------------
  it("Scenario 5: localOnly mode with no existing i18n file → creates normally", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc5",
      title: "Test Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-5",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage);
    // i18n file does NOT exist (default in setupCommonMocks)
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const { main } = await import("../index.js");
    const summary = await main({ localOnly: true });

    expect(summary.automatedTranslations).toBe(0);
    expect(summary.newTranslations).toBe(2); // Both PT and ES created normally
    expect(summary.failedTranslations).toBe(0);

    // localOnly → no Notion API calls
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();
    expect(mockNotionPagesUpdate).not.toHaveBeenCalled();

    // Normal i18n path used (not automated-translations/)
    const writeCalls = mockWriteFile.mock.calls.map(
      ([p]: [string]) => p as string
    );
    const automatedWrite = writeCalls.some((p) =>
      p.includes("automated-translations")
    );
    expect(automatedWrite).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: verification-error updateKind → automated path (safe default)
  // -------------------------------------------------------------------------
  it("Scenario 6: block check throws → verification-error → routes to automated path", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc6",
      title: "Test Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-6",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z", // Same date — would normally skip
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc6",
      title: "Página de Teste",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-6",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z", // Same date as English
    });

    setupCommonMocks(englishPage, { Portuguese: ptTranslation });
    // Simulate block count API failure only for the PT translation page → verification-error
    // English and other pages work normally (needed for translateNotionBlocksDirectly)
    mockBlocksChildrenList.mockImplementation(
      async ({ block_id }: { block_id: string }) => {
        if (block_id === ptTranslation.id) {
          throw new Error("API timeout");
        }
        return {
          results: [
            {
              type: "heading_1",
              has_children: false,
              heading_1: { rich_text: [{ plain_text: "Content" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        };
      }
    );

    const { main } = await import("../index.js");
    const summary = await main({});

    // verification-error routes to automated path (safe default — never overwrites)
    expect(summary.automatedTranslations).toBe(1); // PT → automated
    expect(summary.newTranslations).toBe(1); // ES → new
    expect(summary.updatedTranslations).toBe(0);
    expect(summary.failedTranslations).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Toggle page in automated path → skipped
  // -------------------------------------------------------------------------
  it("Scenario 7: toggle page routed to automated path → skipped at gate before automated processing", async () => {
    const toggleEnglishPage = createMockNotionPage({
      id: "en-toggle-sc7",
      title: "Toggle Section",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-7",
      elementType: "toggle",
      lastEdited: "2026-02-01T00:00:00.000Z", // English newer
    });
    const ptToggleTranslation = createMockNotionPage({
      id: "pt-toggle-sc7",
      title: "Seção Toggle",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-7",
      elementType: "toggle",
      lastEdited: "2026-01-01T00:00:00.000Z", // Translation older
    });
    const esToggleTranslation = createMockNotionPage({
      id: "es-toggle-sc7",
      title: "Sección Toggle",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-7",
      elementType: "toggle",
      lastEdited: "2026-01-01T00:00:00.000Z", // Translation older
    });

    setupCommonMocks(toggleEnglishPage, {
      Portuguese: ptToggleTranslation,
      Spanish: esToggleTranslation,
    });
    mockResolveCanonicalDocsRelativePath.mockReturnValue(null);

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.failedTranslations).toBe(0);
    expect(summary.automatedTranslations).toBe(0);
    expect(summary.skippedTranslations).toBe(2);
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();

    const automatedWrite = mockWriteFile.mock.calls.some(([p]) =>
      String(p).includes("automated-translations")
    );
    expect(automatedWrite).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Three-level hierarchy — sibling matching via shared container
  //
  // Hierarchy: ParentContainer (English, no Parent item)
  //              ├── ChildEnglish (English, Parent item → ParentContainer)
  //              └── ChildPT      (Portuguese, Parent item → ParentContainer)
  //
  // When main() processes ChildEnglish, findTranslationPage() queries for
  // pages with Parent item = ParentContainer.id AND Language = Portuguese,
  // which returns ChildPT.  The test does NOT use --local-only.
  // -------------------------------------------------------------------------
  it("Scenario 8: three-level hierarchy — ChildEnglish resolves ChildPT via shared container", async () => {
    const containerId = "parent-container-sc8";

    const childEnglish = createMockNotionPage({
      id: "child-en-sc8",
      title: "Child English Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: containerId,
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z", // English is NEWER
    });
    const childPT = createMockNotionPage({
      id: "child-pt-sc8",
      title: "Página em Português",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: containerId,
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z", // Translation is OLDER
    });

    // Only ChildEnglish in the English page set (container excluded)
    setupThreeLevelMocks([childEnglish], {
      Portuguese: childPT,
    });

    const { main } = await import("../index.js");
    const summary = await main({});

    // Portuguese → automated path (ChildEnglish newer, existing PT found via container)
    // Spanish → normal new translation path (no existing translation)
    expect(summary.automatedTranslations).toBe(1);
    expect(summary.newTranslations).toBe(1); // Spanish
    expect(summary.updatedTranslations).toBe(0);
    expect(summary.failedTranslations).toBe(0);

    // Automated path always creates (forceCreate) — never updates
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(2); // 1 automated PT + 1 new ES
    expect(mockNotionPagesUpdate).toHaveBeenCalledTimes(0);

    // Disk write to automated-translations/ directory
    const writeCalls = mockWriteFile.mock.calls.map(
      ([p]: [string]) => p as string
    );
    const automatedWrite = writeCalls.some((p) =>
      p.includes("automated-translations")
    );
    expect(automatedWrite).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Batch-mode with container — ParentContainer skipped, ChildEnglish processed
  //
  // Hierarchy: ParentContainer (English, no Parent item)
  //              ├── ChildEnglish (English, Parent item → ParentContainer)
  //              └── ChildPT      (Portuguese, Parent item → ParentContainer)
  //
  // fetchPublishedEnglishPages() returns BOTH ParentContainer and ChildEnglish.
  // ParentContainer is skipped (no Parent item relation in batch mode).
  // ChildEnglish is processed and reaches the automated no-overwrite path.
  // -------------------------------------------------------------------------
  it("Scenario 9: batch-mode with container — container skipped, child processed", async () => {
    const containerId = "parent-container-sc9";

    const parentContainer = createMockNotionPage({
      id: containerId,
      title: "Parent Container",
      status: "Ready for translation",
      language: "English",
      order: 0,
      // No parentItem — this is the top-level container
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const childEnglish = createMockNotionPage({
      id: "child-en-sc9",
      title: "Child English Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: containerId,
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z", // English is NEWER
    });
    const childPT = createMockNotionPage({
      id: "child-pt-sc9",
      title: "Página em Português",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: containerId,
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z", // Translation is OLDER
    });

    // Both ParentContainer and ChildEnglish returned by fetchPublishedEnglishPages
    setupThreeLevelMocks([parentContainer, childEnglish], {
      Portuguese: childPT,
    });

    const { main } = await import("../index.js");
    const summary = await main({});

    // ParentContainer is skipped (no Parent item) — counted once per language
    // ChildEnglish: PT → automated (English newer, existing PT found), ES → new
    // Total skips = 2 (ParentContainer skipped for both PT and ES)
    expect(summary.skippedTranslations).toBe(2);
    expect(summary.automatedTranslations).toBe(1); // ChildEnglish PT → automated
    expect(summary.newTranslations).toBe(1); // ChildEnglish ES → new
    expect(summary.updatedTranslations).toBe(0);
    expect(summary.failedTranslations).toBe(0);

    // 1 automated PT page + 1 new ES page (container generates no pages)
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(2);
    expect(mockNotionPagesUpdate).toHaveBeenCalledTimes(0);

    // Disk write to automated-translations/ directory
    const writeCalls = mockWriteFile.mock.calls.map(
      ([p]: [string]) => p as string
    );
    const automatedWrite = writeCalls.some((p) =>
      p.includes("automated-translations")
    );
    expect(automatedWrite).toBe(true);
  });

  it("Scenario 10: missing automated select options → reports TranslationError", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc10",
      title: "Automated Validation Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-10",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc10",
      title: "Página de Validação",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-10",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc10",
      title: "Página de Validación",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-10",
      elementType: "Page",
      lastEdited: "2026-03-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });
    mockNotionDataSourcesRetrieve.mockResolvedValue(
      createLanguageSchemaResponse(["Portuguese", "Spanish"])
    );
    mockNotionDatabasesRetrieve.mockResolvedValue(
      createLanguageSchemaResponse(["Portuguese", "Spanish"])
    );

    const { main } = await import("../index.js");
    await expect(main({})).rejects.toThrow(
      "Translation workflow completed with failures (docs: 1, code.json: 0, theme: 0)"
    );

    expect(mockNotionDataSourcesRetrieve).toHaveBeenCalledTimes(1);
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();
  });

  it("Scenario 11: DATA_SOURCE_ID-only workflow validates via data source and continues automated processing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const englishPage = createMockNotionPage({
      id: "en-page-sc11",
      title: "Automated Warning Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-11",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc11",
      title: "Página de Aviso",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-11",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc11",
      title: "Página de Aviso ES",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-11",
      elementType: "Page",
      lastEdited: "2026-03-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });
    mockDatabaseId = undefined;
    delete process.env.DATABASE_ID;
    process.env.DATA_SOURCE_ID = defaultMockDataSourceId;

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.automatedTranslations).toBe(1);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.skippedTranslations).toBe(1);
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(1);
    // Validation warning must NOT fire when DATA_SOURCE_ID is present
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Cannot verify automated language select options")
    );

    warnSpy.mockRestore();
  });

  it("Scenario 11a: validates against the active data source when DATABASE_ID differs", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc11a",
      title: "Active Source Validation Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-11a",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc11a",
      title: "Página de Origem Ativa",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-11a",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc11a",
      title: "Página de Origem Ativa ES",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-11a",
      elementType: "Page",
      lastEdited: "2026-03-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });
    mockNotionDatabasesRetrieve.mockResolvedValue(
      createLanguageSchemaResponse([])
    );
    mockNotionDataSourcesRetrieve.mockResolvedValue(
      createLanguageSchemaResponse([
        "Portuguese",
        "Spanish",
        "PT - automated",
        "ES - automated",
      ])
    );

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.automatedTranslations).toBe(1);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.skippedTranslations).toBe(1);
    expect(mockNotionDataSourcesRetrieve).toHaveBeenCalledTimes(1);
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(1);
  });

  it("Scenario 12: successful automated option validation → automated processing continues", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc11",
      title: "Automated Success Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-11",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc11",
      title: "Página de Sucesso",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-11",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc11",
      title: "Página de Éxito",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-11",
      elementType: "Page",
      lastEdited: "2026-03-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.automatedTranslations).toBe(1);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.skippedTranslations).toBe(1);
    expect(mockNotionDataSourcesRetrieve).toHaveBeenCalledTimes(1);
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(1);
  });

  it("Scenario 13: automated language validation runs once per process", async () => {
    const englishPage = createMockNotionPage({
      id: "en-page-sc12",
      title: "Automated Cache Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-12",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc12",
      title: "Página Cache PT",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-12",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc12",
      title: "Página Cache ES",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-12",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.automatedTranslations).toBe(2);
    expect(summary.failedTranslations).toBe(0);
    expect(mockNotionDataSourcesRetrieve).toHaveBeenCalledTimes(1);
    expect(mockNotionDatabasesRetrieve).not.toHaveBeenCalled();
    expect(mockNotionPagesCreate).toHaveBeenCalledTimes(2);
  });

  it("Scenario 14: automated block translation failure skips Notion page creation but still saves disk artifact", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const englishPage = createMockNotionPage({
      id: "en-page-sc14",
      title: "Automated Block Failure Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-14",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc14",
      title: "Página com Falha de Blocos",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-14",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc14",
      title: "Página con Bloques",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-14",
      elementType: "Page",
      lastEdited: "2026-03-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });
    mockBlocksChildrenList.mockImplementation(
      async ({ block_id }: { block_id: string }) => {
        if (block_id === englishPage.id) {
          throw new Error("block translation failed");
        }
        return {
          results: [
            {
              type: "heading_1",
              has_children: false,
              heading_1: { rich_text: [{ plain_text: "Content" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        };
      }
    );

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.automatedTranslations).toBe(1);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.skippedTranslations).toBe(1);
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();

    const writePaths = mockWriteFile.mock.calls.map(([filePath]) =>
      String(filePath)
    );
    expect(
      writePaths.some(
        (filePath) =>
          filePath.includes("automated-translations") &&
          filePath.endsWith(".md")
      )
    ).toBe(true);
    expect(
      writePaths.some((filePath) => filePath.endsWith(".notion.json"))
    ).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not translate Notion blocks for "Automated Block Failure Page": block translation failed — skipping Notion page creation to avoid an empty page'
      )
    );

    warnSpy.mockRestore();
  });

  it("Scenario 15: empty translated Notion blocks skip Notion page creation but still save disk artifact", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const englishPage = createMockNotionPage({
      id: "en-page-sc15",
      title: "Automated Empty Blocks Page",
      status: "Ready for translation",
      language: "English",
      order: 1,
      parentItem: "parent-15",
      elementType: "Page",
      lastEdited: "2026-02-01T00:00:00.000Z",
    });
    const ptTranslation = createMockNotionPage({
      id: "pt-page-sc15",
      title: "Página com Blocos Vazios",
      status: "Auto Translation Generated",
      language: "Portuguese",
      order: 1,
      parentItem: "parent-15",
      elementType: "Page",
      lastEdited: "2026-01-01T00:00:00.000Z",
    });
    const esTranslation = createMockNotionPage({
      id: "es-page-sc15",
      title: "Página con Bloques Vacíos",
      status: "Auto Translation Generated",
      language: "Spanish",
      order: 1,
      parentItem: "parent-15",
      elementType: "Page",
      lastEdited: "2026-03-01T00:00:00.000Z",
    });

    setupCommonMocks(englishPage, {
      Portuguese: ptTranslation,
      Spanish: esTranslation,
    });
    mockBlocksChildrenList.mockImplementation(
      async ({ block_id }: { block_id: string }) => {
        if (block_id === englishPage.id) {
          return {
            results: [],
            has_more: false,
            next_cursor: null,
          };
        }

        return {
          results: [
            {
              type: "heading_1",
              has_children: false,
              heading_1: { rich_text: [{ plain_text: "Content" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        };
      }
    );

    const { main } = await import("../index.js");
    const summary = await main({});

    expect(summary.automatedTranslations).toBe(1);
    expect(summary.failedTranslations).toBe(0);
    expect(summary.skippedTranslations).toBe(1);
    expect(mockNotionPagesCreate).not.toHaveBeenCalled();

    const writePaths = mockWriteFile.mock.calls.map(([filePath]) =>
      String(filePath)
    );
    expect(
      writePaths.some(
        (filePath) =>
          filePath.includes("automated-translations") &&
          filePath.endsWith(".md")
      )
    ).toBe(true);
    expect(
      writePaths.some((filePath) => filePath.endsWith(".notion.json"))
    ).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Translated Notion blocks for "Automated Empty Blocks Page" were empty — skipping Notion page creation to avoid an empty page'
      )
    );

    warnSpy.mockRestore();
  });
});
