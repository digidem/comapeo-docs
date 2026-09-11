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

// Docusaurus theme default English strings are common leak points: a key
// whose identifier differs from its message (e.g. "theme.TOC.title") slips
// past assertNoUntranslatedMessages if the message is left as the English
// default. Rather than a hand-curated sample, load every base English
// string Docusaurus itself ships for the plugins this site actually uses
// (see docusaurus.config.ts) and compare the full set.
const DOCUSAURUS_BASE_TRANSLATION_FILES = [
  "node_modules/@docusaurus/theme-translations/locales/base/theme-common.json",
  "node_modules/@docusaurus/theme-translations/locales/base/plugin-pwa.json",
  "node_modules/@docusaurus/theme-translations/locales/base/plugin-ideal-image.json",
];

const loadDocusaurusBaseEnglishDefaults = async (): Promise<
  Record<string, string>
> => {
  const merged: Record<string, string> = {};
  for (const relPath of DOCUSAURUS_BASE_TRANSLATION_FILES) {
    const filePath = path.join(process.cwd(), relPath);
    // Every file in DOCUSAURUS_BASE_TRANSLATION_FILES corresponds to a
    // plugin this site has confirmed active in docusaurus.config.ts, so a
    // read/parse failure here means something is actually broken (missing
    // dependency, corrupted install) — fail loudly rather than silently
    // treating the catalog as empty, which would make this check fail-open.
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content) as Record<string, string>;
    for (const [key, value] of Object.entries(data)) {
      if (key.endsWith("___DESCRIPTION")) continue;
      // eslint-disable-next-line security/detect-object-injection -- key comes from a Docusaurus-shipped JSON catalog, never external input
      merged[key] = value;
    }
  }
  return merged;
};

// Keys whose Docusaurus English default is allowed to remain unchanged in
// es/pt — e.g. brand names, or pure interpolation templates with no literal
// English words to translate.
const ENGLISH_DEFAULT_ALLOWLIST = new Set<string>([
  // "{authorName} - {nPosts}" — just an interpolation pattern, not prose.
  "theme.blog.author.pageTitle",
]);

const assertHasAllDocusaurusBaseKeys = (
  translations: TranslationCodeJson,
  baseDefaults: Record<string, string>,
  fileLabel: string
): void => {
  const missing = Object.keys(baseDefaults).filter(
    (key) => !(key in translations)
  );
  if (missing.length > 0) {
    throw new Error(
      `${fileLabel}: missing ${missing.length} Docusaurus base translation key(s) — these silently fall back to English at runtime:\n${missing.map((k) => `  "${k}"`).join("\n")}`
    );
  }
};

const assertNoUntranslatedDocusaurusDefaults = (
  translations: TranslationCodeJson,
  baseDefaults: Record<string, string>,
  fileLabel: string
): void => {
  const violations: string[] = [];
  for (const [key, expectedEnglish] of Object.entries(baseDefaults)) {
    if (ENGLISH_DEFAULT_ALLOWLIST.has(key)) continue;
    // eslint-disable-next-line security/detect-object-injection -- key comes from the Docusaurus base translation catalog, never external input
    const entry = translations[key];
    if (entry && entry.message.trim() === expectedEnglish.trim()) {
      violations.push(`  "${key}": still English ("${expectedEnglish}")`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `${fileLabel}: found ${violations.length} untranslated Docusaurus default string(s):\n${violations.join("\n")}`
    );
  }
};

// es and pt code.json must ship the exact same key set: a key present in
// only one locale silently falls back to English (or renders nothing) in
// the other. KEY_PARITY_ALLOWLIST buys time for known, deliberate gaps;
// every entry must still point at a key that actually diverges between the
// two files today — an entry whose key no longer diverges is stale and
// fails the suite until removed.
const KEY_PARITY_ALLOWLIST = new Set<string>([
  // "some.key" — reason + tracking issue
]);

const formatKeyList = (keys: string[]): string =>
  keys.length === 0
    ? "    (none)"
    : keys.map((key) => `    "${key}"`).join("\n");

const assertExactKeyParity = (
  esTranslations: TranslationCodeJson,
  ptTranslations: TranslationCodeJson
): void => {
  const esKeys = new Set(Object.keys(esTranslations));
  const ptKeys = new Set(Object.keys(ptTranslations));

  const esOnly = [...esKeys].filter((key) => !ptKeys.has(key));
  const ptOnly = [...ptKeys].filter((key) => !esKeys.has(key));

  const unallowlistedEsOnly = esOnly.filter(
    (key) => !KEY_PARITY_ALLOWLIST.has(key)
  );
  const unallowlistedPtOnly = ptOnly.filter(
    (key) => !KEY_PARITY_ALLOWLIST.has(key)
  );

  const problems: string[] = [];

  if (unallowlistedEsOnly.length > 0 || unallowlistedPtOnly.length > 0) {
    problems.push(
      `es/pt code.json key sets differ by ${
        unallowlistedEsOnly.length + unallowlistedPtOnly.length
      } key(s) — a key missing from one locale silently falls back to English at runtime:\n` +
        `  es-only (${unallowlistedEsOnly.length}):\n${formatKeyList(
          unallowlistedEsOnly
        )}\n` +
        `  pt-only (${unallowlistedPtOnly.length}):\n${formatKeyList(
          unallowlistedPtOnly
        )}\n` +
        `Deliberate, temporary gaps go in KEY_PARITY_ALLOWLIST with a reason.`
    );
  }

  const staleEntries = [...KEY_PARITY_ALLOWLIST].filter(
    (key) => !esOnly.includes(key) && !ptOnly.includes(key)
  );
  if (staleEntries.length > 0) {
    problems.push(
      `KEY_PARITY_ALLOWLIST has ${staleEntries.length} stale entr${
        staleEntries.length === 1 ? "y" : "ies"
      } — key(s) no longer differ between es and pt; remove them:\n` +
        staleEntries.map((key) => `  "${key}"`).join("\n")
    );
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n\n"));
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
      const baseDefaults = await loadDocusaurusBaseEnglishDefaults();
      assertHasAllDocusaurusBaseKeys(codeJson, baseDefaults, "es/code.json");
      assertNoUntranslatedDocusaurusDefaults(
        codeJson,
        baseDefaults,
        "es/code.json"
      );
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
      const baseDefaults = await loadDocusaurusBaseEnglishDefaults();
      assertHasAllDocusaurusBaseKeys(codeJson, baseDefaults, "pt/code.json");
      assertNoUntranslatedDocusaurusDefaults(
        codeJson,
        baseDefaults,
        "pt/code.json"
      );
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
    it("has identical translation key sets in es and pt locales", async () => {
      const esCodeJsonPath = path.join(i18nDir, "es", "code.json");
      const ptCodeJsonPath = path.join(i18nDir, "pt", "code.json");

      const esCodeJson = await readTranslationCodeJson(esCodeJsonPath);
      const ptCodeJson = await readTranslationCodeJson(ptCodeJsonPath);

      assertExactKeyParity(esCodeJson, ptCodeJson);
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
