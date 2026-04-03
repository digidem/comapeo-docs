/**
 * Integration test: JSX/HTML preservation through real DeepSeek translation calls.
 *
 * Purpose: Guarantee that inline JSX tags (style={{...}}, className, <div>...)
 * survive translation structurally intact, with zero reliance on LLM prompt compliance.
 *
 * These tests make real API calls. They are skipped when OPENAI_API_KEY is not set.
 * Run manually with:
 *   bunx vitest run scripts/eval/jsx-preservation.integration.test.ts
 *
 * A passing run here is the acceptance criterion for the placeholder protection
 * implementation (scripts/shared/jsxPlaceholders.ts). Before that implementation
 * exists, these tests will fail non-deterministically because the LLM can corrupt
 * JSX attribute syntax (e.g. style={{...}} → style="{{...}}") with no structural guard.
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// Load .env so OPENAI_API_KEY / OPENAI_BASE_URL are available when running via vitest
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  // .env not present — rely on environment variables already set
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_PATH = resolve(
  __dirname,
  "../notion-translate/__fixtures__/small.md",
);

// Strip YAML frontmatter block so translateText() receives bare markdown body
function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\n/, "");
}

const fixture = readFileSync(FIXTURE_PATH, "utf-8");
const SOURCE_BODY = stripFrontmatter(fixture);
const SOURCE_TITLE = "Introduction";

// Counts of fragile elements in the source fixture (used in assertions)
const SOURCE_IMG_COUNT = (SOURCE_BODY.match(/<img\b/g) ?? []).length; // 4
const SOURCE_STYLE_COUNT = (SOURCE_BODY.match(/style=\{\{/g) ?? []).length; // 4
const SOURCE_CLASSNAME_VALUES = [
  ...new Set(
    [...SOURCE_BODY.matchAll(/className="([^"]+)"/g)].map((m) => m[1]),
  ),
]; // ["emoji"]

const hasApiKey = !!process.env.OPENAI_API_KEY;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertJsxIntegrity(
  translated: string,
  label: string,
): void {
  // 1. The exact production bug: style="{{...}}" wrapping
  const corrupted = translated.match(/style="\{\{/g) ?? [];
  expect(
    corrupted,
    `[${label}] LLM wrapped style={{...}} in quotes (style="{{...}}")`,
  ).toHaveLength(0);

  // 2. All <img> tags must survive
  const imgCount = (translated.match(/<img\b/g) ?? []).length;
  expect(
    imgCount,
    `[${label}] Expected ${SOURCE_IMG_COUNT} <img> tags, got ${imgCount}`,
  ).toBe(SOURCE_IMG_COUNT);

  // 3. All style={{...}} attributes must survive intact
  const styleCount = (translated.match(/style=\{\{/g) ?? []).length;
  expect(
    styleCount,
    `[${label}] Expected ${SOURCE_STYLE_COUNT} style={{...}} attributes, got ${styleCount}`,
  ).toBe(SOURCE_STYLE_COUNT);

  // 4. className values must not be translated or modified
  for (const value of SOURCE_CLASSNAME_VALUES) {
    expect(
      translated,
      `[${label}] className="${value}" was modified or removed`,
    ).toContain(`className="${value}"`);
  }

  // 5. notion-spacer <div> must survive
  expect(
    translated,
    `[${label}] <div class="notion-spacer"> was lost or corrupted`,
  ).toContain('class="notion-spacer"');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasApiKey)(
  "JSX preservation — real DeepSeek API calls",
  { timeout: 120_000 },
  () => {
    it("pt-BR: preserves all inline JSX tags and HTML elements", async () => {
      const { translateText } = await import(
        "../notion-translate/translateFrontMatter.ts"
      );

      const result = await translateText(SOURCE_BODY, SOURCE_TITLE, "pt-BR");

      assertJsxIntegrity(result.markdown, "pt-BR");
    });

    it("es: preserves all inline JSX tags and HTML elements", async () => {
      const { translateText } = await import(
        "../notion-translate/translateFrontMatter.ts"
      );

      const result = await translateText(SOURCE_BODY, SOURCE_TITLE, "es");

      assertJsxIntegrity(result.markdown, "es");
    });

    // Run the same content twice more to catch non-deterministic LLM failures.
    // Before the placeholder implementation, this will fail on at least one run.
    // After implementation, all runs must pass.
    it("pt-BR (repeat run): non-determinism stress test", async () => {
      const { translateText } = await import(
        "../notion-translate/translateFrontMatter.ts"
      );

      const result = await translateText(SOURCE_BODY, SOURCE_TITLE, "pt-BR");

      assertJsxIntegrity(result.markdown, "pt-BR repeat");
    });
  },
);
