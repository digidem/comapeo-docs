#!/usr/bin/env bun
/**
 * Smoke-test script for page-specific no-overwrite translation behavior.
 * Runs the translate pipeline twice for a single page to verify that:
 *   1. The page has baseline i18n files after the first run.
 *   2. The second run leaves those page-specific i18n files untouched.
 *   3. The second run creates new automated-translations files for that same page.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { getAutomatedOutputDir, LANGUAGES } from "./constants.js";
import { resolveCanonicalDocsRelativePath } from "./notion-fetch/pageMetadataCache.js";
import { main } from "./notion-translate/index.js";

const DEFAULT_PAGE_ID = "2331b08162d58090ab6ad6c1c5f60dda";
const MINUTE_BOUNDARY_BUFFER_MS = 1500;

type FileSnapshot = {
  hash: string;
  sizeBytes: number;
  mtimeMs: number;
};

type AutomatedFileSnapshots = Map<string, FileSnapshot>;

type LanguageSmokeTarget = {
  language: string;
  i18nPath: string;
  automatedDir: string;
};

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function formatProjectPath(filePath: string): string {
  return toPosixPath(path.relative(process.cwd(), filePath));
}

function getAutomatedFilePrefix(canonicalRelativePath: string): string {
  return `${toPosixPath(canonicalRelativePath.replace(/\.md$/i, ""))}-`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function snapshotFile(filePath: string): Promise<FileSnapshot> {
  const [content, stats] = await Promise.all([
    fs.readFile(filePath, "utf8"),
    fs.stat(filePath),
  ]);

  return {
    hash: createHash("sha256").update(content).digest("hex"),
    sizeBytes: Buffer.byteLength(content, "utf8"),
    mtimeMs: stats.mtimeMs,
  };
}

async function listPageAutomatedMarkdownFiles(
  automatedDir: string,
  canonicalRelativePath: string
): Promise<string[]> {
  try {
    const pagePrefix = getAutomatedFilePrefix(canonicalRelativePath);
    return ((await fs.readdir(automatedDir, { recursive: true })) as string[])
      .map((entry) => toPosixPath(entry))
      .filter((entry) => entry.startsWith(pagePrefix) && entry.endsWith(".md"))
      .sort();
  } catch {
    return [];
  }
}

async function snapshotAutomatedMarkdownFiles(
  automatedDir: string,
  canonicalRelativePath: string
): Promise<AutomatedFileSnapshots> {
  const filePaths = await listPageAutomatedMarkdownFiles(
    automatedDir,
    canonicalRelativePath
  );
  const snapshots = await Promise.all(
    filePaths.map(
      async (relativePath) =>
        [
          relativePath,
          await snapshotFile(path.join(automatedDir, relativePath)),
        ] as [string, FileSnapshot]
    )
  );

  return new Map(snapshots);
}

function hasFileSnapshotChanged(
  before: FileSnapshot,
  after: FileSnapshot
): boolean {
  return (
    before.hash !== after.hash ||
    before.sizeBytes !== after.sizeBytes ||
    before.mtimeMs !== after.mtimeMs
  );
}

function describeAutomatedArtifactDelta(
  beforeSnapshots: AutomatedFileSnapshots,
  afterSnapshots: AutomatedFileSnapshots
): {
  newFiles: string[];
  changedFiles: string[];
} {
  const newFiles: string[] = [];
  const changedFiles: string[] = [];

  for (const [relativePath, afterSnapshot] of afterSnapshots.entries()) {
    const beforeSnapshot = beforeSnapshots.get(relativePath);
    if (!beforeSnapshot) {
      newFiles.push(relativePath);
      continue;
    }

    if (hasFileSnapshotChanged(beforeSnapshot, afterSnapshot)) {
      changedFiles.push(relativePath);
    }
  }

  return { newFiles, changedFiles };
}

function formatAutomatedArtifactOutcome(
  newFiles: string[],
  changedFiles: string[]
): string {
  if (newFiles.length > 0) {
    return `${newFiles.length} new file${newFiles.length === 1 ? "" : "s"}`;
  }

  if (changedFiles.length > 0) {
    return `${changedFiles.length} same-name file${changedFiles.length === 1 ? "" : "s"} changed in place`;
  }

  return "no artifact changes detected";
}

function getCanonicalRelativePath(pageId: string): string {
  const canonicalRelativePath = resolveCanonicalDocsRelativePath(pageId);
  if (!canonicalRelativePath) {
    throw new Error(
      `No canonical docs path found for page ${pageId}. This smoke test needs a cached docs-relative path to verify page-specific output.`
    );
  }

  if (!/\.(md|mdx)$/i.test(canonicalRelativePath)) {
    throw new Error(
      `Smoke test only supports markdown-backed pages. Resolved path was ${canonicalRelativePath}.`
    );
  }

  return canonicalRelativePath;
}

function getLanguageTargets(
  canonicalRelativePath: string
): LanguageSmokeTarget[] {
  return LANGUAGES.map((config) => {
    const automatedDir = getAutomatedOutputDir(config.language);
    if (!automatedDir) {
      throw new Error(
        `No automated output directory configured for ${config.language}`
      );
    }

    return {
      language: config.language,
      i18nPath: path.resolve(config.outputDir, canonicalRelativePath),
      automatedDir: path.resolve(automatedDir),
    };
  });
}

async function waitForNextAutomatedTimestampWindow(): Promise<void> {
  const now = new Date();
  const nextMinute = new Date(now);
  nextMinute.setSeconds(60, 0);
  const waitMs =
    nextMinute.getTime() - now.getTime() + MINUTE_BOUNDARY_BUFFER_MS;

  console.log(
    `\nWaiting ${waitMs}ms for the next minute boundary so automated artifact names must advance...`
  );
  await sleep(waitMs);
}

async function run() {
  const args = process.argv.slice(2);
  const pageIdIndex = args.indexOf("--page-id");
  const pageId = pageIdIndex !== -1 ? args[pageIdIndex + 1] : DEFAULT_PAGE_ID;
  const canonicalRelativePath = getCanonicalRelativePath(pageId);
  const languageTargets = getLanguageTargets(canonicalRelativePath);

  console.log(`\n=== Page-Specific No-Overwrite Smoke Test ===`);
  console.log(`Page: ${pageId}`);
  console.log(`Canonical docs path: ${canonicalRelativePath}`);
  console.log(
    `Automated file pattern: ${getAutomatedFilePrefix(canonicalRelativePath)}*.md`
  );

  const existedBeforeRun1 = await Promise.all(
    languageTargets.map(async (target) => ({
      language: target.language,
      exists: await fileExists(target.i18nPath),
    }))
  );

  console.log(`\n--- Run 1: establish or reuse baseline i18n files ---`);
  const summary1 = await main({ pageId, localOnly: true });
  console.log(
    `Run 1 summary: new=${summary1.newTranslations}, automated=${summary1.automatedTranslations}`
  );

  const baselineState = await Promise.all(
    languageTargets.map(async (target) => {
      const baselineExists = await fileExists(target.i18nPath);
      if (!baselineExists) {
        throw new Error(
          `Expected baseline i18n file for ${target.language} at ${formatProjectPath(target.i18nPath)} after run 1`
        );
      }

      return {
        ...target,
        existedBeforeRun1:
          existedBeforeRun1.find((entry) => entry.language === target.language)
            ?.exists ?? false,
        i18nSnapshotBeforeRun2: await snapshotFile(target.i18nPath),
        automatedFileSnapshotsBeforeRun2: await snapshotAutomatedMarkdownFiles(
          target.automatedDir,
          canonicalRelativePath
        ),
      };
    })
  );

  console.log(`\nBaseline state after run 1:`);
  baselineState.forEach((state) => {
    console.log(
      `  ${state.language}: ${formatProjectPath(state.i18nPath)} (${state.existedBeforeRun1 ? "pre-existing" : "created/refreshed by run 1"})`
    );
  });

  await waitForNextAutomatedTimestampWindow();

  console.log(`\n--- Run 2: verify page-specific no-overwrite behavior ---`);
  const summary2 = await main({ pageId, localOnly: true });
  console.log(
    `Run 2 summary: new=${summary2.newTranslations}, automated=${summary2.automatedTranslations}`
  );

  const verificationResults = await Promise.all(
    baselineState.map(async (state) => {
      const i18nSnapshotAfterRun2 = await snapshotFile(state.i18nPath);
      const automatedFileSnapshotsAfterRun2 =
        await snapshotAutomatedMarkdownFiles(
          state.automatedDir,
          canonicalRelativePath
        );
      const { newFiles, changedFiles } = describeAutomatedArtifactDelta(
        state.automatedFileSnapshotsBeforeRun2,
        automatedFileSnapshotsAfterRun2
      );
      const contentChanged =
        i18nSnapshotAfterRun2.hash !== state.i18nSnapshotBeforeRun2.hash ||
        i18nSnapshotAfterRun2.sizeBytes !==
          state.i18nSnapshotBeforeRun2.sizeBytes;
      const timestampChanged =
        i18nSnapshotAfterRun2.mtimeMs !== state.i18nSnapshotBeforeRun2.mtimeMs;

      return {
        ...state,
        newAutomatedFiles: newFiles,
        changedAutomatedFiles: changedFiles,
        automatedFileCountAfterRun2: automatedFileSnapshotsAfterRun2.size,
        contentChanged,
        timestampChanged,
      };
    })
  );

  console.log(`\n--- Verification Results ---`);
  verificationResults.forEach((result) => {
    console.log(`\n${result.language}`);
    console.log(`  i18n file: ${formatProjectPath(result.i18nPath)}`);
    console.log(
      `  i18n unchanged after run 2: ${!result.contentChanged && !result.timestampChanged}`
    );
    console.log(
      `  automated artifact outcome on run 2: ${formatAutomatedArtifactOutcome(result.newAutomatedFiles, result.changedAutomatedFiles)}`
    );
    console.log(
      `  total page-specific automated files after run 2: ${result.automatedFileCountAfterRun2}`
    );
    result.newAutomatedFiles.forEach((file) => {
      console.log(
        `    new: ${formatProjectPath(path.join(result.automatedDir, file))}`
      );
    });
    result.changedAutomatedFiles.forEach((file) => {
      console.log(
        `    changed-in-place: ${formatProjectPath(path.join(result.automatedDir, file))}`
      );
    });
  });

  const failures: string[] = [];
  for (const result of verificationResults) {
    if (result.contentChanged || result.timestampChanged) {
      failures.push(
        `${result.language}: baseline i18n file changed after run 2 (${formatProjectPath(result.i18nPath)})`
      );
    }

    if (result.newAutomatedFiles.length === 0) {
      const changedArtifactsHint =
        result.changedAutomatedFiles.length > 0
          ? ` (${result.changedAutomatedFiles.length} same-name artifact${result.changedAutomatedFiles.length === 1 ? " was" : "s were"} modified in place, which usually means both runs landed in the same minute window)`
          : "";
      failures.push(
        `${result.language}: no new page-specific automated file was created on run 2 for ${canonicalRelativePath}${changedArtifactsHint}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        "Page-specific no-overwrite verification failed:",
        ...failures.map((failure) => `  - ${failure}`),
      ].join("\n")
    );
  }

  console.log(
    `\nPage-specific no-overwrite behavior verified: run 2 created new automated artifacts for ${canonicalRelativePath} without touching the matching i18n files.`
  );
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Smoke test failed:", message);
  process.exit(1);
});
