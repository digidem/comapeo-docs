import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES = ["en", "pt", "es"] as const;
const TRANSLATION_LOCALES = ["pt", "es"] as const;
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const FRONTMATTER_REGEX = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/u;

type Locale = (typeof LOCALES)[number];

interface MarkdownTriplet {
  key: string;
  files: Record<Locale, string>;
}

interface MarkdownTripletsResult {
  triplets: MarkdownTriplet[];
  missingTranslations: Array<{
    key: string;
    sourceLocale: Locale;
    targetLocale: Locale;
  }>;
}

interface ParityIssue {
  key: string;
  locale: (typeof TRANSLATION_LOCALES)[number];
  type:
    | "empty-translation"
    | "structure-mismatch"
    | "missing-translation"
    | "frontmatter-mismatch";
}

const DOCS_ROOT = "docs";
const DEFAULT_DOCS_PLUGIN_CURRENT_PATH = path.join(
  "i18n",
  "{locale}",
  "docusaurus-plugin-content-docs",
  "current"
);

const getLocaleDocsPathTemplate = (): string =>
  process.env.LOCALE_PARITY_DOCS_PATH_TEMPLATE ??
  DEFAULT_DOCS_PLUGIN_CURRENT_PATH;

const getLocaleRoot = (mirrorRoot: string, locale: Locale): string => {
  if (locale === "en") {
    return path.join(mirrorRoot, DOCS_ROOT);
  }

  const docsPathTemplate = getLocaleDocsPathTemplate().replace(
    "{locale}",
    locale
  );

  return path.join(mirrorRoot, docsPathTemplate);
};

const isMissingDirectoryError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const toPathKey = (relativePath: string): string =>
  relativePath.split(path.sep).join("/");

const listMarkdownFiles = async (rootDir: string): Promise<string[]> => {
  const files: string[] = [];

  const walk = async (currentDir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingDirectoryError(error)) {
        return;
      }
      throw error;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (
        entry.isFile() &&
        MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push(toPathKey(path.relative(rootDir, fullPath)));
      }
    }
  };

  await walk(rootDir);
  return files.sort((a, b) => a.localeCompare(b, "en"));
};

const buildMarkdownTriplets = async (
  mirrorRoot: string
): Promise<MarkdownTripletsResult> => {
  const [enFiles, ptFiles, esFiles] = await Promise.all(
    LOCALES.map((locale) =>
      listMarkdownFiles(getLocaleRoot(mirrorRoot, locale))
    )
  );

  const enSet = new Set(enFiles);
  const ptSet = new Set(ptFiles);
  const esSet = new Set(esFiles);

  const missingTranslations: Array<{
    key: string;
    sourceLocale: Locale;
    targetLocale: Locale;
  }> = [];

  for (const enKey of enFiles) {
    if (!ptSet.has(enKey)) {
      missingTranslations.push({
        key: enKey,
        sourceLocale: "en",
        targetLocale: "pt",
      });
    }
    if (!esSet.has(enKey)) {
      missingTranslations.push({
        key: enKey,
        sourceLocale: "en",
        targetLocale: "es",
      });
    }
  }

  for (const ptKey of ptFiles) {
    if (!enSet.has(ptKey)) {
      missingTranslations.push({
        key: ptKey,
        sourceLocale: "pt",
        targetLocale: "en",
      });
    }
    if (!esSet.has(ptKey)) {
      missingTranslations.push({
        key: ptKey,
        sourceLocale: "pt",
        targetLocale: "es",
      });
    }
  }

  for (const esKey of esFiles) {
    if (!enSet.has(esKey)) {
      missingTranslations.push({
        key: esKey,
        sourceLocale: "es",
        targetLocale: "en",
      });
    }
    if (!ptSet.has(esKey)) {
      missingTranslations.push({
        key: esKey,
        sourceLocale: "es",
        targetLocale: "pt",
      });
    }
  }

  const keys = enFiles
    .filter(
      (relativePath) => ptSet.has(relativePath) && esSet.has(relativePath)
    )
    .sort((a, b) => a.localeCompare(b, "en"));

  const triplets = keys.map((key) => ({
    key,
    files: {
      en: path.join(getLocaleRoot(mirrorRoot, "en"), key),
      pt: path.join(getLocaleRoot(mirrorRoot, "pt"), key),
      es: path.join(getLocaleRoot(mirrorRoot, "es"), key),
    },
  }));

  return { triplets, missingTranslations };
};

