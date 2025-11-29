import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import {
  loadPageMetadataCache,
  getCacheStats,
  type PageMetadataCache,
} from "./pageMetadataCache";
import { computeScriptHash } from "./scriptHasher";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DOCS_PATH = path.join(PROJECT_ROOT, "docs");

export interface CacheValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  stats: {
    totalPages: number;
    missingFiles: number;
    orphanedFiles: number;
    scriptHashMatch: boolean;
  };
}

/**
 * Validate the page metadata cache and check for inconsistencies.
 * This helps diagnose issues with incremental sync.
 *
 * IMPORTANT: Run this when no fetch operations are in progress.
 * Concurrent fetch operations may cause inaccurate results as files
 * and cache are being modified during validation.
 *
 * Safe to run:
 * - After a fetch completes
 * - Before starting a fetch
 * - When investigating cache issues
 *
 * Not recommended:
 * - While `notion:fetch-all` is running
 * - During CI/CD builds with concurrent jobs
 */
export async function validateCache(
  options: { verbose?: boolean } = {}
): Promise<CacheValidationResult> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const { verbose = false } = options;

  console.log(chalk.bold("\n🔍 Validating Page Metadata Cache...\n"));

  // Load cache
  const cache = loadPageMetadataCache();

  if (!cache) {
    issues.push("No cache found (this is OK for first run)");
    return {
      valid: false,
      issues,
      warnings,
      stats: {
        totalPages: 0,
        missingFiles: 0,
        orphanedFiles: 0,
        scriptHashMatch: false,
      },
    };
  }

  const stats = getCacheStats(cache);
  console.log(chalk.blue(`📊 Cache contains ${stats.totalPages} pages`));
  if (stats.lastSync) {
    console.log(chalk.gray(`   Last sync: ${stats.lastSync}`));
  }

  let missingFilesCount = 0;
  let orphanedFilesCount = 0;

  // Helper function to normalize paths for consistent comparison
  // Converts backslashes to forward slashes and removes leading slashes
  const normalizePath = (p: string): string => {
    return path.normalize(p).replace(/\\/g, "/").replace(/^\//, "");
  };

  // Check 1: Verify output files exist
  console.log(chalk.bold("\n1️⃣  Checking output files exist..."));
  const cachedPaths = new Set<string>();

  for (const [pageId, metadata] of Object.entries(cache.pages)) {
    for (const outputPath of metadata.outputPaths) {
      if (!outputPath) {
        warnings.push(
          `Page ${pageId} has empty output path in cache.outputPaths`
        );
        continue;
      }

      // Store normalized path for comparison
      cachedPaths.add(normalizePath(outputPath));

      const absolutePath = path.isAbsolute(outputPath)
        ? outputPath
        : path.join(PROJECT_ROOT, outputPath.replace(/^\//, ""));

      if (!fs.existsSync(absolutePath)) {
        issues.push(`Missing output file for page ${pageId}: ${outputPath}`);
        missingFilesCount++;
        if (verbose) {
          console.log(chalk.red(`   ❌ Missing: ${outputPath}`));
        }
      } else if (verbose) {
        console.log(chalk.green(`   ✓ Found: ${outputPath}`));
      }
    }
  }

  if (missingFilesCount === 0) {
    console.log(
      chalk.green(`   ✅ All ${cachedPaths.size} cached files exist`)
    );
  } else {
    console.log(
      chalk.red(`   ❌ ${missingFilesCount} cached files are missing`)
    );
  }

  // Check 2: Find orphaned output files (files in docs/ not in cache)
  console.log(chalk.bold("\n2️⃣  Checking for orphaned files..."));

  const orphanedFiles: string[] = [];

  try {
    const scanDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(PROJECT_ROOT, fullPath);

        if (entry.isDirectory()) {
          // Skip node_modules, .git, etc
          if (![".git", "node_modules", ".cache"].includes(entry.name)) {
            scanDirectory(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          // Check if this markdown file is in our cache
          // Use same normalization as when adding to cachedPaths
          const normalizedPath = normalizePath(relativePath);

          if (!cachedPaths.has(normalizedPath)) {
            orphanedFiles.push(normalizedPath);
            orphanedFilesCount++;
            if (verbose) {
              console.log(chalk.yellow(`   ⚠️  Orphaned: ${normalizedPath}`));
            }
          }
        }
      }
    };

    if (fs.existsSync(DOCS_PATH)) {
      scanDirectory(DOCS_PATH);
    }

    if (orphanedFilesCount === 0) {
      console.log(chalk.green("   ✅ No orphaned files found"));
    } else {
      console.log(
        chalk.yellow(
          `   ⚠️  Found ${orphanedFilesCount} markdown files not in cache`
        )
      );
      warnings.push(
        `${orphanedFilesCount} markdown files in docs/ are not tracked in cache (might be manually created or from old runs)`
      );
    }
  } catch (error) {
    warnings.push(
      `Could not scan docs directory: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Check 3: Verify script hash is current
  console.log(chalk.bold("\n3️⃣  Checking script hash..."));

  const currentHashResult = await computeScriptHash();
  const currentHash = currentHashResult.hash;
  const scriptHashMatch = cache.scriptHash === currentHash;

  if (scriptHashMatch) {
    console.log(chalk.green("   ✅ Script hash matches (scripts unchanged)"));
    console.log(chalk.gray(`      Hash: ${currentHash.substring(0, 12)}...`));
  } else {
    console.log(chalk.yellow("   ⚠️  Script hash mismatch"));
    console.log(
      chalk.gray(`      Cached:  ${cache.scriptHash.substring(0, 12)}...`)
    );
    console.log(
      chalk.gray(`      Current: ${currentHash.substring(0, 12)}...`)
    );
    warnings.push(
      "Script files have changed since last sync - next run will do full rebuild"
    );
  }

  // Summary
  console.log(chalk.bold("\n📋 Validation Summary:"));

  const valid = issues.length === 0;

  if (valid) {
    console.log(chalk.green("✅ Cache is valid"));
  } else {
    console.log(chalk.red(`❌ Found ${issues.length} issue(s)`));
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow(`⚠️  ${warnings.length} warning(s)`));
  }

  return {
    valid,
    issues,
    warnings,
    stats: {
      totalPages: stats.totalPages,
      missingFiles: missingFilesCount,
      orphanedFiles: orphanedFilesCount,
      scriptHashMatch,
    },
  };
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const verbose =
    process.argv.includes("--verbose") || process.argv.includes("-v");

  validateCache({ verbose })
    .then((result) => {
      console.log();

      if (result.issues.length > 0) {
        console.log(chalk.bold.red("\n🔴 Issues Found:"));
        result.issues.forEach((issue, i) => {
          console.log(chalk.red(`${i + 1}. ${issue}`));
        });
      }

      if (result.warnings.length > 0) {
        console.log(chalk.bold.yellow("\n⚠️  Warnings:"));
        result.warnings.forEach((warning, i) => {
          console.log(chalk.yellow(`${i + 1}. ${warning}`));
        });
      }

      console.log(chalk.bold("\n📊 Statistics:"));
      console.log(`   Total pages in cache: ${result.stats.totalPages}`);
      console.log(`   Missing output files: ${result.stats.missingFiles}`);
      console.log(`   Orphaned markdown files: ${result.stats.orphanedFiles}`);
      console.log(
        `   Script hash match: ${result.stats.scriptHashMatch ? "✅ Yes" : "⚠️  No"}`
      );

      process.exit(result.valid ? 0 : 1);
    })
    .catch((error) => {
      console.error(chalk.red("\n❌ Validation failed:"));
      console.error(error);
      process.exit(1);
    });
}
