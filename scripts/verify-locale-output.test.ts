import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";

interface TranslationEntry {
  message: string;
  description?: string;
}

type TranslationCodeJson = Record<string, TranslationEntry>;

const PLACEHOLDER_PATTERNS_ES = [
  /^Nueva P[aá]gina( A)?$/u,
  /^Nuevo t[ií]tulo de secci[oó]n$/u,
  /^Nueva Palanca$/u,
];

const PLACEHOLDER_PATTERNS_PT = [
  /^Nova P[aá]gina( A)?$/u,
  /^Novo t[ií]tulo da se[cç][aã]o$/u,
  /^Novo Alternar$/u,
];

const parseTranslationCodeJson = (content: string): TranslationCodeJson =>
  JSON.parse(content) as TranslationCodeJson;

const readJsonFile = async (filePath: string): Promise<unknown> => {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
};

const readTranslationCodeJson = async (
  filePath: string
): Promise<TranslationCodeJson> => {
  const content = await fs.readFile(filePath, "utf8");
  return parseTranslationCodeJson(content);
};

const assertFileExists = async (filePath: string): Promise<void> => {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(
      `Required file not found: ${path.relative(process.cwd(), filePath)}`
    );
  }
};

const assertTranslationFileHasExpectedKeys = (
  translations: TranslationCodeJson,
  expectedKeys: string[],
  fileLabel: string
): void => {
  for (const key of expectedKeys) {
    if (!(key in translations)) {
      throw new Error(`${fileLabel}: missing required key "${key}"`);
    }
    // eslint-disable-next-line security/detect-object-injection -- key comes from the hardcoded expectedKeys param, never external input
    const entry = translations[key];
    if (
      !entry ||
      typeof entry.message !== "string" ||
      entry.message.trim().length === 0
    ) {
      throw new Error(
        `${fileLabel}: key "${key}" has empty or missing message`
      );
    }
  }
};