const removeFrontmatter = (markdown: string): string =>
  markdown.replace(FRONTMATTER_REGEX, "");

const normalizeFrontmatter = (markdown: string): string => {
  const frontmatter = markdown.match(FRONTMATTER_REGEX)?.[0];
  if (!frontmatter) {
    return "";
  }

  return frontmatter.replace(/\r?\n/gu, "\n").trim().replace(/\s+/gu, " ");
};

const shouldValidateFrontmatter = (): boolean =>
  process.env.LOCALE_PARITY_VALIDATE_FRONTMATTER === "true";

const MEDIA_PATTERNS: RegExp[] = [
  /!\[[^\]]*\]\((?:[^()\\]|\\.)*\)/gu,
  /!\[[^\]]*\]\[[^\]]*\]/gu,
  /<img\b[^>]*\/?>/giu,
  /<source\b[^>]*\/?>/giu,
  /<video\b[^>]*>[\s\S]*?<\/video>/giu,
  /<picture\b[^>]*>[\s\S]*?<\/picture>/giu,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/giu,
  /<(?:Image|IdealImage)\b[^>]*\/?>/gu,
];

const removeMedia = (markdown: string): string => {
  let content = markdown;

  for (const pattern of MEDIA_PATTERNS) {
    content = content.replace(pattern, "");
  }

  return content;
};

const hasNonMediaText = (markdown: string): boolean => {
  const stripped = removeMedia(removeFrontmatter(markdown))
    .replace(/\[([^\]]+)\]\((?:[^()\\]|\\.)*\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  return /[\p{L}\p{N}]/u.test(stripped);
};

const isTableAlignmentRow = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return false;
  }

  const compact = trimmed.replace(/\s+/gu, "");
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded single-line table separator check for markdown alignment rows
  return /^\|?:?-{3,}:?(?:\|:?-{3,}:?)+\|?$/u.test(compact);
};

const isListItemLine = (rawLine: string): boolean =>
  /^\s*(?:[-*+]\s+|\d+\.\s+)/u.test(rawLine);

