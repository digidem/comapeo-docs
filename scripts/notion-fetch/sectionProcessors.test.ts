import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  processToggleSection,
  processHeadingSection,
  type CategoryConfig,
} from "./sectionProcessors";

// Mock fs module
vi.mock("node:fs");

describe("sectionProcessors", () => {
  describe("processToggleSection", () => {
    let mockSpinner: any;
    let currentHeading: Map<string, string>;
    const mockMkdirSync = vi.mocked(fs.mkdirSync);
    const mockWriteFileSync = vi.mocked(fs.writeFileSync);

    beforeEach(() => {
      vi.clearAllMocks();
      mockSpinner = {
        succeed: vi.fn(),
      };
      currentHeading = new Map();
    });

    it("should create section folder and return folder name", () => {
      const page = {
        id: "page-1",
        properties: {
          Title: {
            title: [{ plain_text: "Section Name" }],
          },
        },
      };

      const result = processToggleSection(
        page,
        "section-name",
        "fallback",
        "Page Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      expect(result).toBe("section-name");
      expect(mockMkdirSync).toHaveBeenCalledWith("/test/path/section-name", {
        recursive: true,
      });
      expect(mockSpinner.succeed).toHaveBeenCalledTimes(2);
    });

    it("should use fallback filename when filename is empty", () => {
      const page = {
        id: "page-2",
        properties: {
          Title: {
            title: [{ plain_text: "Section" }],
          },
        },
      };

      const result = processToggleSection(
        page,
        "",
        "fallback-name",
        "Page Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      expect(result).toBe("fallback-name");
      expect(mockMkdirSync).toHaveBeenCalledWith("/test/path/fallback-name", {
        recursive: true,
      });
    });

    it("should use page title when Title property is missing", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const page = {
        id: "page-3",
        properties: {},
      };

      processToggleSection(
        page,
        "folder",
        "fallback",
        "Fallback Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing 'Title' property")
      );
      consoleWarnSpy.mockRestore();
    });

    it("should create _category_.json for English locale", () => {
      const page = {
        id: "page-4",
        properties: {
          Title: {
            title: [{ plain_text: "My Section" }],
          },
        },
      };

      processToggleSection(
        page,
        "my-section",
        "fallback",
        "Page Title",
        "en",
        5,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/test/path/my-section/_category_.json",
        expect.stringContaining('"label": "My Section"'),
        "utf8"
      );

      const categoryContent = JSON.parse(
        mockWriteFileSync.mock.calls[0][1] as string
      );
      expect(categoryContent).toMatchObject({
        label: "My Section",
        position: 6, // i + 1 = 5 + 1
        collapsible: true,
        collapsed: true,
        link: { type: "generated-index" },
        customProps: { title: null },
      });
    });

    it("should not create _category_.json for non-English locales", () => {
      const page = {
        id: "page-5",
        properties: {
          Title: {
            title: [{ plain_text: "Sección" }],
          },
        },
      };

      processToggleSection(
        page,
        "seccion",
        "fallback",
        "Título",
        "es",
        0,
        "/test/path/es",
        currentHeading,
        mockSpinner
      );

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("should apply pending heading to category customProps", () => {
      const page = {
        id: "page-6",
        properties: {
          Title: {
            title: [{ plain_text: "Section" }],
          },
        },
      };

      currentHeading.set("en", "Pending Heading");

      processToggleSection(
        page,
        "section",
        "fallback",
        "Page Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      const categoryContent = JSON.parse(
        mockWriteFileSync.mock.calls[0][1] as string
      );
      expect(categoryContent.customProps.title).toBe("Pending Heading");
      expect(currentHeading.get("en")).toBeNull();
    });

    it("should not apply heading from different language", () => {
      const page = {
        id: "page-7",
        properties: {
          Title: {
            title: [{ plain_text: "Section" }],
          },
        },
      };

      currentHeading.set("es", "Spanish Heading");

      processToggleSection(
        page,
        "section",
        "fallback",
        "Page Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      const categoryContent = JSON.parse(
        mockWriteFileSync.mock.calls[0][1] as string
      );
      expect(categoryContent.customProps.title).toBeNull();
      expect(currentHeading.get("es")).toBe("Spanish Heading"); // Not cleared
    });

    it("should handle missing Title property gracefully", () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const page = {
        id: "page-8",
        properties: {
          Title: { title: [] }, // Empty title array
        },
      };

      processToggleSection(
        page,
        "section",
        "fallback",
        "Fallback Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it("should report success via spinner", () => {
      const page = {
        id: "page-9",
        properties: {
          Title: {
            title: [{ plain_text: "Test" }],
          },
        },
      };

      processToggleSection(
        page,
        "test",
        "fallback",
        "Title",
        "en",
        0,
        "/test/path",
        currentHeading,
        mockSpinner
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("Section folder created: test")
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("added _category_.json to test")
      );
    });
  });

  describe("processHeadingSection", () => {
    let mockSpinner: any;
    let currentHeading: Map<string, string>;

    beforeEach(() => {
      mockSpinner = {
        succeed: vi.fn(),
      };
      currentHeading = new Map();
    });

    it("should set current heading for language", () => {
      processHeadingSection("My Heading", "en", currentHeading, mockSpinner);

      expect(currentHeading.get("en")).toBe("My Heading");
    });

    it("should report success via spinner", () => {
      processHeadingSection("Test Heading", "en", currentHeading, mockSpinner);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("Title section detected: Test Heading")
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        expect.stringContaining("will be applied to next item")
      );
    });

    it("should handle multiple languages independently", () => {
      processHeadingSection(
        "English Heading",
        "en",
        currentHeading,
        mockSpinner
      );
      processHeadingSection(
        "Spanish Heading",
        "es",
        currentHeading,
        mockSpinner
      );
      processHeadingSection(
        "Portuguese Heading",
        "pt",
        currentHeading,
        mockSpinner
      );

      expect(currentHeading.get("en")).toBe("English Heading");
      expect(currentHeading.get("es")).toBe("Spanish Heading");
      expect(currentHeading.get("pt")).toBe("Portuguese Heading");
    });

    it("should overwrite existing heading for same language", () => {
      currentHeading.set("en", "Old Heading");

      processHeadingSection("New Heading", "en", currentHeading, mockSpinner);

      expect(currentHeading.get("en")).toBe("New Heading");
    });

    it("should handle empty heading title", () => {
      processHeadingSection("", "en", currentHeading, mockSpinner);

      expect(currentHeading.get("en")).toBe("");
    });

    it("should preserve headings for other languages", () => {
      currentHeading.set("en", "English");
      currentHeading.set("es", "Spanish");

      processHeadingSection(
        "New Portuguese",
        "pt",
        currentHeading,
        mockSpinner
      );

      expect(currentHeading.get("en")).toBe("English");
      expect(currentHeading.get("es")).toBe("Spanish");
      expect(currentHeading.get("pt")).toBe("New Portuguese");
    });
  });
});
