import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES = ["en", "pt", "es"] as const;
const TRANSLATION_LOCALES = ["pt", "es"] as const;
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const FRONTMATTER_REGEX = /^---\s*\n[\s\S]*?\n---\s*\n?/u;

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
  type: "empty-translation" | "structure-mismatch" | "missing-translation";
}

const DOCS_ROOT = "docs";
const getLocaleRoot = (mirrorRoot: string, locale: Locale): string => {
  if (locale === "en") {
    return path.join(mirrorRoot, DOCS_ROOT);
  }

  return path.join(
    mirrorRoot,
    "i18n",
    locale,
    "docusaurus-plugin-content-docs",
    "current"
  );
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

    entries.sort((a, b) => a.name.localeCompare(b.name));

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
  return files.sort((a, b) => a.localeCompare(b));
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
    .sort((a, b) => a.localeCompare(b));

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

const MEDIA_PATTERNS: RegExp[] = [
  /!\[[^\]]*\]\((?:[^()\\]|\\.)*\)/gu,
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

const tokenizeStructure = (markdown: string): string[] => {
  const tokens: string[] = [];
  const content = removeMedia(removeFrontmatter(markdown));
  const lines = content.split(/\r?\n/u);
  let inCodeBlock = false;
  let inParagraph = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (line.startsWith("```")) {
      tokens.push("code-fence");
      inCodeBlock = !inCodeBlock;
      inParagraph = false;
      continue;
    }

    if (inCodeBlock) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+/u);
    if (headingMatch) {
      tokens.push(`h${headingMatch[1].length}`);
      inParagraph = false;
      continue;
    }

    const admonitionMatch = line.match(/^:::\s*([a-z0-9-]+)/iu);
    if (admonitionMatch) {
      tokens.push(`admonition:${admonitionMatch[1].toLowerCase()}`);
      inParagraph = false;
      continue;
    }

    if (line === ":::") {
      tokens.push("admonition:end");
      inParagraph = false;
      continue;
    }

    if (/^>\s*/u.test(line)) {
      tokens.push("blockquote");
      inParagraph = false;
      continue;
    }

    if (/^[-*+]\s+/u.test(line)) {
      tokens.push("ul");
      inParagraph = false;
      continue;
    }

    if (/^\d+\.\s+/u.test(line)) {
      tokens.push("ol");
      inParagraph = false;
      continue;
    }

    if (/^(?:---|\*\*\*|___)$/u.test(line)) {
      tokens.push("hr");
      inParagraph = false;
      continue;
    }

    if (/^\|.*\|$/u.test(line)) {
      tokens.push("table-row");
      inParagraph = false;
      continue;
    }

    if (/^<[^>]+>$/u.test(line)) {
      tokens.push("html");
      inParagraph = false;
      continue;
    }

    if (!inParagraph) {
      tokens.push("paragraph");
      inParagraph = true;
    }
  }

  return tokens;
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

      if (!hasNonMediaText(translatedMarkdown)) {
        issues.push({
          key: triplet.key,
          locale,
          type: "empty-translation",
        });
        continue;
      }

      const translatedTokens = tokenizeStructure(translatedMarkdown);
      if (translatedTokens.join("|") !== sourceTokens.join("|")) {
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