const isSetextHeadingCandidate = (rawLine: string, line: string): boolean => {
  if (!line) {
    return false;
  }

  if (/^\s{0,3}(?:`{3,}|~{3,})/u.test(rawLine)) {
    return false;
  }

  if (/^\s{0,3}#{1,6}\s+/u.test(rawLine)) {
    return false;
  }

  if (isListItemLine(rawLine)) {
    return false;
  }

  if (/^\s*>\s*/u.test(rawLine)) {
    return false;
  }

  if (/^\s*:::/u.test(rawLine)) {
    return false;
  }

  if (/^(?:---|\*\*\*|___)$/u.test(line)) {
    return false;
  }

  if (/^\|.*\|$/u.test(line)) {
    return false;
  }

  if (/^<[^>]+>$/u.test(line)) {
    return false;
  }

  return true;
};

const getListDepth = (rawLine: string): number => {
  const expanded = rawLine.replace(/\t/gu, "    ");
  const indent = expanded.match(/^\s*/u)?.[0].length ?? 0;
  return Math.floor(indent / 2);
};

const tokenizeStructure = (markdown: string): string[] => {
  const tokens: string[] = [];
  const content = removeMedia(removeFrontmatter(markdown));
  const lines = content.split(/\r?\n/u);
  let inCodeFence = false;
  let inIndentedCode = false;
  let inParagraph = false;
  let admonitionDepth = 0;

  const pushToken = (token: string): void => {
    if (admonitionDepth > 0 && token !== "admonition:end") {
      tokens.push(`admonition-body:${token}`);
      return;
    }

    tokens.push(token);
  };

  for (let i = 0; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is bounded by lines.length in this loop
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      if (inIndentedCode) {
        continue;
      }
      inParagraph = false;
      continue;
    }

    if (inCodeFence) {
      if (line.startsWith("```")) {
        pushToken("code-fence:end");
        inCodeFence = false;
      }
      continue;
    }

    if (line.startsWith("```")) {
      pushToken("code-fence:start");
      inCodeFence = true;
      inParagraph = false;
      continue;
    }

    const isIndentedCodeLine =
      /^(?: {4,}|\t)/u.test(rawLine) && !isListItemLine(rawLine);

    if (isIndentedCodeLine) {
      if (!inIndentedCode) {
        pushToken("code-indented");
        inIndentedCode = true;
      }
      inParagraph = false;
      continue;
    }

    if (inIndentedCode) {
      inIndentedCode = false;
    }

    const nextLine = lines[i + 1]?.trim() ?? "";
    if (isSetextHeadingCandidate(rawLine, line) && /^=+$/u.test(nextLine)) {
      pushToken("h1");
      inParagraph = false;
      i += 1;
      continue;
    }

    if (isSetextHeadingCandidate(rawLine, line) && /^-+$/u.test(nextLine)) {
      pushToken("h2");
      inParagraph = false;
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+/u);
    if (headingMatch) {
      pushToken(`h${headingMatch[1].length}`);
      inParagraph = false;
      continue;
    }

    const admonitionMatch = line.match(/^:::\s*([a-z0-9-]+)/iu);
    if (admonitionMatch) {
      pushToken(`admonition:start:${admonitionMatch[1].toLowerCase()}`);
      admonitionDepth += 1;
      inParagraph = false;
      continue;
    }

    if (line === ":::") {
      tokens.push("admonition:end");
      admonitionDepth = Math.max(0, admonitionDepth - 1);
      inParagraph = false;
      continue;
    }

    if (/^>\s*/u.test(line)) {
      pushToken("blockquote");
      inParagraph = false;
      continue;
    }

    if (/^\s*[-*+]\s+/u.test(rawLine)) {
      pushToken(`ul:${getListDepth(rawLine)}`);
      inParagraph = false;
      continue;
    }

    if (/^\s*\d+\.\s+/u.test(rawLine)) {
      pushToken(`ol:${getListDepth(rawLine)}`);
      inParagraph = false;
      continue;
    }

    if (/^(?:---|\*\*\*|___)$/u.test(line)) {
      pushToken("hr");
      inParagraph = false;
      continue;
    }

    if (/^\|.*\|$/u.test(line)) {
      if (!isTableAlignmentRow(line)) {
        pushToken("table-row");
      }
      inParagraph = false;
      continue;
    }

    if (/^<[^>]+>$/u.test(line)) {
      pushToken("html");
      inParagraph = false;
      continue;
    }

    if (!inParagraph) {
      pushToken("paragraph");
      inParagraph = true;
    }
  }

  return tokens;
};

const normalizeForRelaxedComparison = (tokens: string[]): string[] => {
  const normalized: string[] = [];
  for (const token of tokens) {
    if (
      token === "paragraph" &&
      normalized[normalized.length - 1] === "paragraph"
    ) {
      continue;
    }
    normalized.push(token);
  }
  return normalized;
};

const getFirstTokenDiff = (
  sourceTokens: string[],
  translatedTokens: string[]
): { index: number; source: string; translated: string } | null => {
  const maxLen = Math.max(sourceTokens.length, translatedTokens.length);
  for (let i = 0; i < maxLen; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is bounded by maxLen derived from array lengths
    const source = sourceTokens[i] ?? "<none>";
    // eslint-disable-next-line security/detect-object-injection -- i is bounded by maxLen derived from array lengths
    const translated = translatedTokens[i] ?? "<none>";
    if (source !== translated) {
      return { index: i, source, translated };
    }
  }
  return null;
};

