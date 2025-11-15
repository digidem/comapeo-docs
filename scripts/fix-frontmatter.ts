/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-non-literal-fs-filename */
import fs from "node:fs/promises";
import path from "node:path";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const SPECIAL_CHAR_PATTERN = /[&:[\]{}|>*!%@`#]/;
const ALWAYS_QUOTE_KEYS = new Set([
  "title",
  "sidebar_label",
  "pagination_label",
]);

const DOC_ROOT = path.join(process.cwd(), "docs");
const I18N_ROOT = path.join(process.cwd(), "i18n");

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const collectMarkdownFiles = async (root: string): Promise<string[]> => {
  if (!(await pathExists(root))) {
    return [];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }

    if (/\.(md|mdx)$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
};

const shouldQuoteValue = (key: string, value: string): boolean => {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return false;
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return false;
  }

  if (
    trimmed.startsWith("[") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("|") ||
    trimmed.startsWith(">")
  ) {
    return false;
  }

  if (ALWAYS_QUOTE_KEYS.has(key)) {
    return true;
  }

  return SPECIAL_CHAR_PATTERN.test(trimmed);
};

export const sanitizeFrontmatter = (
  content: string
): { content: string; changed: boolean } => {
  const match = FRONTMATTER_REGEX.exec(content);

  if (!match) {
    return { content, changed: false };
  }

  const newline = match[0].includes("\r\n") ? "\r\n" : "\n";
  const lines = match[1].split(/\r?\n/);
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^\s/.test(line)) {
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/);

    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue = ""] = keyValueMatch;

    if (!rawValue) {
      continue;
    }

    const trimmedValue = rawValue.trim();

    if (!shouldQuoteValue(key, trimmedValue)) {
      continue;
    }

    const escaped = trimmedValue.replace(/["\\]/g, (char) => `\\${char}`);
    lines[i] = `${key}: "${escaped}"`;
    changed = true;
  }

  if (!changed) {
    return { content, changed: false };
  }

  const updatedFrontmatter = `---${newline}${lines.join(newline)}${newline}---`;
  const updatedContent = `${updatedFrontmatter}${content.slice(match[0].length)}`;

  return { content: updatedContent, changed: true };
};

const getDocRoots = async (): Promise<string[]> => {
  const roots: string[] = [];

  if (await pathExists(DOC_ROOT)) {
    roots.push(DOC_ROOT);
  }

  if (await pathExists(I18N_ROOT)) {
    const locales = await fs.readdir(I18N_ROOT, { withFileTypes: true });
    for (const locale of locales) {
      if (!locale.isDirectory()) {
        continue;
      }

      const localeDocs = path.join(
        I18N_ROOT,
        locale.name,
        "docusaurus-plugin-content-docs",
        "current"
      );

      if (await pathExists(localeDocs)) {
        roots.push(localeDocs);
      }
    }
  }

  return roots;
};

const processFile = async (filePath: string): Promise<boolean> => {
  const content = await fs.readFile(filePath, "utf8");
  const { content: updated, changed } = sanitizeFrontmatter(content);

  if (!changed) {
    return false;
  }

  await fs.writeFile(filePath, updated, "utf8");
  const relativePath = path.relative(process.cwd(), filePath);
  console.log(`[fix-frontmatter] Quoted YAML values in ${relativePath}`);
  return true;
};

const main = async () => {
  const roots = await getDocRoots();
  if (roots.length === 0) {
    console.log("[fix-frontmatter] No docs directories found. Skipping.");
    return;
  }

  let totalChanged = 0;
  for (const root of roots) {
    const files = await collectMarkdownFiles(root);
    for (const file of files) {
      if (await processFile(file)) {
        totalChanged += 1;
      }
    }
  }

  if (totalChanged === 0) {
    console.log("[fix-frontmatter] All frontmatter already quoted.");
  } else {
    console.log(`[fix-frontmatter] Updated ${totalChanged} Markdown files.`);
  }
};

if (import.meta.main) {
  main().catch((error) => {
    console.error("[fix-frontmatter] Failed to sanitize frontmatter", error);
    process.exitCode = 1;
  });
}
