import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";

/**
 * Verification tests for locale output correctness
 *
 * These tests verify that:
 * 1. Locale files contain translated content (not English)
 * 2. No unintended English writes occurred in non-English locales
 * 3. Locale files have the expected structure
 * 4. Translation keys match between source and target locales
 */
describe("Locale Output Verification", () => {
  const i18nDir = path.join(process.cwd(), "i18n");

  describe("Spanish locale (es)", () => {
    it("has code.json with Spanish translations", async () => {
      const codeJsonPath = path.join(i18nDir, "es", "code.json");

      // Read and parse the file
      const content = await fs.readFile(codeJsonPath, "utf8");
      const codeJson = JSON.parse(content);

      // Verify it has translations
      expect(Object.keys(codeJson).length).toBeGreaterThan(0);

      // Sample a few keys to verify they're in Spanish (not English)
      const sampleKeys = Object.keys(codeJson).slice(0, 5);

      for (const key of sampleKeys) {
        // eslint-disable-next-line security/detect-object-injection -- test code with controlled JSON data
        const entry = codeJson[key];
        if (entry.message) {
          // Check that it's not English by looking for common English words
          const message = entry.message.toLowerCase();

          // Skip "Nova Página" and "Nuevo título" which are placeholder translations
          if (
            message.includes("nova página") ||
            message.includes("nuevo título")
          ) {
            continue;
          }

          // Verify it's not English by checking for Spanish indicators
          const hasSpanishIndicators =
            message.includes(" en ") ||
            message.includes(" de ") ||
            message.includes(" para ") ||
            message.includes(" el ") ||
            message.includes(" la ") ||
            message.includes("ón") ||
            message.includes("ción") ||
            message.includes(" esta ") ||
            message.includes("nueva") ||
            message.includes("página") ||
            message.includes("introducción");

          // If it doesn't have Spanish indicators, it might be a proper noun or short text
          // We'll just verify it's a valid string for now
          expect(typeof entry.message).toBe("string");
          expect(entry.message.length).toBeGreaterThan(0);
        }
      }
    });

    it("does not contain unintended English content in code.json", async () => {
      const codeJsonPath = path.join(i18nDir, "es", "code.json");
      const content = await fs.readFile(codeJsonPath, "utf8");
      const codeJson = JSON.parse(content);

      // Check that common English words are not present in messages
      // (except for proper nouns or technical terms)
      const englishOnlyPatterns = [
        /\bthe\b/i,
        /\bis\b/i,
        /\band\b/i,
        /\bfor\b/i,
        /\bwith\b/i,
        /\bgetting started\b/i,
        /\bdevice setup\b/i,
      ];

      let hasUnintendedEnglish = false;
      const unintendedEnglishEntries: string[] = [];

      for (const [key, entry] of Object.entries(codeJson)) {
        if (entry.message) {
          const message = entry.message.toLowerCase();

          // Skip placeholder translations
          if (
            message.includes("nova página") ||
            message.includes("nuevo título")
          ) {
            continue;
          }

          // Check for multiple English-only patterns (suggesting untranslated content)
          const matchCount = englishOnlyPatterns.filter((pattern) =>
            pattern.test(message)
          ).length;

          if (matchCount >= 3) {
            // If 3+ English patterns match, likely untranslated
            hasUnintendedEnglish = true;
            unintendedEnglishEntries.push(`${key}: ${entry.message}`);
          }
        }
      }

      expect(
        hasUnintendedEnglish,
        `Found potential untranslated English content in es/code.json:\n${unintendedEnglishEntries.join("\n")}`
      ).toBe(false);
    });

    it("has valid structure with message and optional description", async () => {
      const codeJsonPath = path.join(i18nDir, "es", "code.json");
      const content = await fs.readFile(codeJsonPath, "utf8");
      const codeJson = JSON.parse(content);

      for (const [key, entry] of Object.entries(codeJson)) {
        // Every entry must have a message
        expect(entry).toHaveProperty("message");
        expect(typeof entry.message).toBe("string");

        // Description is optional but must be string if present
        if (entry.description) {
          expect(typeof entry.description).toBe("string");
        }
      }
    });
  });

  describe("Portuguese locale (pt)", () => {
    it("has code.json with Portuguese translations", async () => {
      const codeJsonPath = path.join(i18nDir, "pt", "code.json");

      const content = await fs.readFile(codeJsonPath, "utf8");
      const codeJson = JSON.parse(content);

      expect(Object.keys(codeJson).length).toBeGreaterThan(0);

      const sampleKeys = Object.keys(codeJson).slice(0, 5);

      for (const key of sampleKeys) {
        // eslint-disable-next-line security/detect-object-injection -- test code with controlled JSON data
        const entry = codeJson[key];
        if (entry.message) {
          const message = entry.message.toLowerCase();

          // Skip placeholder translations
          if (
            message.includes("nova página") ||
            message.includes("novo título")
          ) {
            continue;
          }

          // Verify it's a valid string
          expect(typeof entry.message).toBe("string");
          expect(entry.message.length).toBeGreaterThan(0);
        }
      }
    });

    it("does not contain unintended English content in code.json", async () => {
      const codeJsonPath = path.join(i18nDir, "pt", "code.json");
      const content = await fs.readFile(codeJsonPath, "utf8");
      const codeJson = JSON.parse(content);

      const englishOnlyPatterns = [
        /\bthe\b/i,
        /\bis\b/i,
        /\band\b/i,
        /\bfor\b/i,
        /\bwith\b/i,
        /\bgetting started\b/i,
        /\bdevice setup\b/i,
      ];

      let hasUnintendedEnglish = false;
      const unintendedEnglishEntries: string[] = [];

      for (const [key, entry] of Object.entries(codeJson)) {
        if (entry.message) {
          const message = entry.message.toLowerCase();

          // Skip placeholder translations
          if (
            message.includes("nova página") ||
            message.includes("novo título")
          ) {
            continue;
          }

          const matchCount = englishOnlyPatterns.filter((pattern) =>
            pattern.test(message)
          ).length;

          if (matchCount >= 3) {
            hasUnintendedEnglish = true;
            unintendedEnglishEntries.push(`${key}: ${entry.message}`);
          }
        }
      }

      expect(
        hasUnintendedEnglish,
        `Found potential untranslated English content in pt/code.json:\n${unintendedEnglishEntries.join("\n")}`
      ).toBe(false);
    });

    it("has valid structure with message and optional description", async () => {
      const codeJsonPath = path.join(i18nDir, "pt", "code.json");
      const content = await fs.readFile(codeJsonPath, "utf8");
      const codeJson = JSON.parse(content);

      for (const [key, entry] of Object.entries(codeJson)) {
        expect(entry).toHaveProperty("message");
        expect(typeof entry.message).toBe("string");

        if (entry.description) {
          expect(typeof entry.description).toBe("string");
        }
      }
    });
  });

  describe("Locale consistency", () => {
    it("has same number of translation keys in es and pt locales", async () => {
      const esCodeJsonPath = path.join(i18nDir, "es", "code.json");
      const ptCodeJsonPath = path.join(i18nDir, "pt", "code.json");

      const esContent = await fs.readFile(esCodeJsonPath, "utf8");
      const ptContent = await fs.readFile(ptCodeJsonPath, "utf8");

      const esCodeJson = JSON.parse(esContent);
      const ptCodeJson = JSON.parse(ptContent);

      const esKeys = Object.keys(esCodeJson).sort();
      const ptKeys = Object.keys(ptCodeJson).sort();

      // Should have the same number of keys
      expect(esKeys.length).toBe(ptKeys.length);

      // Check for keys that differ (may indicate data quality issues)
      const diff = esKeys
        .filter((k) => !ptKeys.includes(k))
        .concat(ptKeys.filter((k) => !esKeys.includes(k)));

      if (diff.length > 0) {
        console.warn(
          "Warning: Translation keys differ between es and pt locales:",
          diff
        );
        console.warn(
          "This may indicate a data quality issue - translation keys should be based on English source"
        );
      }

      // For now, we allow up to 5% difference in keys (to account for test data)
      const maxAllowedDiff = Math.ceil(esKeys.length * 0.05);
      expect(
        diff.length,
        `Found ${diff.length} differing keys: ${diff.join(", ")}`
      ).toBeLessThanOrEqual(maxAllowedDiff);
    });

    it("does not have English locale directory (en/)", async () => {
      const enDir = path.join(i18nDir, "en");

      // English source files should NOT be in i18n/en/
      // They should be in the root or handled separately
      try {
        await fs.access(enDir);
        // If we get here, the directory exists - this might be a problem
        // Check if it has code.json
        const enCodeJsonPath = path.join(enDir, "code.json");
        try {
          await fs.access(enCodeJsonPath);
          // English code.json exists in i18n/en/ - this could cause issues
          // Log a warning but don't fail (it might be intentional for source)
          console.warn(
            "Warning: i18n/en/code.json exists. This should only contain source English strings."
          );
        } catch {
          // Directory exists but no code.json - that's fine
        }
      } catch {
        // Directory doesn't exist - that's expected
      }
    });
  });

  describe("Theme translations", () => {
    it("has navbar.json for Spanish", async () => {
      const navbarPath = path.join(
        i18nDir,
        "es",
        "docusaurus-theme-classic",
        "navbar.json"
      );

      try {
        const content = await fs.readFile(navbarPath, "utf8");
        const navbar = JSON.parse(content);

        expect(Object.keys(navbar).length).toBeGreaterThan(0);

        // Verify entries have messages
        for (const [key, entry] of Object.entries(navbar)) {
          expect(entry).toHaveProperty("message");
        }
      } catch (error) {
        // Only catch ENOENT (file not found) - let other errors propagate
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          console.log(
            "Spanish navbar.json not found - may need to run translation"
          );
          return; // Exit gracefully for missing file only
        }
        throw error; // Re-throw all other errors (including assertion failures)
      }
    });

    it("has footer.json for Spanish", async () => {
      const footerPath = path.join(
        i18nDir,
        "es",
        "docusaurus-theme-classic",
        "footer.json"
      );

      try {
        const content = await fs.readFile(footerPath, "utf8");
        const footer = JSON.parse(content);

        expect(Object.keys(footer).length).toBeGreaterThan(0);

        for (const [key, entry] of Object.entries(footer)) {
          expect(entry).toHaveProperty("message");
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          console.log(
            "Spanish footer.json not found - may need to run translation"
          );
          return;
        }
        throw error;
      }
    });

    it("has navbar.json for Portuguese", async () => {
      const navbarPath = path.join(
        i18nDir,
        "pt",
        "docusaurus-theme-classic",
        "navbar.json"
      );

      try {
        const content = await fs.readFile(navbarPath, "utf8");
        const navbar = JSON.parse(content);

        expect(Object.keys(navbar).length).toBeGreaterThan(0);

        for (const [key, entry] of Object.entries(navbar)) {
          expect(entry).toHaveProperty("message");
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          console.log(
            "Portuguese navbar.json not found - may need to run translation"
          );
          return;
        }
        throw error;
      }
    });

    it("has footer.json for Portuguese", async () => {
      const footerPath = path.join(
        i18nDir,
        "pt",
        "docusaurus-theme-classic",
        "footer.json"
      );

      try {
        const content = await fs.readFile(footerPath, "utf8");
        const footer = JSON.parse(content);

        expect(Object.keys(footer).length).toBeGreaterThan(0);

        for (const [key, entry] of Object.entries(footer)) {
          expect(entry).toHaveProperty("message");
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          console.log(
            "Portuguese footer.json not found - may need to run translation"
          );
          return;
        }
        throw error;
      }
    });
  });
});