const structuresMatch = (
  sourceTokens: string[],
  translatedTokens: string[]
): boolean => {
  const strictness = process.env.LOCALE_PARITY_STRICTNESS ?? "strict";
  if (strictness === "relaxed") {
    return (
      normalizeForRelaxedComparison(sourceTokens).join("|") ===
      normalizeForRelaxedComparison(translatedTokens).join("|")
    );
  }

  return translatedTokens.join("|") === sourceTokens.join("|");
};

const collectParityIssues = async (
  mirrorRoot: string
): Promise<ParityIssue[]> => {
  const { triplets, missingTranslations } =
    await buildMarkdownTriplets(mirrorRoot);
  const issues: ParityIssue[] = [];

  for (const missing of missingTranslations) {
    if (missing.targetLocale === "pt" || missing.targetLocale === "es") {
      issues.push({
        key: missing.key,
        locale: missing.targetLocale,
        type: "missing-translation",
      });
    }
  }

  for (const triplet of triplets) {
    const [enMarkdown, ptMarkdown, esMarkdown] = await Promise.all([
      fs.readFile(triplet.files.en, "utf8"),
      fs.readFile(triplet.files.pt, "utf8"),
      fs.readFile(triplet.files.es, "utf8"),
    ]);

    const sourceTokens = tokenizeStructure(enMarkdown);
    for (const locale of TRANSLATION_LOCALES) {
      const translatedMarkdown = locale === "pt" ? ptMarkdown : esMarkdown;

      if (
        shouldValidateFrontmatter() &&
        normalizeFrontmatter(enMarkdown) !==
          normalizeFrontmatter(translatedMarkdown)
      ) {
        issues.push({
          key: triplet.key,
          locale,
          type: "frontmatter-mismatch",
        });
      }

      if (!hasNonMediaText(translatedMarkdown)) {
        issues.push({
          key: triplet.key,
          locale,
          type: "empty-translation",
        });
        continue;
      }

      const translatedTokens = tokenizeStructure(translatedMarkdown);
      if (!structuresMatch(sourceTokens, translatedTokens)) {
        const firstDiff = getFirstTokenDiff(sourceTokens, translatedTokens);
        if (firstDiff) {
          console.warn(
            `Structure mismatch in ${triplet.key} (${locale}) at token index ${firstDiff.index}: source=${firstDiff.source}, translated=${firstDiff.translated}`
          );
        }

        issues.push({
          key: triplet.key,
          locale,
          type: "structure-mismatch",
        });
      }
    }
  }

  return issues;
};

const withFrontmatter = (
  id: string,
  title: string,
  body: string
): string => `---
id: ${id}
title: "${title}"
---

${body.trim()}
`;

const writeMarkdown = async (
  rootDir: string,
  relativePath: string,
  content: string
): Promise<void> => {
  const fullPath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
};

const writeTriplet = async (
  mirrorRoot: string,
  relativePath: string,
  content: Record<Locale, string>
): Promise<void> => {
  const getContent = (locale: Locale): string | undefined => {
    if (locale === "en") {
      return content.en;
    }
    if (locale === "pt") {
      return content.pt;
    }
    return content.es;
  };

  await Promise.all(
    LOCALES.map(async (locale) => {
      const localeContent = getContent(locale);
      if (localeContent === "" || localeContent === undefined) {
        return;
      }
      await writeMarkdown(
        getLocaleRoot(mirrorRoot, locale),
        relativePath,
        localeContent
      );
    })
  );
};

const withTempMirror = async (
  run: (mirrorRoot: string) => Promise<void>
): Promise<void> => {
  const mirrorRoot = await fs.mkdtemp(path.join(os.tmpdir(), "locale-parity-"));
  try {
    await run(mirrorRoot);
  } finally {
    await fs.rm(mirrorRoot, { recursive: true, force: true });
  }
};

