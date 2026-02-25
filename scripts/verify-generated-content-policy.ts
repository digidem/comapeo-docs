#!/usr/bin/env bun

// Verify Generated Content Policy Compliance
//
// Checks that files in generated-content directories are not committed to git,
// as these are populated from the content branch or generated from Notion API.
//
// According to .gitignore:
// - /docs/ (generated content, synced from content branch)
// - /i18n/ (generated content, synced from content branch)
// - /static/images/ (generated content, synced from content branch)
//
// Exceptions:
// - .gitkeep files are allowed for directory structure
// - i18n/*/code.json files are UI translation strings (allowed)
//
// Exits with code 1 if policy violations are found.

// eslint-disable-next-line import/no-unresolved
import { $ } from "bun";
import path from "node:path";

interface PolicyViolation {
  file: string;
  reason: string;
}

interface PolicyCheckResult {
  directory: string;
  isCompliant: boolean;
  violations: PolicyViolation[];
}

const GENERATED_DIRECTORIES = [
  {
    path: "docs",
    description: "Generated documentation files",
    allowedPatterns: [
      /\.gitkeep$/,
      /^docs\/developer-tools\/.*/, // Hand-crafted developer documentation
    ],
  },
  {
    path: "i18n",
    description: "Generated translations",
    allowedPatterns: [
      /\.gitkeep$/,
      /\/code\.json$/, // UI translation strings are allowed
    ],
  },
  {
    path: "static/images",
    description: "Downloaded images from Notion",
    allowedPatterns: [/\.gitkeep$/, /\.emoji-cache\.json$/],
  },
];

async function getTrackedFilesInDirectory(dirPath: string): Promise<string[]> {
  try {
    const result = await $`git ls-files ${dirPath}`.quiet();
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout.toString().trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function isAllowedFile(filePath: string, allowedPatterns: RegExp[]): boolean {
  return allowedPatterns.some((pattern) => pattern.test(filePath));
}

async function checkDirectoryPolicy(
  dirPath: string,
  description: string,
  allowedPatterns: RegExp[]
): Promise<PolicyCheckResult> {
  const trackedFiles = await getTrackedFilesInDirectory(dirPath);
  const violations: PolicyViolation[] = [];

  for (const file of trackedFiles) {
    if (!isAllowedFile(file, allowedPatterns)) {
      violations.push({
        file,
        reason: `File in generated directory should not be committed`,
      });
    }
  }

  return {
    directory: dirPath,
    isCompliant: violations.length === 0,
    violations,
  };
}

async function main() {
  console.log("🔍 Verifying Generated Content Policy Compliance\n");

  let hasViolations = false;
  const results: PolicyCheckResult[] = [];

  for (const dir of GENERATED_DIRECTORIES) {
    const result = await checkDirectoryPolicy(
      dir.path,
      dir.description,
      dir.allowedPatterns
    );
    results.push(result);

    if (!result.isCompliant) {
      hasViolations = true;
      console.log(`❌ ${dir.path} - Policy violations found:`);
      for (const violation of result.violations) {
        console.log(`   - ${violation.file}`);
        console.log(`     Reason: ${violation.reason}\n`);
      }
    } else {
      console.log(`✅ ${dir.path} - Compliant`);
    }
  }

  // Summary
  console.log("\n📊 Summary:");
  const compliantCount = results.filter((r) => r.isCompliant).length;
  console.log(
    `Compliant: ${compliantCount}/${results.length} directories checked`
  );

  if (hasViolations) {
    console.log("\n⚠️  Policy violations detected!");
    console.log(
      "\nTo fix violations, remove tracked files from generated directories:"
    );
    console.log("  git rm --cached -r docs/ i18n/ static/images/");
    console.log(
      "\nNote: These directories should be populated from the content branch"
    );
    console.log("or generated from Notion API, not committed to git.\n");

    process.exit(1);
  }

  console.log("\n✅ All generated content policies are compliant!\n");
  process.exit(0);
}

if (import.meta.main) {
  await main();
}
