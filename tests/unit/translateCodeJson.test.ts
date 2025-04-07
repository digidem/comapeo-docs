import { test, expect, describe } from "bun:test";
import { getLanguageName } from "../../scripts/translateCodeJson.js";

describe("translateCodeJson", () => {
  describe("Language Detection", () => {
    test("should map language codes to full names", () => {


      expect(getLanguageName("es")).toBe("Spanish");
      expect(getLanguageName("pt")).toBe("Portuguese");
      expect(getLanguageName("fr")).toBe("French");
      expect(getLanguageName("de")).toBe("German");
      expect(getLanguageName("en")).toBe("English");

      // Should handle unknown language codes
      expect(getLanguageName("xx")).toBe("xx");
    });
  });
});



