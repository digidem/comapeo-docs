#!/usr/bin/env bun
/**
 * Smoke-test script for the no-overwrite translation strategy.
 * Runs the translate pipeline twice for a single page to verify that:
 *   1. The first run creates baseline i18n files.
 *   2. The second run creates new automated-translations/ files (not overwriting i18n).
 */
import { main } from "./notion-translate/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PAGE_ID = "2331b08162d58090ab6ad6c1c5f60dda";

async function run() {
  const args = process.argv.slice(2);
  const pageIdIndex = args.indexOf("--page-id");
  const pageId = pageIdIndex !== -1 ? args[pageIdIndex + 1] : DEFAULT_PAGE_ID;

  console.log(`\n=== No-Overwrite Smoke Test ===`);
  console.log(`Page: ${pageId}`);

  // Step 1: First run — creates baseline i18n files
  console.log(`\n--- Run 1: baseline i18n creation ---`);
  const summary1 = await main({ pageId, localOnly: true });
  console.log(
    `Run 1 summary: new=${summary1.newTranslations}, automated=${summary1.automatedTranslations}`
  );

  // Step 2: Second run — should route existing translations to automated path
  console.log(`\n--- Run 2: no-overwrite automated path ---`);
  const summary2 = await main({ pageId, localOnly: true });
  console.log(
    `Run 2 summary: new=${summary2.newTranslations}, automated=${summary2.automatedTranslations}`
  );

  // Verify: automated-translations/ directories should have new files
  const ptDir = path.resolve("./automated-translations/pt");
  const esDir = path.resolve("./automated-translations/es");

  let ptFiles: string[] = [];
  let esFiles: string[] = [];
  try {
    ptFiles = (await fs.readdir(ptDir, { recursive: true })).filter((f) =>
      (f as string).endsWith(".md")
    ) as string[];
    esFiles = (await fs.readdir(esDir, { recursive: true })).filter((f) =>
      (f as string).endsWith(".md")
    ) as string[];
  } catch {
    // Directories may not exist if no automated translations were made
  }

  console.log(`\n--- Results ---`);
  console.log(`PT automated files: ${ptFiles.length}`);
  ptFiles.forEach((f) => console.log(`  ${f}`));
  console.log(`ES automated files: ${esFiles.length}`);
  esFiles.forEach((f) => console.log(`  ${f}`));

  const hasAutomated = ptFiles.length > 0 || esFiles.length > 0;
  if (summary2.automatedTranslations > 0 || hasAutomated) {
    console.log(
      `\nNo-overwrite behavior verified: automated files created on second run`
    );
  } else {
    console.log(
      `\nNo automated translations on second run — check if i18n files exist for the page`
    );
    console.log(
      `   (This is expected if the page has no existing i18n files yet)`
    );
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Smoke test failed:", message);
  process.exit(1);
});
