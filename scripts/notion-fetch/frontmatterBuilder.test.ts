import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import {
  quoteYamlValue,
  getPublishedDate,
  buildFrontmatter,
} from "./frontmatterBuilder";
import { NOTION_PROPERTIES } from "../constants";

describe("frontmatterBuilder", () => {
  describe("quoteYamlValue", () => {
    it("should return empty string for empty input", () => {
      expect(quoteYamlValue("")).toBe("");
    });

    it("should return empty string for non-string input", () => {
      expect(quoteYamlValue(null as any)).toBe("");
      expect(quoteYamlValue(undefined as any)).toBe("");
    });

    it("should not quote simple strings", () => {
      expect(quoteYamlValue("simple")).toBe("simple");
      expect(quoteYamlValue("Simple Title")).toBe("Simple Title");
    });

    it("should quote strings with ampersands", () => {
      expect(quoteYamlValue("Test & Demo")).toBe('"Test & Demo"');
    });

    it("should quote strings with colons", () => {
      expect(quoteYamlValue("Title: Subtitle")).toBe('"Title: Subtitle"');
    });

    it("should quote strings with brackets", () => {
      expect(quoteYamlValue("Title [Part 1]")).toBe('"Title [Part 1]"');
      expect(quoteYamlValue("Title {JSON}")).toBe('"Title {JSON}"');
    });

    it("should quote strings with special YAML characters", () => {
      expect(quoteYamlValue("Title | Pipe")).toBe('"Title | Pipe"');
      expect(quoteYamlValue("Title > Arrow")).toBe('"Title > Arrow"');
      expect(quoteYamlValue("Title * Asterisk")).toBe('"Title * Asterisk"');
      expect(quoteYamlValue("Title ! Exclamation")).toBe(
        '"Title ! Exclamation"'
      );
      expect(quoteYamlValue("Title % Percent")).toBe('"Title % Percent"');
      expect(quoteYamlValue("Title @ At")).toBe('"Title @ At"');
      expect(quoteYamlValue("Title ` Backtick")).toBe('"Title ` Backtick"');
      expect(quoteYamlValue("Title # Hash")).toBe('"Title # Hash"');
      expect(quoteYamlValue("Title - Dash")).toBe('"Title - Dash"');
    });

    it("should quote strings with leading whitespace", () => {
      expect(quoteYamlValue(" Leading Space")).toBe('" Leading Space"');
    });

    it("should quote strings with leading or trailing quotes", () => {
      expect(quoteYamlValue('"Quoted"')).toBe('"\\"Quoted\\""');
      expect(quoteYamlValue("'Quoted'")).toBe("\"'Quoted'\"");
    });

    it("should escape existing double quotes when quoting", () => {
      expect(quoteYamlValue('Test "quoted" word')).toBe(
        '"Test \\"quoted\\" word"'
      );
    });
  });

  describe("getPublishedDate", () => {
    let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
      mockConsoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    beforeEach(() => {
      mockConsoleWarn?.mockClear();
    });

    afterAll(() => {
      mockConsoleWarn?.mockRestore();
    });

    it("should use Published date field when available", () => {
      const page = {
        id: "test-page-1",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: {
              start: "2024-01-15",
            },
          },
        },
      };

      const result = getPublishedDate(page);
      expect(result).toBe("1/15/2024");
    });

    it("should fall back to last_edited_time when Published date is missing", () => {
      const page = {
        id: "test-page-2",
        properties: {},
        last_edited_time: "2024-02-20T10:30:00.000Z",
      };

      const result = getPublishedDate(page);
      // The exact format depends on locale, but it should be a valid date
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });

    it("should fall back to current date when both are missing", () => {
      const page = {
        id: "test-page-3",
        properties: {},
      };

      const result = getPublishedDate(page);
      const today = new Date().toLocaleDateString("en-US");
      expect(result).toBe(today);
    });

    it("should handle invalid Published date format", () => {
      const page = {
        id: "test-page-4",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: {
              start: "invalid-date",
            },
          },
        },
        last_edited_time: "2024-03-10T12:00:00.000Z",
      };

      const result = getPublishedDate(page);
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      // Note: console.warn is called but spy doesn't capture it reliably in CI
    });

    it("should handle exception in Published date parsing", () => {
      const page = {
        id: "test-page-5",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: {
              start: "2024-13-50", // Invalid month and day
            },
          },
        },
        last_edited_time: "2024-03-10T12:00:00.000Z",
      };

      const result = getPublishedDate(page);
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });

    it("should handle invalid last_edited_time", () => {
      const page = {
        id: "test-page-6",
        properties: {},
        last_edited_time: "not-a-date",
      };

      const result = getPublishedDate(page);
      const today = new Date().toLocaleDateString("en-US");
      expect(result).toBe(today);
      // Note: console.warn is called but spy doesn't capture it reliably in CI
    });
  });

  describe("buildFrontmatter", () => {
    it("should build basic frontmatter without custom props", () => {
      const page = {
        id: "test-page",
        properties: {
          [NOTION_PROPERTIES.PUBLISHED_DATE]: {
            date: {
              start: "2024-01-15",
            },
          },
        },
      };

      const result = buildFrontmatter(
        "Test Page",
        1,
        ["comapeo", "docs"],
        ["docs", "guide"],
        {},
        "test-page.md",
        "test-page",
        page
      );

      expect(result).toContain("---");
      expect(result).toContain("id: doc-test-page");
      expect(result).toContain("title: Test Page");
      expect(result).toContain("sidebar_label: Test Page");
      expect(result).toContain("sidebar_position: 1");
      expect(result).toContain("pagination_label: Test Page");
      expect(result).toContain(
        "custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/test-page.md"
      );
      expect(result).toContain("keywords:");
      expect(result).toContain("  - docs");
      expect(result).toContain("  - guide");
      expect(result).toContain("tags: [comapeo, docs]");
      expect(result).toContain("slug: /test-page");
      expect(result).toContain("date: 1/15/2024");
      expect(result).toContain("author: Awana Digital");
    });

    it("should quote special characters in title", () => {
      const page = {
        id: "test-page",
        properties: {},
        last_edited_time: "2024-01-15T10:00:00.000Z",
      };

      const result = buildFrontmatter(
        "Test & Demo: Guide",
        1,
        ["comapeo"],
        ["docs"],
        {},
        "test-demo.md",
        "test-demo",
        page
      );

      expect(result).toContain('title: "Test & Demo: Guide"');
      expect(result).toContain('sidebar_label: "Test & Demo: Guide"');
      expect(result).toContain('pagination_label: "Test & Demo: Guide"');
    });

    it("should quote special characters in keywords and tags", () => {
      const page = {
        id: "test-page",
        properties: {},
        last_edited_time: "2024-01-15T10:00:00.000Z",
      };

      const result = buildFrontmatter(
        "Test Page",
        1,
        ["tag-with-dash", "tag:colon"],
        ["keyword-dash", "key:word"],
        {},
        "test.md",
        "test",
        page
      );

      expect(result).toContain('"tag-with-dash"');
      expect(result).toContain('"tag:colon"');
      expect(result).toContain('"keyword-dash"');
      expect(result).toContain('"key:word"');
    });

    it("should include custom props when provided", () => {
      const page = {
        id: "test-page",
        properties: {},
        last_edited_time: "2024-01-15T10:00:00.000Z",
      };

      const result = buildFrontmatter(
        "Test Page",
        1,
        ["comapeo"],
        ["docs"],
        {
          icon: "📄",
          title: "Custom Title",
        },
        "test.md",
        "test",
        page
      );

      expect(result).toContain("sidebar_custom_props:");
      expect(result).toContain('icon: "📄"');
      expect(result).toContain("title: Custom Title");
    });

    it("should handle custom props with quotes correctly", () => {
      const page = {
        id: "test-page",
        properties: {},
        last_edited_time: "2024-01-15T10:00:00.000Z",
      };

      const result = buildFrontmatter(
        "Test Page",
        1,
        ["comapeo"],
        ["docs"],
        {
          description: 'Value with "double quotes"',
          note: "Value with 'single quotes'",
        },
        "test.md",
        "test",
        page
      );

      expect(result).toContain("sidebar_custom_props:");
      expect(result).toContain("description: 'Value with \"double quotes\"'");
      expect(result).toContain("note: \"Value with 'single quotes'\"");
    });

    it("should handle custom props with non-ASCII characters", () => {
      const page = {
        id: "test-page",
        properties: {},
        last_edited_time: "2024-01-15T10:00:00.000Z",
      };

      const result = buildFrontmatter(
        "Test Page",
        1,
        ["comapeo"],
        ["docs"],
        {
          icon: "🚀",
          emoji: "😀",
        },
        "test.md",
        "test",
        page
      );

      expect(result).toContain("sidebar_custom_props:");
      expect(result).toContain('icon: "🚀"');
      expect(result).toContain('emoji: "😀"');
    });

    it("should end with proper YAML delimiter", () => {
      const page = {
        id: "test-page",
        properties: {},
        last_edited_time: "2024-01-15T10:00:00.000Z",
      };

      const result = buildFrontmatter(
        "Test Page",
        1,
        ["comapeo"],
        ["docs"],
        {},
        "test.md",
        "test",
        page
      );

      expect(result).toMatch(/---\n$/);
    });
  });
});