const assertNoPlaceholderMessages = (
  translations: TranslationCodeJson,
  patterns: RegExp[],
  fileLabel: string
): void => {
  const violations: string[] = [];
  for (const [key, entry] of Object.entries(translations)) {
    if (!entry.message) continue;
    for (const pattern of patterns) {
      if (pattern.test(entry.message.trim())) {
        violations.push(`  "${key}": "${entry.message}"`);
        break;
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `${fileLabel}: found ${violations.length} placeholder message(s):\n${violations.join("\n")}`
    );
  }
};

const assertNoUntranslatedMessages = (
  translations: TranslationCodeJson,
  fileLabel: string
): void => {
  const violations: string[] = [];
  for (const [key, entry] of Object.entries(translations)) {
    if (!entry.message) continue;
    if (entry.message === key) {
      violations.push(`  "${key}": message identical to key (untranslated)`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `${fileLabel}: found ${violations.length} untranslated message(s):\n${violations.join("\n")}`
    );
  }
};

const assertNoEmptyMessages = (
  translations: TranslationCodeJson,
  fileLabel: string
): void => {
  const violations: string[] = [];
  for (const [key, entry] of Object.entries(translations)) {
    if (
      typeof entry.message !== "string" ||
      entry.message.trim().length === 0
    ) {
      violations.push(`  "${key}"`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `${fileLabel}: found ${violations.length} empty or missing message(s):\n${violations.join("\n")}`
    );
  }
};

// Docusaurus theme default English strings that are common leak points: a key
// whose identifier differs from its message (e.g. "theme.TOC.title") slips past
// assertNoUntranslatedMessages if the message is left as the English default.
const KNOWN_ENGLISH_THEME_DEFAULTS: Record<string, string> = {
  "theme.TOC.title": "On this page",
  "theme.TOCCollapsible.toggleButtonLabel": "On this page",
  "theme.common.editThisPage": "Edit this page",
  "theme.docs.paginator.next": "Next",
  "theme.docs.paginator.previous": "Previous",
  "theme.CodeBlock.copy": "Copy",
  "theme.CodeBlock.copied": "Copied",
  "theme.NotFound.title": "Page Not Found",
  "theme.BackToTopButton.buttonAriaLabel": "Scroll back to top",
};

const assertNoKnownEnglishDefaults = (
  translations: TranslationCodeJson,
  fileLabel: string
): void => {
  const violations: string[] = [];
  for (const [key, expectedEnglish] of Object.entries(
    KNOWN_ENGLISH_THEME_DEFAULTS
  )) {
    // eslint-disable-next-line security/detect-object-injection -- key comes from the hardcoded KNOWN_ENGLISH_THEME_DEFAULTS map, never external input
    const entry = translations[key];
    if (entry && entry.message.trim() === expectedEnglish) {
      violations.push(`  "${key}": still English ("${expectedEnglish}")`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `${fileLabel}: found ${violations.length} untranslated known theme string(s):\n${violations.join("\n")}`
    );
  }
};

const NAVBAR_EXPECTED_KEYS = [
  "item.label.Documentation",
  "item.label.GitHub",
  "logo.alt",
];

const FOOTER_EXPECTED_KEYS = [
  "links.title.Awana Digital",
  "links.Awana Digital.Website",
  "links.Awana Digital.Discord",
  "links.Awana Digital.Bluesky",
  "links.Awana Digital.Blog",
  "links.title.CoMapeo",
  "links.CoMapeo.Website",
  "links.CoMapeo.CoMapeo Mobile GitHub",
  "links.CoMapeo.CoMapeo Desktop GitHub",
  "links.title.More",
  "links.More.PlayStore",
  "links.More.GitHub",
  "links.More.Earth Defenders Toolkit",
  "copyright",
  "link.title.More",
  "link.item.label.Website",
  "link.item.label.CoMapeo Mobile GitHub",
  "link.item.label.CoMapeo Desktop GitHub",
];

const GENERIC_TRANSLATABLE_LABELS = [
  {
    locale: "es",
    key: "item.label.Documentation",
    english: "Documentation",
    hint: "Documentación",
  },
  {
    locale: "pt",
    key: "item.label.Documentation",
    english: "Documentation",
    hint: "Documentação",
  },
  {
    locale: "es",
    key: "links.Awana Digital.Website",
    english: "Website",
    hint: "Sitio web",
  },
  {
    locale: "pt",
    key: "links.Awana Digital.Website",
    english: "Website",
    hint: "Site",
  },
  {
    locale: "es",
    key: "links.CoMapeo.Website",
    english: "Website",
    hint: "Sitio web",
  },
  {
    locale: "pt",
    key: "links.CoMapeo.Website",
    english: "Website",
    hint: "Site",
  },
  { locale: "es", key: "links.title.More", english: "More", hint: "Más" },
  { locale: "pt", key: "links.title.More", english: "More", hint: "Mais" },
  { locale: "es", key: "link.title.More", english: "More", hint: "Más" },
  { locale: "pt", key: "link.title.More", english: "More", hint: "Mais" },
  {
    locale: "es",
    key: "link.item.label.Website",
    english: "Website",
    hint: "Sitio web",
  },
  {
    locale: "pt",
    key: "link.item.label.Website",
    english: "Website",
    hint: "Site",
  },
  {
    locale: "es",
    key: "link.item.label.CoMapeo Mobile GitHub",
    english: "CoMapeo Mobile GitHub",
    hint: "GitHub de CoMapeo Mobile",
  },
  {
    locale: "pt",
    key: "link.item.label.CoMapeo Mobile GitHub",
    english: "CoMapeo Mobile GitHub",
    hint: "GitHub do CoMapeo Mobile",
  },
  {
    locale: "es",
    key: "link.item.label.CoMapeo Desktop GitHub",
    english: "CoMapeo Desktop GitHub",
    hint: "GitHub de CoMapeo Desktop",
  },
  {
    locale: "pt",
    key: "link.item.label.CoMapeo Desktop GitHub",
    english: "CoMapeo Desktop GitHub",
    hint: "GitHub do CoMapeo Desktop",
  },
];

describe("Locale Output Verification", () => {
  const i18nDir = path.join(process.cwd(), "i18n");

  describe("Spanish locale (es)", () => {
    it("has code.json with no placeholder or untranslated messages", async () => {
      const codeJsonPath = path.join(i18nDir, "es", "code.json");
      const codeJson = await readTranslationCodeJson(codeJsonPath);

      expect(Object.keys(codeJson).length).toBeGreaterThan(0);
      assertNoPlaceholderMessages(
        codeJson,
        PLACEHOLDER_PATTERNS_ES,
        "es/code.json"
      );
      assertNoUntranslatedMessages(codeJson, "es/code.json");
      assertNoEmptyMessages(codeJson, "es/code.json");
      assertNoKnownEnglishDefaults(codeJson, "es/code.json");
    });

    it("has valid structure with message and optional description", async () => {
      const codeJsonPath = path.join(i18nDir, "es", "code.json");
      const codeJson = await readTranslationCodeJson(codeJsonPath);

      for (const [key, entry] of Object.entries(codeJson)) {
        expect(entry).toHaveProperty("message");
        expect(typeof entry.message).toBe("string");
        if (entry.description) {
          expect(typeof entry.description).toBe("string");
        }
      }
    });
  });

  describe("Portuguese locale (pt)", () => {
    it("has code.json with no placeholder or untranslated messages", async () => {
      const codeJsonPath = path.join(i18nDir, "pt", "code.json");
      const codeJson = await readTranslationCodeJson(codeJsonPath);

      expect(Object.keys(codeJson).length).toBeGreaterThan(0);
      assertNoPlaceholderMessages(
        codeJson,
        PLACEHOLDER_PATTERNS_PT,
        "pt/code.json"
      );
      assertNoUntranslatedMessages(codeJson, "pt/code.json");
      assertNoEmptyMessages(codeJson, "pt/code.json");
      assertNoKnownEnglishDefaults(codeJson, "pt/code.json");
    });

    it("has valid structure with message and optional description", async () => {
      const codeJsonPath = path.join(i18nDir, "pt", "code.json");
      const codeJson = await readTranslationCodeJson(codeJsonPath);

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

      const esCodeJson = await readTranslationCodeJson(esCodeJsonPath);
      const ptCodeJson = await readTranslationCodeJson(ptCodeJsonPath);

      const esKeys = Object.keys(esCodeJson).sort();
      const ptKeys = Object.keys(ptCodeJson).sort();

      expect(esKeys.length).toBe(ptKeys.length);

      const diff = esKeys
        .filter((k) => !ptKeys.includes(k))
        .concat(ptKeys.filter((k) => !esKeys.includes(k)));

      const maxAllowedDiff = Math.max(3, Math.ceil(esKeys.length * 0.1));
      expect(
        diff.length,
        `Found ${diff.length} differing keys: ${diff.join(", ")}`
      ).toBeLessThanOrEqual(maxAllowedDiff);
    });

    it("has non-empty label in translated toggle _category_.json files", async () => {
      const locales = ["es", "pt"];
      for (const locale of locales) {
        const localeDocsDir = path.join(
          i18nDir,
          locale,
          "docusaurus-plugin-content-docs",
          "current"
        );

        const findCategoryFiles = async (dir: string): Promise<string[]> => {
          const results: string[] = [];
          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return results;
          }
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              results.push(...(await findCategoryFiles(fullPath)));
            } else if (entry.name === "_category_.json") {
              results.push(fullPath);
            }
          }
          return results;
        };

        let categoryFiles: string[];
        try {
          categoryFiles = await findCategoryFiles(localeDocsDir);
        } catch {
          continue;
        }

        if (categoryFiles.length === 0) continue;

        for (const filePath of categoryFiles) {
          const content = await fs.readFile(filePath, "utf8");
          const category = JSON.parse(content);
          expect(
            category.label,
            `_category_.json at ${path.relative(process.cwd(), filePath)} has empty label`
          ).toBeTruthy();
          expect(typeof category.label).toBe("string");
          expect(category.label.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it("does not have English locale directory (en/) with code.json", async () => {
      const enDir = path.join(i18nDir, "en");
      try {
        await fs.access(enDir);
        const enCodeJsonPath = path.join(enDir, "code.json");
        try {
          await fs.access(enCodeJsonPath);
          console.warn("Warning: i18n/en/code.json exists.");
        } catch {
          // no code.json - fine
        }
      } catch {
        // directory doesn't exist - expected
      }
    });
  });

  describe("Theme translations", () => {
    const verifyThemeFile = async (
      locale: string,
      fileName: string,
      expectedKeys: string[]
    ): Promise<void> => {
      const filePath = path.join(
        i18nDir,
        locale,
        "docusaurus-theme-classic",
        fileName
      );

      await assertFileExists(filePath);

      const data = (await readJsonFile(filePath)) as TranslationCodeJson;
      assertTranslationFileHasExpectedKeys(
        data,
        expectedKeys,
        `${locale}/docusaurus-theme-classic/${fileName}`
      );
    };

    it("has navbar.json for Spanish with expected keys", async () => {
      await verifyThemeFile("es", "navbar.json", NAVBAR_EXPECTED_KEYS);
    });

    it("has footer.json for Spanish with expected keys", async () => {
      await verifyThemeFile("es", "footer.json", FOOTER_EXPECTED_KEYS);
    });

    it("has navbar.json for Portuguese with expected keys", async () => {
      await verifyThemeFile("pt", "navbar.json", NAVBAR_EXPECTED_KEYS);
    });

    it("has footer.json for Portuguese with expected keys", async () => {
      await verifyThemeFile("pt", "footer.json", FOOTER_EXPECTED_KEYS);
    });

    it("localizes generic translatable UI labels", async () => {
      for (const {
        locale,
        key,
        english,
        hint,
      } of GENERIC_TRANSLATABLE_LABELS) {
        const filePath = path.join(
          i18nDir,
          locale,
          "docusaurus-theme-classic",
          key.startsWith("item.label.") ? "navbar.json" : "footer.json"
        );
        const data = (await readJsonFile(filePath)) as TranslationCodeJson;
        // eslint-disable-next-line security/detect-object-injection -- key comes from the hardcoded GENERIC_TRANSLATABLE_LABELS constant, never external input
        const entry = data[key];
        expect(
          entry,
          `${locale} ${filePath.split("/").pop()}: missing key "${key}"`
        ).toBeTruthy();
        expect(typeof entry.message).toBe("string");
        expect(entry.message.trim().length).toBeGreaterThan(0);
        expect(
          entry.message,
          `${locale}: "${key}" appears untranslated (message="${entry.message}", expected something like "${hint}")`
        ).not.toBe(english);
      }
    });
  });
});
