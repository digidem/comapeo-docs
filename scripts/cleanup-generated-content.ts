#!/usr/bin/env bun

/**
 * Cleanup Generated Content Script
 *
 * Safely removes all content generated from Notion, since Notion DB is the source of truth.
 * This allows for clean regeneration without conflicting with half-baked content.
 *
 * What this script cleans:
 * - docs/ directory (all generated markdown files)
 * - static/images/ directory (all downloaded images from Notion)
 * - i18n translations for generated content
 * - preview markdown files
 * - build artifacts (if they exist)
 *
 * What this script preserves:
 * - static/img/ (core Docusaurus assets)
 * - i18n/[lang]/code.json (UI translation strings)
 * - All configuration and source files
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";

const ROOT_DIR = process.cwd();

interface CleanupTarget {
  path: string;
  description: string;
  recursive?: boolean;
  preserveDirectory?: boolean;
}

const CLEANUP_TARGETS: CleanupTarget[] = [
  {
    path: "docs",
    description: "Generated documentation files",
    recursive: true,
    preserveDirectory: true,
  },
  {
    path: "static/images",
    description: "Downloaded images from Notion",
    recursive: true,
    preserveDirectory: true,
  },
  {
    path: "i18n/es/docusaurus-plugin-content-docs/current",
    description: "Spanish translations of generated content",
    recursive: true,
    preserveDirectory: false,
  },
  {
    path: "i18n/pt/docusaurus-plugin-content-docs/current",
    description: "Portuguese translations of generated content",
    recursive: true,
    preserveDirectory: false,
  },
  {
    path: "build",
    description: "Build artifacts",
    recursive: true,
    preserveDirectory: false,
  },
  {
    path: ".docusaurus",
    description: "Docusaurus cache",
    recursive: true,
    preserveDirectory: false,
  },
];

const PREVIEW_FILE_PATTERN = /^comapeo-docs-preview-\d+\.md$/;

function cleanupTarget(target: CleanupTarget): boolean {
  const fullPath = path.join(ROOT_DIR, target.path);

  try {
    if (!fs.existsSync(fullPath)) {
      console.log(chalk.gray(`⏭️  Skipped: ${target.path} (doesn't exist)`));
      return true;
    }

    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      if (target.recursive) {
        // Remove all contents but optionally preserve the directory
        const items = fs.readdirSync(fullPath);
        let removedCount = 0;

        for (const item of items) {
          const itemPath = path.join(fullPath, item);
          fs.rmSync(itemPath, { recursive: true, force: true });
          removedCount++;
        }

        if (!target.preserveDirectory) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }

        console.log(
          chalk.green(
            `✅ Cleaned: ${target.description} (${removedCount} items)`
          )
        );
      } else {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(chalk.green(`✅ Removed: ${target.description}`));
      }
    } else {
      fs.unlinkSync(fullPath);
      console.log(chalk.green(`✅ Removed: ${target.description}`));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Failed to clean ${target.path}:`), error);
    return false;
  }
}

function cleanupPreviewFiles(): boolean {
  try {
    const files = fs.readdirSync(ROOT_DIR);
    const previewFiles = files.filter((file) =>
      PREVIEW_FILE_PATTERN.test(file)
    );

    if (previewFiles.length === 0) {
      console.log(chalk.gray("⏭️  Skipped: No preview files found"));
      return true;
    }

    let removedCount = 0;
    for (const file of previewFiles) {
      fs.unlinkSync(path.join(ROOT_DIR, file));
      removedCount++;
    }

    console.log(
      chalk.green(`✅ Cleaned: Preview markdown files (${removedCount} files)`)
    );
    return true;
  } catch (error) {
    console.error(chalk.red("❌ Failed to clean preview files:"), error);
    return false;
  }
}

function verifyPreservation(): void {
  const PRESERVE_PATHS = [
    "static/img",
    "i18n/es/code.json",
    "i18n/pt/code.json",
    "src",
    "docusaurus.config.ts",
    "package.json",
  ];

  console.log(chalk.blue("\n🔍 Verifying preservation of core files:"));

  for (const preservePath of PRESERVE_PATHS) {
    const fullPath = path.join(ROOT_DIR, preservePath);
    if (fs.existsSync(fullPath)) {
      console.log(chalk.green(`✅ Preserved: ${preservePath}`));
    } else {
      console.log(
        chalk.yellow(`⚠️  Missing: ${preservePath} (may not exist yet)`)
      );
    }
  }
}

async function main() {
  console.log(chalk.blue.bold("🧹 Cleanup Generated Content Script"));
  console.log(
    chalk.blue(
      "📝 Since Notion DB is the source of truth, cleaning generated content for fresh regeneration...\n"
    )
  );

  // Confirm with user in non-CI environments
  if (!process.env.CI && !process.argv.includes("--force")) {
    console.log(
      chalk.yellow("⚠️  This will remove all generated content from Notion.")
    );
    console.log(
      chalk.yellow(
        "   Fresh content can be checked out from the content branch or generated via comapeo-content-pipeline.\n"
      )
    );

    // Simple confirmation for non-interactive environments
    const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm"));
    if (!confirmArg || confirmArg !== "--confirm=yes") {
      console.log(
        chalk.red(
          "❌ Please add --confirm=yes to proceed, or --force to skip confirmation"
        )
      );
      process.exit(1);
    }
  }

  console.log(chalk.blue("🎯 Starting cleanup...\n"));

  let successCount = 0;
  let totalTargets = CLEANUP_TARGETS.length + 1; // +1 for preview files

  // Clean up defined targets
  for (const target of CLEANUP_TARGETS) {
    if (cleanupTarget(target)) {
      successCount++;
    }
  }

  // Clean up preview files
  if (cleanupPreviewFiles()) {
    successCount++;
  }

  // Verify preservation
  verifyPreservation();

  // Summary
  console.log(chalk.blue("\n📊 Cleanup Summary:"));
  if (successCount === totalTargets) {
    console.log(
      chalk.green(
        `✅ Successfully cleaned ${successCount}/${totalTargets} targets`
      )
    );
    console.log(
      chalk.blue(
        "\n🚀 Content cleaned. Fresh content is loaded from the content branch."
      )
    );
    process.exit(0);
  } else {
    console.log(
      chalk.yellow(
        `⚠️  Cleaned ${successCount}/${totalTargets} targets (some failed)`
      )
    );
    console.log(
      chalk.red("❌ Some cleanup operations failed. Check the logs above.")
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