const withEnv = async (
  key: string,
  value: string,
  run: () => Promise<void>
): Promise<void> => {
  // eslint-disable-next-line security/detect-object-injection -- key is controlled by test constants in this harness
  const previous = process.env[key];
  // eslint-disable-next-line security/detect-object-injection -- key is controlled by test constants in this harness
  process.env[key] = value;
  try {
    await run();
  } finally {
    if (previous === undefined) {
      // eslint-disable-next-line security/detect-object-injection -- key is controlled by test constants in this harness
      delete process.env[key];
    } else {
      // eslint-disable-next-line security/detect-object-injection -- key is controlled by test constants in this harness
      process.env[key] = previous;
    }
  }
};

describe("Locale parity markdown harness", () => {
  it("finds triplets deterministically", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "z-last.md", {
        en: withFrontmatter("doc-z-last", "Z", "# Z"),
        pt: withFrontmatter("doc-z-last-pt", "Z PT", "# Z PT"),
        es: withFrontmatter("doc-z-last-es", "Z ES", "# Z ES"),
      });
      await writeTriplet(mirrorRoot, "a-first.md", {
        en: withFrontmatter("doc-a-first", "A", "# A"),
        pt: withFrontmatter("doc-a-first-pt", "A PT", "# A PT"),
        es: withFrontmatter("doc-a-first-es", "A ES", "# A ES"),
      });

      await writeMarkdown(
        getLocaleRoot(mirrorRoot, "en"),
        "orphan.md",
        withFrontmatter("doc-orphan", "Orphan", "# Orphan")
      );

      const { triplets } = await buildMarkdownTriplets(mirrorRoot);
      expect(triplets.map((triplet) => triplet.key)).toEqual([
        "a-first.md",
        "z-last.md",
      ]);
    });
  });

  it("allows media-only differences while enforcing structural parity", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/onboarding.md", {
        en: withFrontmatter(
          "doc-onboarding",
          "Installing CoMapeo",
          `
# Installing CoMapeo

Start here.

![hero](/images/en-hero.png)

## Steps

1. Open CoMapeo.
2. Join a project.

:::note
Review your permissions.
:::
`
        ),
        pt: withFrontmatter(
          "doc-onboarding-pt",
          "Instalando CoMapeo",
          `
# Instalando CoMapeo

Comece aqui.

![capa](/images/pt-hero.png)

## Etapas

1. Abra o CoMapeo.
2. Entre em um projeto.

:::note
Revise as permissoes.
:::
`
        ),
        es: withFrontmatter(
          "doc-onboarding-es",
          "Instalando CoMapeo",
          `
# Instalando CoMapeo

Empieza aqui.

![portada](/images/es-hero.png)

## Pasos

1. Abre CoMapeo.
2. Unete a un proyecto.

:::note
Revisa tus permisos.
:::
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toEqual([]);
    });
  });

  it("flags empty translations when only media exists", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/empty-translation.md", {
        en: withFrontmatter(
          "doc-empty-source",
          "Empty Translation Source",
          `
# Source

Real source text.
`
        ),
        pt: withFrontmatter(
          "doc-empty-pt",
          "Tradução vazia",
          `
![imagem](/images/only-media.png)
<img src="/images/only-media-inline.png" alt="midia" />
`
        ),
        es: withFrontmatter(
          "doc-empty-es",
          "Traducción válida",
          `
# Fuente

Texto traducido.
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toContainEqual({
        key: "guides/empty-translation.md",
        locale: "pt",
        type: "empty-translation",
      });
    });
  });

  it("flags structural mismatches for translated files", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/structure.md", {
        en: withFrontmatter(
          "doc-structure-source",
          "Structure Source",
          `
# Source title

Intro paragraph.

## Steps

1. First.
2. Second.
`
        ),
        pt: withFrontmatter(
          "doc-structure-pt",
          "Estrutura com desvio",
          `
# Titulo fonte

Paragrafo inicial.

### Etapas

- Primeiro.
`
        ),
        es: withFrontmatter(
          "doc-structure-es",
          "Estructura válida",
          `
# Titulo fuente

Parrafo inicial.

## Pasos

1. Primero.
2. Segundo.
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toContainEqual({
        key: "guides/structure.md",
        locale: "pt",
        type: "structure-mismatch",
      });
    });
  });

  it("does not fail parity on paragraph line wrapping differences", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/wrapping.md", {
        en: withFrontmatter(
          "doc-wrapping-source",
          "Wrapping Source",
          `
# Wrapping

This paragraph has one line in English.

## Next

Final note.
`
        ),
        pt: withFrontmatter(
          "doc-wrapping-pt",
          "Quebra de linha",
          `
# Quebra de linha

Este parágrafo foi quebrado
em duas linhas no português.

## Próximo

Nota final.
`
        ),
        es: withFrontmatter(
          "doc-wrapping-es",
          "Ajuste de línea",
          `
# Ajuste de línea

Este párrafo fue ajustado
en dos líneas en español.

## Siguiente

Nota final.
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toEqual([]);
    });
  });

  it("handles setext headings, nested lists, and indented code parity", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/advanced-structure.md", {
        en: withFrontmatter(
          "doc-advanced-structure",
          "Advanced Structure",
          `
Title
=====

- Parent
  - Nested

    const x = 1;
`
        ),
        pt: withFrontmatter(
          "doc-advanced-structure-pt",
          "Estrutura avançada",
          `
Titulo
======

- Pai
  - Aninhado

    const y = 2;
`
        ),
        es: withFrontmatter(
          "doc-advanced-structure-es",
          "Estructura avanzada",
          `
Titulo
======

- Padre
  - Anidado

    const z = 3;
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toEqual([]);
    });
  });

  it("flags when admonition-contained structure moves outside admonition", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/admonition-scope.md", {
        en: withFrontmatter(
          "doc-admonition-scope",
          "Admonition scope",
          `
:::note
- Keep this list inside
:::
`
        ),
        pt: withFrontmatter(
          "doc-admonition-scope-pt",
          "Escopo de admonition",
          `
:::note
Observação.
:::

- Lista fora
`
        ),
        es: withFrontmatter(
          "doc-admonition-scope-es",
          "Alcance admonición",
          `
:::note
- Mantener esta lista dentro
:::
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toContainEqual({
        key: "guides/admonition-scope.md",
        locale: "pt",
        type: "structure-mismatch",
      });
    });
  });

  it("ignores table alignment-only differences and supports CRLF frontmatter", async () => {
    await withTempMirror(async (mirrorRoot) => {
      const enContent =
        '---\r\nid: doc-table\r\ntitle: "Table"\r\n---\r\n\r\n| Name | Value |\r\n| :--- | ---: |\r\n| A | 1 |\r\n';
      const ptContent =
        '---\r\nid: doc-table-pt\r\ntitle: "Tabela"\r\n---\r\n\r\n| Nome | Valor |\r\n| --- | --- |\r\n| A | 1 |\r\n';
      const esContent =
        '---\r\nid: doc-table-es\r\ntitle: "Tabla"\r\n---\r\n\r\n| Nombre | Valor |\r\n| --- | --- |\r\n| A | 1 |\r\n';

      await writeTriplet(mirrorRoot, "guides/table-crlf.md", {
        en: enContent,
        pt: ptContent,
        es: esContent,
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toEqual([]);
    });
  });

  it("supports configurable locale docs path templates", async () => {
    await withEnv(
      "LOCALE_PARITY_DOCS_PATH_TEMPLATE",
      path.join("translations", "{locale}", "docs"),
      async () => {
        await withTempMirror(async (mirrorRoot) => {
          await writeMarkdown(
            path.join(mirrorRoot, "docs"),
            "guide.md",
            withFrontmatter("doc-guide", "Guide", "# Guide")
          );
          await writeMarkdown(
            path.join(mirrorRoot, "translations", "pt", "docs"),
            "guide.md",
            withFrontmatter("doc-guide-pt", "Guia", "# Guia")
          );
          await writeMarkdown(
            path.join(mirrorRoot, "translations", "es", "docs"),
            "guide.md",
            withFrontmatter("doc-guide-es", "Guía", "# Guía")
          );

          const issues = await collectParityIssues(mirrorRoot);
          expect(issues).toEqual([]);
        });
      }
    );
  });

  it("optionally validates frontmatter parity", async () => {
    await withEnv("LOCALE_PARITY_VALIDATE_FRONTMATTER", "true", async () => {
      await withTempMirror(async (mirrorRoot) => {
        await writeTriplet(mirrorRoot, "guides/frontmatter.md", {
          en: withFrontmatter("doc-frontmatter", "Frontmatter", "# Body"),
          pt: `---
id: doc-frontmatter-pt
title: "Frontmatter PT"
custom: translated
---

# Corpo
`,
          es: withFrontmatter("doc-frontmatter-es", "Frontmatter", "# Cuerpo"),
        });

        const issues = await collectParityIssues(mirrorRoot);
        expect(issues).toContainEqual({
          key: "guides/frontmatter.md",
          locale: "pt",
          type: "frontmatter-mismatch",
        });
      });
    });
  });

  it("does not classify deeply indented list items as indented code", () => {
    const tokens = tokenizeStructure(`
- Parent
    - Deep unordered child
    1. Deep ordered child
`);

    expect(tokens).toContain("ul:0");
    expect(tokens).toContain("ul:2");
    expect(tokens).toContain("ol:2");
    expect(tokens).not.toContain("code-indented");
  });

  it("does not treat list plus thematic break as setext heading", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/list-hr-vs-heading.md", {
        en: withFrontmatter(
          "doc-list-hr-vs-heading",
          "List and HR",
          `
- Item
---
`
        ),
        pt: withFrontmatter(
          "doc-list-hr-vs-heading-pt",
          "Lista e linha",
          `
Título
---
`
        ),
        es: withFrontmatter(
          "doc-list-hr-vs-heading-es",
          "Lista y línea",
          `
- Elemento
---
`
        ),
      });

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toContainEqual({
        key: "guides/list-hr-vs-heading.md",
        locale: "pt",
        type: "structure-mismatch",
      });
    });
  });

  it("reports missing translation files as distinct issue type", async () => {
    await withTempMirror(async (mirrorRoot) => {
      await writeTriplet(mirrorRoot, "guides/complete.md", {
        en: withFrontmatter("doc-complete", "Complete", "# Complete"),
        pt: withFrontmatter("doc-complete-pt", "Completo", "# Completo"),
        es: withFrontmatter("doc-complete-es", "Completo", "# Completo"),
      });

      await writeTriplet(mirrorRoot, "guides/missing-pt.md", {
        en: withFrontmatter("doc-missing-pt", "Missing PT", "# Missing PT"),
        pt: "",
        es: withFrontmatter("doc-missing-pt-es", "Falta PT", "# Falta PT"),
      });

      await writeTriplet(mirrorRoot, "guides/missing-es.md", {
        en: withFrontmatter("doc-missing-es", "Missing ES", "# Missing ES"),
        pt: withFrontmatter("doc-missing-es-pt", "Falta ES", "# Falta ES"),
        es: "",
      });

      await writeMarkdown(
        getLocaleRoot(mirrorRoot, "pt"),
        "guides/pt-only.md",
        withFrontmatter("doc-pt-only", "PT Only", "# Apenas PT")
      );
      await writeMarkdown(
        getLocaleRoot(mirrorRoot, "es"),
        "guides/es-only.md",
        withFrontmatter("doc-es-only", "ES Only", "# Solo ES")
      );

      const issues = await collectParityIssues(mirrorRoot);
      expect(issues).toContainEqual({
        key: "guides/missing-pt.md",
        locale: "pt",
        type: "missing-translation",
      });
      expect(issues).toContainEqual({
        key: "guides/missing-es.md",
        locale: "es",
        type: "missing-translation",
      });
      expect(issues).toContainEqual({
        key: "guides/pt-only.md",
        locale: "es",
        type: "missing-translation",
      });
      expect(issues).toContainEqual({
        key: "guides/es-only.md",
        locale: "pt",
        type: "missing-translation",
      });
    });
  });
});
