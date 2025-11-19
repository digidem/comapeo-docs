import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * List of script files that affect the output content.
 * If any of these files change, a full rebuild is required.
 * Paths are relative to project root.
 */
export const CRITICAL_SCRIPT_FILES = [
  // Core pipeline
  "scripts/notion-fetch/generateBlocks.ts",
  "scripts/notion-fetch/runFetch.ts",
  "scripts/fetchNotionData.ts",

  // Content processing
  "scripts/notion-fetch/frontmatterBuilder.ts",
  "scripts/notion-fetch/contentWriter.ts",
  "scripts/notion-fetch/contentSanitizer.ts",
  "scripts/notion-fetch/markdownTransform.ts",
  "scripts/notion-fetch/calloutProcessor.ts",

  // Image processing
  "scripts/notion-fetch/imageReplacer.ts",
  "scripts/notion-fetch/imageProcessing.ts",
  "scripts/notion-fetch/imageCompressor.ts",
  "scripts/notion-fetch/imageProcessor.ts",
  "scripts/notion-fetch/imageValidation.ts",
  "scripts/notion-fetch/utils.ts",

  // Emoji processing
  "scripts/notion-fetch/emojiProcessor.ts",
  "scripts/notion-fetch/emojiDownload.ts",
  "scripts/notion-fetch/emojiExtraction.ts",
  "scripts/notion-fetch/emojiMapping.ts",
  "scripts/notion-fetch/emojiCache.ts",

  // Section/page handling
  "scripts/notion-fetch/sectionProcessors.ts",
  "scripts/notion-fetch/pageGrouping.ts",

  // Configuration
  "scripts/constants.ts",
  "scripts/notionClient.ts",
  "scripts/notionPageUtils.ts",
];

/**
 * Result of computing the script hash
 */
export interface ScriptHashResult {
  hash: string;
  filesHashed: number;
  missingFiles: string[];
  notionSdkVersion: string;
}

/**
 * Compute a SHA256 hash of all critical script files.
 * This hash changes when any file that affects output is modified.
 *
 * Also includes the @notionhq/client version from package.json
 * since SDK changes can affect output.
 */
export async function computeScriptHash(): Promise<ScriptHashResult> {
  const missingFiles: string[] = [];

  // Sort files for deterministic hash
  const sortedFiles = [...CRITICAL_SCRIPT_FILES].sort();

  // Read all files in parallel for better performance
  const fileReadPromises = sortedFiles.map(async (relativePath) => {
    const absolutePath = path.join(PROJECT_ROOT, relativePath);

    try {
      const content = await readFile(absolutePath, "utf-8");
      return { relativePath, content, success: true as const };
    } catch {
      // File might not exist (e.g., during development)
      return { relativePath, content: "", success: false as const };
    }
  });

  const fileResults = await Promise.all(fileReadPromises);

  // Build hash from results (must be in sorted order for determinism)
  const hasher = createHash("sha256");
  let filesHashed = 0;

  for (const result of fileResults) {
    if (result.success) {
      // Include file path in hash to detect renames
      hasher.update(result.relativePath);
      hasher.update(result.content);
      filesHashed++;
    } else {
      missingFiles.push(result.relativePath);
    }
  }

  // Include Notion SDK version
  let notionSdkVersion = "unknown";
  try {
    const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
    const packageJsonContent = await readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    notionSdkVersion =
      packageJson.dependencies?.["@notionhq/client"] ||
      packageJson.devDependencies?.["@notionhq/client"] ||
      "unknown";
    hasher.update(`notion-sdk:${notionSdkVersion}`);
  } catch {
    hasher.update("notion-sdk:unknown");
  }

  if (notionSdkVersion === "unknown") {
    console.warn(
      "Warning: Could not determine @notionhq/client version for hash computation"
    );
  }

  return {
    hash: hasher.digest("hex"),
    filesHashed,
    missingFiles,
    notionSdkVersion,
  };
}

/**
 * Check if a full rebuild is required due to script changes.
 *
 * @param currentHash - Hash computed from current script files
 * @param cachedHash - Hash stored in the page metadata cache
 * @returns true if scripts have changed and full rebuild is needed
 */
export function isScriptHashChanged(
  currentHash: string,
  cachedHash: string | undefined
): boolean {
  if (!cachedHash) {
    return true; // No cached hash means first run or corrupted cache
  }
  return currentHash !== cachedHash;
}

/**
 * Get a human-readable summary of script hash computation
 */
export function formatScriptHashSummary(result: ScriptHashResult): string {
  const lines: string[] = [];

  lines.push(`Script hash: ${result.hash.substring(0, 12)}...`);
  lines.push(
    `Files hashed: ${result.filesHashed}/${CRITICAL_SCRIPT_FILES.length}`
  );

  if (result.missingFiles.length > 0) {
    lines.push(`Missing files: ${result.missingFiles.join(", ")}`);
  }

  return lines.join("\n");
}
