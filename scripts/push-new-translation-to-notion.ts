#!/usr/bin/env bun
/**
 * Push a pre-translated automated translation file to Notion as a new page.
 *
 * Usage:
 *   bun scripts/push-new-translation-to-notion.ts --file <path> --language <automated-language-code>
 *
 * Requires: the file to have a corresponding .notion.json sidecar from a Notion-API translation run.
 * Does NOT work with files generated in --local-only mode (no sidecar).
 */
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { parse as parseYaml } from "yaml";
import { createNotionPageWithBlocks } from "./notion-translate/translateBlocks.js";
import { notion } from "./notionClient.js";
import { LANGUAGES, getAutomatedLanguageCode } from "./constants.js";

dotenv.config({ override: true });

const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID ?? "";
const DATABASE_ID = process.env.DATABASE_ID ?? "";

/** Frontmatter parser — extracts YAML between --- delimiters and parses with the yaml package. */
function parseSimpleFrontmatter(content: string): Record<string, string> {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith("---")) return {};

  // Find the closing delimiter as a standalone line (not just "---" anywhere in YAML values)
  const lines = trimmed.split("\n");
  let closingLine = -1;
  for (let i = 1; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- numeric index from for-loop, not user-controlled
    if (lines[i].trimEnd() === "---") {
      closingLine = i;
      break;
    }
  }
  if (closingLine === -1) return {};

  const yamlContent = lines.slice(1, closingLine).join("\n");
  const parsed = parseYaml(yamlContent) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      // eslint-disable-next-line security/detect-object-injection -- key comes from YAML parsing, not user input
      result[key] = value;
    }
  }
  return result;
}

function parseArgs(argsOverride?: string[]): {
  file: string;
  language: string;
} {
  const args = argsOverride ?? process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const languageIndex = args.indexOf("--language");

  if (fileIndex === -1 || !args[fileIndex + 1]) {
    throw new Error("Missing --file argument");
  }
  if (languageIndex === -1 || !args[languageIndex + 1]) {
    throw new Error("Missing --language argument");
  }

  const language = args[languageIndex + 1];
  const validAutomatedLanguages = LANGUAGES.map((lang) =>
    getAutomatedLanguageCode(lang.notionLangCode)
  );
  if (!validAutomatedLanguages.includes(language)) {
    throw new Error(
      `Invalid --language value: "${language}". Expected one of: ${validAutomatedLanguages.map((l) => `'${l}'`).join(", ")}`
    );
  }

  return { file: args[fileIndex + 1], language };
}

export async function run(argsOverride?: string[]) {
  const { file, language } = parseArgs(argsOverride);

  const filePath = path.resolve(file);
  const sidecarPath = filePath.replace(/\.md$/i, ".notion.json");

  console.log(`File: ${filePath}`);
  console.log(`Language: ${language}`);

  // Check sidecar exists
  try {
    await fs.access(sidecarPath);
  } catch {
    throw new Error(
      `No .notion.json sidecar found at ${sidecarPath}. ` +
        `Run the translation with Notion API access (without --local-only) to generate block data.`
    );
  }

  // Read markdown file for title
  const markdownContent = await fs.readFile(filePath, "utf8");
  const frontmatter = parseSimpleFrontmatter(markdownContent);
  const title = frontmatter.title ?? path.basename(filePath, ".md");

  // Read Notion blocks sidecar (contains parentId + blocks)
  const sidecarContent = await fs.readFile(sidecarPath, "utf8");
  const sidecarParsed: unknown = JSON.parse(sidecarContent);
  const sidecar = sidecarParsed as {
    parentId?: string;
    blocks?: unknown[];
    sourceProperties?: Record<string, unknown>;
  };

  const blocks = (sidecar.blocks ??
    []) as import("@notionhq/client/build/src/api-endpoints").BlockObjectRequest[];
  const parentId = sidecar.parentId;

  if (!parentId) {
    throw new Error(
      `No parentId found in sidecar ${sidecarPath}. ` +
        `Re-run the translation (without --local-only) to regenerate the sidecar with parent metadata.`
    );
  }

  const databaseId = DATA_SOURCE_ID || DATABASE_ID;
  if (!databaseId) {
    throw new Error(
      "Neither DATA_SOURCE_ID nor DATABASE_ID environment variable is set"
    );
  }

  console.log(`Creating Notion page: "${title}" under parent ${parentId}`);

  const properties: Record<string, unknown> = {
    ...(sidecar.sourceProperties || {}),
    Language: { select: { name: language } },
  };

  const pageId = await createNotionPageWithBlocks(
    notion,
    parentId,
    databaseId,
    title,
    blocks,
    properties,
    language,
    undefined, // no existingPageId
    true // forceCreate — always creates new page
  );

  console.log(`Created Notion page: ${pageId}`);
  console.log(`   View: https://notion.so/${pageId.replace(/-/g, "")}`);
}

if (import.meta.main) {
  run().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Push failed:", message);
    process.exit(1);
  });
}
