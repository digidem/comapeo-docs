import { describe, it, expect } from "vitest";
import {
  getElementTypeProperty,
  resolvePageTitle,
  resolvePageLocale,
  groupPagesByLang,
  createStandalonePageGroup,
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
});
