import { describe, it, expect } from "vitest";
import { getLanguageName, LANGUAGE_MAP } from "../languageNames.js";

describe("translate-theme: languageNames", () => {
  it("maps common language codes to language names", () => {
    expect(getLanguageName("pt")).toBe("Portuguese");
    expect(getLanguageName("es")).toBe("Spanish");
    expect(getLanguageName("en")).toBe("English");
    expect(getLanguageName("fr")).toBe("French");
    expect(getLanguageName("de")).toBe("German");
  });

  it("returns the code unchanged for unmapped languages", () => {
    expect(getLanguageName("unknown_code")).toBe("unknown_code");
    expect(getLanguageName("xyz")).toBe("xyz");
  });

  it("exports a non-empty LANGUAGE_MAP with all known languages", () => {
    expect(Object.keys(LANGUAGE_MAP)).toHaveLength(77);
  });
});
