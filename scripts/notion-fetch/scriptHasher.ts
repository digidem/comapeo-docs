import fs from "node:fs";
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
}

/**
 * Compute a SHA256 hash of all critical script files.
 * This hash changes when any file that affects output is modified.
 *
 * Also includes the @notionhq/client version from package.json
 * since SDK changes can affect output.
 */
export async function computeScriptHash(): Promise<ScriptHashResult> {
  const hasher = createHash("sha256");
  const missingFiles: string[] = [];
  let filesHashed = 0;

  // Sort files for deterministic hash
  const sortedFiles = [...CRITICAL_SCRIPT_FILES].sort();

  for (const relativePath of sortedFiles) {
    const absolutePath = path.join(PROJECT_ROOT, relativePath);

    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      // Include file path in hash to detect renames
      hasher.update(relativePath);
      hasher.update(content);
      filesHashed++;
    } catch (error) {
      // File might not exist (e.g., during development)
      missingFiles.push(relativePath);
    }
  }

  // Include Notion SDK version
  try {
    const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const notionVersion =
      packageJson.dependencies?.["@notionhq/client"] ||
      packageJson.devDependencies?.["@notionhq/client"] ||
      "unknown";
    hasher.update(`notion-sdk:${notionVersion}`);
  } catch {
    hasher.update("notion-sdk:unknown");
  }

  return {
    hash: hasher.digest("hex"),
    filesHashed,
    missingFiles,
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
