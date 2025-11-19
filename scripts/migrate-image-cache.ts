#!/usr/bin/env bun
/**
 * Migration script: Convert monolithic image-cache.json to per-entry files
 *
 * This script migrates the old cache format (single JSON file with all entries)
 * to the new lazy-loading format (one file per entry in .cache/images/).
 *
 * Usage: bun run scripts/migrate-image-cache.ts
 *
 * The script is non-destructive - it keeps the original cache file.
 * Run with --delete-old to remove the old cache after successful migration.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import chalk from "chalk";

interface OldCacheEntry {
  url: string;
  localPath: string;
  timestamp: string;
  blockName: string;
  checksum?: string;
}

const OLD_CACHE_FILE = path.join(process.cwd(), "image-cache.json");
const NEW_CACHE_DIR = path.join(process.cwd(), ".cache", "images");

function hashUrl(url: string): string {
  return createHash("md5").update(url).digest("hex");
}

async function migrateCache(): Promise<void> {
  console.log(chalk.blue("🔄 Starting image cache migration..."));

  // Check if old cache exists
  if (!fs.existsSync(OLD_CACHE_FILE)) {
    console.log(
      chalk.yellow("⚠️  No old cache file found at image-cache.json")
    );
    console.log(
      chalk.gray(
        "   Nothing to migrate. The new lazy-loading cache will be used."
      )
    );
    return;
  }

  // Read old cache
  let oldCache: Record<string, OldCacheEntry>;
  try {
    const content = fs.readFileSync(OLD_CACHE_FILE, "utf-8");
    oldCache = JSON.parse(content);
  } catch (error) {
    console.error(chalk.red("❌ Failed to read old cache file:"), error);
    return;
  }

  const entries = Object.entries(oldCache);
  console.log(chalk.blue(`📦 Found ${entries.length} entries to migrate`));

  // Create new cache directory
  fs.mkdirSync(NEW_CACHE_DIR, { recursive: true });

  // Migrate each entry
  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [url, entry] of entries) {
    const hash = hashUrl(url);
    const cachePath = path.join(NEW_CACHE_DIR, `${hash}.json`);

    // Skip if already migrated
    if (fs.existsSync(cachePath)) {
      skippedCount++;
      continue;
    }

    try {
      fs.writeFileSync(cachePath, JSON.stringify(entry, null, 2));
      migratedCount++;
    } catch (error) {
      console.error(
        chalk.red(`   ❌ Failed to migrate entry for ${url}:`),
        error
      );
      errorCount++;
    }
  }

  // Report results
  console.log(chalk.green(`\n✅ Migration complete!`));
  console.log(chalk.blue(`   📊 Results:`));
  console.log(chalk.green(`      - Migrated: ${migratedCount} entries`));
  if (skippedCount > 0) {
    console.log(
      chalk.yellow(`      - Skipped (already exists): ${skippedCount} entries`)
    );
  }
  if (errorCount > 0) {
    console.log(chalk.red(`      - Errors: ${errorCount} entries`));
  }

  // Handle old cache file
  const deleteOld = process.argv.includes("--delete-old");
  if (deleteOld && errorCount === 0) {
    try {
      fs.unlinkSync(OLD_CACHE_FILE);
      console.log(
        chalk.green(`   🗑️  Deleted old cache file: ${OLD_CACHE_FILE}`)
      );
    } catch (error) {
      console.warn(
        chalk.yellow(`   ⚠️  Could not delete old cache file:`, error)
      );
    }
  } else if (!deleteOld) {
    console.log(
      chalk.gray(`\n   💡 Old cache file preserved at: ${OLD_CACHE_FILE}`)
    );
    console.log(
      chalk.gray(
        `      Run with --delete-old to remove it after verifying migration.`
      )
    );
  }
}

// Run migration
migrateCache().catch((error) => {
  console.error(chalk.red("Migration failed:"), error);
  process.exit(1);
});
