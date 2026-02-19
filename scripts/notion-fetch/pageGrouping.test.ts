import { describe, it, expect } from "vitest";
import {
  getElementTypeProperty,
  resolvePageTitle,
  resolvePageLocale,
  getOrderedLocales,
  groupPagesByLang,
  createStandalonePageGroup,
  ensureTranslationSiblings,
  getTranslationLocales,
  hasTranslation,
  getMissingTranslations,
  type TranslationSiblingsResult,
} from "./pageGrouping";
import { NOTION_PROPERTIES } from "../constants";

describe("pageGrouping", () => {
  describe("getElementTypeProperty", () => {
    it("should return Element Type property when available", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Page" },
          },
        },
      };
      const result = getElementTypeProperty(page);
      expect(result).toEqual({ select: { name: "Page" } });
    });

    it("should fall back to Section property when Element Type is missing", () => {
      const page = {
        properties: {
          Section: {
            select: { name: "Toggle" },
          },
        },
      };
      const result = getElementTypeProperty(page);
      expect(result).toEqual({ select: { name: "Toggle" } });
    });

    it("should return undefined when both properties are missing", () => {
      const page = {
        properties: {},
      };
      const result = getElementTypeProperty(page);
      expect(result).toBeUndefined();
    });

    it("should prefer Element Type over Section when both exist", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Page" },
          },
          Section: {
            select: { name: "Toggle" },
          },
        },
      };
      const result = getElementTypeProperty(page);
      expect(result).toEqual({ select: { name: "Page" } });
    });
  });

  describe("resolvePageTitle", () => {
    it("should resolve title from Title property with title field", () => {
      const page = {
        id: "page-123",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "My Page Title" }],
          },
        },
      };
      expect(resolvePageTitle(page)).toBe("My Page Title");
    });

    it("should resolve title from Title property with text.content", () => {
      const page = {
        id: "page-123",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ type: "text", text: { content: "Text Content Title" } }],
          },
        },
      };
      expect(resolvePageTitle(page)).toBe("Text Content Title");
    });

    it("should fall back to uppercase Title property", () => {
      const page = {
        id: "page-123",
        properties: {
          Title: {
            title: [{ plain_text: "Uppercase Title" }],
          },
        },
      };
      expect(resolvePageTitle(page)).toBe("Uppercase Title");
    });

    it("should fall back to lowercase title property", () => {
      const page = {
        id: "page-123",
        properties: {
          title: {
            title: [{ plain_text: "Lowercase Title" }],
          },
        },
      };
      expect(resolvePageTitle(page)).toBe("Lowercase Title");
    });

    it("should use rich_text when title is not available", () => {
      const page = {
        id: "page-123",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            rich_text: [{ plain_text: "Rich Text Title" }],
          },
        },
      };
      expect(resolvePageTitle(page)).toBe("Rich Text Title");
    });

    it("should return fallback title when no title property exists", () => {
      const page = {
        id: "page-12345678",
        properties: {},
      };
      expect(resolvePageTitle(page)).toBe("untitled-page-123");
    });

    it("should handle string property directly", () => {
      const page = {
        id: "page-123",
        properties: {
          [NOTION_PROPERTIES.TITLE]: "Direct String Title",
        },
      };
      expect(resolvePageTitle(page)).toBe("Direct String Title");
    });

    it("should handle missing properties object", () => {
      const page = {
        id: "page-12345678",
      };
      expect(resolvePageTitle(page)).toBe("untitled-page-123");
    });

    it("should truncate page ID to 8 characters for fallback", () => {
      const page = {
        id: "very-long-page-id-with-many-characters",
        properties: {},
      };
      const result = resolvePageTitle(page);
      expect(result).toBe("untitled-very-lon");
    });

    it("should use first non-empty title from candidates", () => {
      const page = {
        id: "page-123",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [],
          },
          Title: {
            title: [{ plain_text: "Valid Title" }],
          },
        },
      };
      expect(resolvePageTitle(page)).toBe("Valid Title");
    });
  });

  describe("resolvePageLocale", () => {
    it("should resolve English locale", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "English" },
          },
        },
      };
      expect(resolvePageLocale(page)).toBe("en");
    });

    it("should resolve Spanish locale", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Spanish" },
          },
        },
      };
      expect(resolvePageLocale(page)).toBe("es");
    });

    it("should resolve Portuguese locale", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Portuguese" },
          },
        },
      };
      expect(resolvePageLocale(page)).toBe("pt");
    });

    it("should fall back to Language property when LANGUAGE is missing", () => {
      const page = {
        properties: {
          Language: {
            select: { name: "Spanish" },
          },
        },
      };
      expect(resolvePageLocale(page)).toBe("es");
    });

    it("should return default locale when language is not recognized", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "French" },
          },
        },
      };
      expect(resolvePageLocale(page)).toBe("en"); // default locale from config
    });

    it("should return default locale when language property is missing", () => {
      const page = {
        properties: {},
      };
      expect(resolvePageLocale(page)).toBe("en");
    });

    it("should return default locale when select is missing", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.LANGUAGE]: {},
        },
      };
      expect(resolvePageLocale(page)).toBe("en");
    });

    it("should return default locale when name is missing", () => {
      const page = {
        properties: {
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: {},
          },
        },
      };
      expect(resolvePageLocale(page)).toBe("en");
    });
  });

  describe("groupPagesByLang", () => {
    it("should order grouped content locales deterministically with EN first", () => {
      const englishSubpage = {
        id: "en-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "English Title" }],
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "English" },
          },
        },
      };

      const portugueseSubpage = {
        id: "pt-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Titulo em Portugues" }],
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Portuguese" },
          },
        },
      };

      const spanishSubpage = {
        id: "es-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Titulo en Espanol" }],
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Spanish" },
          },
        },
      };

      const mainPage = {
        id: "main-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Main Page" }],
          },
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Page" },
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "English" },
          },
          "Sub-item": {
            relation: [
              { id: "es-page-1" },
              { id: "pt-page-1" },
              { id: "en-page-1" },
            ],
          },
        },
      };

      const pages = [
        mainPage,
        spanishSubpage,
        portugueseSubpage,
        englishSubpage,
      ];
      const result = groupPagesByLang(pages, mainPage);

      expect(Object.keys(result.content)).toEqual(["en", "pt", "es"]);
    });

    it("should group pages with sub-items by language", () => {
      const englishSubpage = {
        id: "en-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "English Title" }],
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "English" },
          },
        },
      };

      const spanishSubpage = {
        id: "es-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Título en Español" }],
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Spanish" },
          },
        },
      };

      const mainPage = {
        id: "main-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Main Page" }],
          },
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Page" },
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "English" },
          },
          "Sub-item": {
            relation: [{ id: "en-page-1" }, { id: "es-page-1" }],
          },
        },
      };

      const pages = [mainPage, englishSubpage, spanishSubpage];
      const result = groupPagesByLang(pages, mainPage);

      expect(result.mainTitle).toBe("Main Page");
      expect(result.section).toBe("Page");
      expect(result.content.en).toBeDefined();
      expect(result.content.es).toBeDefined();
      expect(result.content.en.id).toBe("en-page-1");
      expect(result.content.es.id).toBe("es-page-1");
    });

    it("should include parent page in its own locale", () => {
      const mainPage = {
        id: "main-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Main Page" }],
          },
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Page" },
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Spanish" },
          },
          "Sub-item": {
            relation: [],
          },
        },
      };

      const pages = [mainPage];
      const result = groupPagesByLang(pages, mainPage);

      expect(result.content.es).toBe(mainPage);
    });

    it("should handle missing sub-items gracefully", () => {
      const mainPage = {
        id: "main-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Main Page" }],
          },
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Toggle" },
          },
          "Sub-item": {
            relation: [{ id: "non-existent-page" }],
          },
        },
      };

      const pages = [mainPage];
      const result = groupPagesByLang(pages, mainPage);

      expect(result.mainTitle).toBe("Main Page");
      expect(result.section).toBe("Toggle");
      expect(Object.keys(result.content)).toContain("en");
    });

    it("should extract section name from different property formats", () => {
      const testCases = [
        {
          page: {
            properties: {
              [NOTION_PROPERTIES.ELEMENT_TYPE]: {
                select: { name: "Toggle" },
              },
            },
          },
          expected: "Toggle",
        },
        {
          page: {
            properties: {
              [NOTION_PROPERTIES.ELEMENT_TYPE]: {
                name: "Heading",
              },
            },
          },
          expected: "Heading",
        },
        {
          page: {
            properties: {
              [NOTION_PROPERTIES.ELEMENT_TYPE]: "Page",
            },
          },
          expected: "Page",
        },
      ];

      for (const testCase of testCases) {
        const result = groupPagesByLang([], testCase.page);
        expect(result.section).toBe(testCase.expected);
      }
    });
  });

  describe("getOrderedLocales", () => {
    it("should put default locale first and preserve configured locale order", () => {
      expect(getOrderedLocales(["es", "en", "pt", "es"])).toEqual([
        "en",
        "pt",
        "es",
      ]);
    });

    it("should sort unknown locales alphabetically after configured locales", () => {
      expect(getOrderedLocales(["fr", "es", "de", "en"])).toEqual([
        "en",
        "es",
        "de",
        "fr",
      ]);
    });
  });

  describe("createStandalonePageGroup", () => {
    it("should create standalone group for page without sub-items", () => {
      const page = {
        id: "standalone-page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Standalone Page" }],
          },
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Page" },
          },
          [NOTION_PROPERTIES.LANGUAGE]: {
            select: { name: "Portuguese" },
          },
        },
      };

      const result = createStandalonePageGroup(page);

      expect(result.mainTitle).toBe("Standalone Page");
      expect(result.section).toBe("Page");
      expect(result.content.pt).toBe(page);
      expect(Object.keys(result.content).length).toBe(1);
    });

    it("should use default locale when language is not specified", () => {
      const page = {
        id: "page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Test Page" }],
          },
          [NOTION_PROPERTIES.ELEMENT_TYPE]: {
            select: { name: "Heading" },
          },
        },
      };

      const result = createStandalonePageGroup(page);

      expect(result.content.en).toBe(page);
    });

    it("should handle different section types", () => {
      const testCases = [
        { sectionType: "Page", expected: "Page" },
        { sectionType: "Toggle", expected: "Toggle" },
        { sectionType: "Heading", expected: "Heading" },
        { sectionType: "Title", expected: "Title" },
      ];

      for (const testCase of testCases) {
        const page = {
          id: "page-1",
          properties: {
            [NOTION_PROPERTIES.TITLE]: {
              title: [{ plain_text: "Test" }],
            },
            [NOTION_PROPERTIES.ELEMENT_TYPE]: {
              select: { name: testCase.sectionType },
            },
          },
        };

        const result = createStandalonePageGroup(page);
        expect(result.section).toBe(testCase.expected);
      }
    });

    it("should handle empty section type", () => {
      const page = {
        id: "page-1",
        properties: {
          [NOTION_PROPERTIES.TITLE]: {
            title: [{ plain_text: "Test Page" }],
          },
        },
      };

      const result = createStandalonePageGroup(page);
      expect(result.section).toBe("");
    });
  });

  describe("ensureTranslationSiblings", () => {
    const createMockPage = (
      id: string,
      title: string,
      language: string
    ): Record<string, any> => ({
      id,
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: title }],
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: language },
        },
        [NOTION_PROPERTIES.ELEMENT_TYPE]: {
          select: { name: "Page" },
        },
      },
    });

    it("should return all translations when all siblings exist", () => {
      const englishPage = createMockPage("en-1", "English Content", "English");
      const spanishPage = createMockPage(
        "es-1",
        "Contenido en Español",
        "Spanish"
      );
      const portuguesePage = createMockPage(
        "pt-1",
        "Conteúdo em Português",
        "Portuguese"
      );

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }, { id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage, portuguesePage];
      const result = ensureTranslationSiblings(pages, mainPage);

      expect(result.hasAllTranslations).toBe(true);
      expect(result.availableLocales).toEqual(
        expect.arrayContaining(["en", "es", "pt"])
      );
      expect(result.missingLocales).toEqual([]);
    });

    it("should detect missing Spanish translation", () => {
      const englishPage = createMockPage("en-1", "English Content", "English");
      const portuguesePage = createMockPage(
        "pt-1",
        "Conteúdo em Português",
        "Portuguese"
      );

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, portuguesePage];
      const result = ensureTranslationSiblings(pages, mainPage);

      expect(result.hasAllTranslations).toBe(false);
      expect(result.availableLocales).toEqual(
        expect.arrayContaining(["en", "pt"])
      );
      expect(result.missingLocales).toEqual(["es"]);
    });

    it("should detect missing Portuguese translation", () => {
      const englishPage = createMockPage("en-1", "English Content", "English");
      const spanishPage = createMockPage(
        "es-1",
        "Contenido en Español",
        "Spanish"
      );

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage];
      const result = ensureTranslationSiblings(pages, mainPage);

      expect(result.hasAllTranslations).toBe(false);
      expect(result.availableLocales).toEqual(
        expect.arrayContaining(["en", "es"])
      );
      expect(result.missingLocales).toEqual(["pt"]);
    });

    it("should detect all translations missing", () => {
      const englishPage = createMockPage("en-1", "English Content", "English");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [],
          },
        },
      };

      const pages = [mainPage];
      const result = ensureTranslationSiblings(pages, mainPage);

      expect(result.hasAllTranslations).toBe(false);
      expect(result.availableLocales).toEqual(["en"]);
      expect(result.missingLocales).toEqual(["es", "pt"]);
    });

    it("should return grouped page in result", () => {
      const englishPage = createMockPage("en-1", "Main Page", "English");
      const spanishPage = createMockPage("es-1", "Página Principal", "Spanish");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage];
      const result = ensureTranslationSiblings(pages, mainPage);

      expect(result.groupedPage.mainTitle).toBe("Main Page");
      expect(result.groupedPage.section).toBe("Page");
      expect(result.groupedPage.content.en).toBeDefined();
      expect(result.groupedPage.content.es).toBeDefined();
    });

    it("should handle pages with no sub-items", () => {
      const englishPage = createMockPage("en-1", "English Only", "English");

      const pages = [englishPage];
      const result = ensureTranslationSiblings(pages, englishPage);

      expect(result.hasAllTranslations).toBe(false);
      expect(result.availableLocales).toEqual(["en"]);
      expect(result.missingLocales).toEqual(["es", "pt"]);
    });
  });

  describe("getTranslationLocales", () => {
    const createMockPage = (
      id: string,
      title: string,
      language: string
    ): Record<string, any> => ({
      id,
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: title }],
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: language },
        },
        [NOTION_PROPERTIES.ELEMENT_TYPE]: {
          select: { name: "Page" },
        },
      },
    });

    it("should return all available locales", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const spanishPage = createMockPage("es-1", "Spanish", "Spanish");
      const portuguesePage = createMockPage("pt-1", "Portuguese", "Portuguese");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }, { id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage, portuguesePage];
      const locales = getTranslationLocales(pages, mainPage);

      expect(locales).toEqual(expect.arrayContaining(["en", "es", "pt"]));
      expect(locales).toHaveLength(3);
    });

    it("should return only available locales when some are missing", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const spanishPage = createMockPage("es-1", "Spanish", "Spanish");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage];
      const locales = getTranslationLocales(pages, mainPage);

      expect(locales).toEqual(expect.arrayContaining(["en", "es"]));
      expect(locales).not.toContain("pt");
      expect(locales).toHaveLength(2);
    });

    it("should return only English when no translations exist", () => {
      const englishPage = createMockPage("en-1", "English", "English");

      const pages = [englishPage];
      const locales = getTranslationLocales(pages, englishPage);

      expect(locales).toEqual(["en"]);
    });
  });

  describe("hasTranslation", () => {
    const createMockPage = (
      id: string,
      title: string,
      language: string
    ): Record<string, any> => ({
      id,
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: title }],
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: language },
        },
        [NOTION_PROPERTIES.ELEMENT_TYPE]: {
          select: { name: "Page" },
        },
      },
    });

    it("should return true when Spanish translation exists", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const spanishPage = createMockPage("es-1", "Spanish", "Spanish");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage];

      expect(hasTranslation(pages, mainPage, "es")).toBe(true);
      expect(hasTranslation(pages, mainPage, "pt")).toBe(false);
    });

    it("should return true when Portuguese translation exists", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const portuguesePage = createMockPage("pt-1", "Portuguese", "Portuguese");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, portuguesePage];

      expect(hasTranslation(pages, mainPage, "pt")).toBe(true);
      expect(hasTranslation(pages, mainPage, "es")).toBe(false);
    });

    it("should return true for English locale (source page)", () => {
      const englishPage = createMockPage("en-1", "English", "English");

      const pages = [englishPage];

      expect(hasTranslation(pages, englishPage, "en")).toBe(true);
    });

    it("should return false for non-existent locales", () => {
      const englishPage = createMockPage("en-1", "English", "English");

      const pages = [englishPage];

      expect(hasTranslation(pages, englishPage, "fr")).toBe(false);
      expect(hasTranslation(pages, englishPage, "de")).toBe(false);
    });

    it("should return true when all translations exist", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const spanishPage = createMockPage("es-1", "Spanish", "Spanish");
      const portuguesePage = createMockPage("pt-1", "Portuguese", "Portuguese");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }, { id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage, portuguesePage];

      expect(hasTranslation(pages, mainPage, "en")).toBe(true);
      expect(hasTranslation(pages, mainPage, "es")).toBe(true);
      expect(hasTranslation(pages, mainPage, "pt")).toBe(true);
    });
  });

  describe("getMissingTranslations", () => {
    const createMockPage = (
      id: string,
      title: string,
      language: string
    ): Record<string, any> => ({
      id,
      properties: {
        [NOTION_PROPERTIES.TITLE]: {
          title: [{ plain_text: title }],
        },
        [NOTION_PROPERTIES.LANGUAGE]: {
          select: { name: language },
        },
        [NOTION_PROPERTIES.ELEMENT_TYPE]: {
          select: { name: "Page" },
        },
      },
    });

    it("should return empty array when all translations exist", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const spanishPage = createMockPage("es-1", "Spanish", "Spanish");
      const portuguesePage = createMockPage("pt-1", "Portuguese", "Portuguese");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }, { id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage, portuguesePage];
      const missing = getMissingTranslations(pages, mainPage);

      expect(missing).toEqual([]);
    });

    it("should return ['es'] when Spanish is missing", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const portuguesePage = createMockPage("pt-1", "Portuguese", "Portuguese");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "pt-1" }],
          },
        },
      };

      const pages = [mainPage, portuguesePage];
      const missing = getMissingTranslations(pages, mainPage);

      expect(missing).toEqual(["es"]);
    });

    it("should return ['pt'] when Portuguese is missing", () => {
      const englishPage = createMockPage("en-1", "English", "English");
      const spanishPage = createMockPage("es-1", "Spanish", "Spanish");

      const mainPage = {
        ...englishPage,
        properties: {
          ...englishPage.properties,
          "Sub-item": {
            relation: [{ id: "es-1" }],
          },
        },
      };

      const pages = [mainPage, spanishPage];
      const missing = getMissingTranslations(pages, mainPage);

      expect(missing).toEqual(["pt"]);
    });

    it("should return ['es', 'pt'] when all translations are missing", () => {
      const englishPage = createMockPage("en-1", "English", "English");

      const pages = [englishPage];
      const missing = getMissingTranslations(pages, englishPage);

      expect(missing).toEqual(["es", "pt"]);
    });

    it("should not include English in missing translations", () => {
      const englishPage = createMockPage("en-1", "English", "English");

      const pages = [englishPage];
      const missing = getMissingTranslations(pages, englishPage);

      expect(missing).not.toContain("en");
    });
  });
});
