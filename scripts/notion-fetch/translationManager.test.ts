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
import fs from "node:fs";
import path from "node:path";
import {
  setTranslationString,
  getI18NPath,
  initializeI18NDirectories,
  getConfiguredLocales,
  getDefaultLocale,
  readTranslationFile,
  hasTranslation,
  getTranslation,
  I18N_PATH,
} from "./translationManager";

// Mock dependencies
vi.mock("node:fs");

// Mock docusaurus.config
vi.mock("../../docusaurus.config", () => ({
  default: {
    i18n: {
      defaultLocale: "en",
      locales: ["en", "es", "pt"],
    },
  },
}));

describe("translationManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getI18NPath", () => {
    it("should return correct path for locale", () => {
      const esPath = getI18NPath("es");
      expect(esPath).toContain("i18n");
      expect(esPath).toContain("es");
      expect(esPath).toContain("docusaurus-plugin-content-docs");
      expect(esPath).toContain("current");
    });

    it("should return correct path for Portuguese locale", () => {
      const ptPath = getI18NPath("pt");
      expect(ptPath).toContain("i18n");
      expect(ptPath).toContain("pt");
    });

    it("should handle different locale codes", () => {
      const frPath = getI18NPath("fr");
      expect(frPath).toContain("fr");
    });
  });

  describe("setTranslationString", () => {
    beforeEach(() => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    });

    it("should create translation file for new locale", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      setTranslationString("es", "Hello", "Hola");

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("i18n"),
        { recursive: true }
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Translation file missing for es")
      );
    });

    it("should update existing translation file", () => {
      const existingData = JSON.stringify({
        Goodbye: { message: "Adiós" },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(existingData);

      setTranslationString("es", "Hello", "Hola");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("code.json"),
        expect.stringContaining("Hello")
      );
    });

    it("should handle empty file gracefully", () => {
      vi.mocked(fs.readFileSync).mockReturnValue("");

      setTranslationString("es", "Hello", "Hola");

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("should handle corrupt JSON file", () => {
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json {{{");

      setTranslationString("es", "Hello", "Hola");

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse translation file"),
        expect.anything()
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("should truncate long original strings", () => {
      const longString = "a".repeat(3000);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      setTranslationString("es", longString, "Translation");

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      const keys = Object.keys(writtenData);

      // Key should be truncated to 2000 chars
      expect(keys[0].length).toBeLessThanOrEqual(2000);
    });

    it("should truncate long translated strings", () => {
      const longTranslation = "b".repeat(6000);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      setTranslationString("es", "Key", longTranslation);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      // Message should be truncated to 5000 chars
      expect(writtenData.Key.message.length).toBeLessThanOrEqual(5000);
    });

    it("should handle non-string original values", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      setTranslationString("es", 123 as any, "Translation");

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData["123"]).toBeDefined();
    });

    it("should handle non-string translated values", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      setTranslationString("es", "Key", 456 as any);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.Key.message).toBe("456");
    });

    it("should format JSON with 4-space indentation", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      setTranslationString("es", "Hello", "Hola");

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      // Should have 4-space indentation
      expect(writtenContent).toContain("    ");
      expect(writtenContent).toMatch(/"message": "Hola"/);
    });

    it("should preserve existing translations when adding new one", () => {
      const existingData = JSON.stringify({
        Goodbye: { message: "Adiós" },
        "Good morning": { message: "Buenos días" },
      });
      vi.mocked(fs.readFileSync).mockReturnValue(existingData);

      setTranslationString("es", "Hello", "Hola");

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.Goodbye.message).toBe("Adiós");
      expect(writtenData["Good morning"].message).toBe("Buenos días");
      expect(writtenData.Hello.message).toBe("Hola");
    });

    it("should overwrite existing translation for same key", () => {
      const existingData = JSON.stringify({
        Hello: { message: "Ola" }, // Wrong translation
      });
      vi.mocked(fs.readFileSync).mockReturnValue(existingData);

      setTranslationString("es", "Hello", "Hola");

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData.Hello.message).toBe("Hola");
    });
  });

  describe("initializeI18NDirectories", () => {
    it("should create directories for all non-default locales", () => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      initializeI18NDirectories();

      // Should create directories for "es" and "pt" but not "en" (default)
      const calls = vi.mocked(fs.mkdirSync).mock.calls;
      const paths = calls.map((call) => call[0]);

      expect(paths.some((p) => (p as string).includes("es"))).toBe(true);
      expect(paths.some((p) => (p as string).includes("pt"))).toBe(true);
      // Should have recursive: true option
      expect(calls.every((call) => call[1]?.recursive === true)).toBe(true);
    });

    it("should handle mkdir errors gracefully", () => {
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      // Should not throw
      expect(() => initializeI18NDirectories()).toThrow();
    });
  });

  describe("getConfiguredLocales", () => {
    it("should return all configured locales", () => {
      const locales = getConfiguredLocales();

      expect(locales).toEqual(["en", "es", "pt"]);
    });

    it("should include default locale", () => {
      const locales = getConfiguredLocales();

      expect(locales).toContain("en");
    });
  });

  describe("getDefaultLocale", () => {
    it("should return default locale", () => {
      const defaultLocale = getDefaultLocale();

      expect(defaultLocale).toBe("en");
    });
  });

  describe("readTranslationFile", () => {
    it("should read existing translation file", () => {
      const translationData = {
        Hello: { message: "Hola" },
        Goodbye: { message: "Adiós" },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(translationData)
      );

      const result = readTranslationFile("es");

      expect(result).toEqual(translationData);
    });

    it("should return empty object for non-existent file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = readTranslationFile("es");

      expect(result).toEqual({});
    });

    it("should handle read errors gracefully", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Read error");
      });

      const result = readTranslationFile("es");

      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read translation file"),
        expect.any(Error)
      );
    });

    it("should handle corrupt JSON gracefully", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json {{{");

      const result = readTranslationFile("es");

      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe("hasTranslation", () => {
    it("should return true for existing translation", () => {
      const translationData = {
        Hello: { message: "Hola" },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(translationData)
      );

      const result = hasTranslation("es", "Hello");

      expect(result).toBe(true);
    });

    it("should return false for non-existent translation", () => {
      const translationData = {
        Hello: { message: "Hola" },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(translationData)
      );

      const result = hasTranslation("es", "Goodbye");

      expect(result).toBe(false);
    });

    it("should return false for non-existent file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = hasTranslation("es", "Hello");

      expect(result).toBe(false);
    });

    it("should handle file read errors", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Read error");
      });

      const result = hasTranslation("es", "Hello");

      expect(result).toBe(false);
    });
  });

  describe("getTranslation", () => {
    it("should return translation for existing key", () => {
      const translationData = {
        Hello: { message: "Hola" },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(translationData)
      );

      const result = getTranslation("es", "Hello");

      expect(result).toBe("Hola");
    });

    it("should return undefined for non-existent key", () => {
      const translationData = {
        Hello: { message: "Hola" },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(translationData)
      );

      const result = getTranslation("es", "Goodbye");

      expect(result).toBeUndefined();
    });

    it("should return undefined for non-existent file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getTranslation("es", "Hello");

      expect(result).toBeUndefined();
    });

    it("should handle file read errors", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Read error");
      });

      const result = getTranslation("es", "Hello");

      expect(result).toBeUndefined();
    });

    it("should return correct translation for multiple entries", () => {
      const translationData = {
        Hello: { message: "Hola" },
        Goodbye: { message: "Adiós" },
        "Good morning": { message: "Buenos días" },
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(translationData)
      );

      expect(getTranslation("es", "Hello")).toBe("Hola");
      expect(getTranslation("es", "Goodbye")).toBe("Adiós");
      expect(getTranslation("es", "Good morning")).toBe("Buenos días");
    });
  });

  describe("I18N_PATH constant", () => {
    it("should be defined", () => {
      expect(I18N_PATH).toBeDefined();
      expect(typeof I18N_PATH).toBe("string");
    });

    it("should contain i18n in path", () => {
      expect(I18N_PATH).toContain("i18n");
    });
  });
});
