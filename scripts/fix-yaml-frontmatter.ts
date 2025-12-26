#!/usr/bin/env bun

/**
 * Script to fix YAML frontmatter in markdown files by quoting special characters
 *
 * This script scans markdown files and quotes YAML frontmatter values that contain
 * special characters which can break YAML parsing (& : [ ] { } , | > * ! % @ ` # -)
 *
 * Usage:
 *   bun scripts/fix-yaml-frontmatter.ts [directory]
 *
 * Example:
 *   bun scripts/fix-yaml-frontmatter.ts docs/
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Check if a YAML value needs quoting
 * YAML special characters: & : [ ] { } , | > * ! % @ ` # - and quotes
 */
function needsQuoting(value: string): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Already quoted
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return false;
  }

  // Check for special characters
  return /[&:[\]{}|>*!%@`#-]|^\s|^['"]|['"]$/.test(value);
}

/**
 * Quote a YAML value if needed
 */
function quoteValue(value: string): string {
  if (!needsQuoting(value)) {
    return value;
  }

  // Use double quotes and escape any existing double quotes
  return `"${value.replace(/"/g, '\\"')}"`;
}

/**
 * Process a single markdown file
 */
function processMarkdownFile(filePath: string): {
  modified: boolean;
  error?: string;
} {
  try {
    const content = readFileSync(filePath, "utf-8");

    // Check if file has frontmatter
    if (!content.startsWith("---")) {
      return { modified: false };
    }

    // Extract frontmatter
    const endOfFrontmatter = content.indexOf("---", 3);
    if (endOfFrontmatter === -1) {
      return { modified: false };
    }

    const frontmatter = content.substring(3, endOfFrontmatter);
    const bodyContent = content.substring(endOfFrontmatter);

    // Process frontmatter line by line
    const lines = frontmatter.split("\n");
    let modified = false;
    const newLines = lines.map((line) => {
      // Match key: value patterns
      const match = line.match(/^(\s*)([\w_-]+):\s*(.+?)(\s*)$/);
      if (!match) {
        return line;
      }

      const [, indent, key, value, trailing] = match;

      // Fields that should be quoted
      const fieldsToCheck = [
        "title",
        "sidebar_label",
        "pagination_label",
        "description",
      ];

      // Check if this is a field we want to quote
      if (!fieldsToCheck.includes(key)) {
        // Check for nested fields like "title: ..." in sidebar_custom_props
        if (key === "title" && indent.length > 0) {
          // This is a nested title field
        } else {
          return line;
        }
      }

      const quotedValue = quoteValue(value.trim());
      if (quotedValue !== value.trim()) {
        modified = true;
        return `${indent}${key}: ${quotedValue}${trailing}`;
      }

      return line;
    });

    if (!modified) {
      return { modified: false };
    }

    // Write back the file
    const newContent = "---" + newLines.join("\n") + bodyContent;
    writeFileSync(filePath, newContent, "utf-8");

    return { modified: true };
  } catch (error) {
    return {
      modified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Recursively process all markdown files in a directory
 */
function processDirectory(
  dirPath: string
): { total: number; modified: number; errors: string[] } {
  const results = { total: 0, modified: 0, errors: [] as string[] };

  function walk(dir: string) {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
        results.total++;
        console.log(`Processing: ${fullPath}`);

        const result = processMarkdownFile(fullPath);

        if (result.error) {
          console.error(`  ❌ Error: ${result.error}`);
          results.errors.push(`${fullPath}: ${result.error}`);
        } else if (result.modified) {
          console.log(`  ✅ Fixed frontmatter`);
          results.modified++;
        } else {
          console.log(`  ⏭️  No changes needed`);
        }
      }
    }
  }

  walk(dirPath);
  return results;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const targetDir = args[0] || "docs";

  console.log(`\n🔍 Scanning markdown files in: ${targetDir}\n`);

  const results = processDirectory(targetDir);

  console.log(`\n📊 Summary:`);
  console.log(`   Total files: ${results.total}`);
  console.log(`   Modified: ${results.modified}`);
  console.log(`   Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors encountered:`);
    results.errors.forEach((error) => console.log(`   ${error}`));
    process.exit(1);
  }

  if (results.modified > 0) {
    console.log(
      `\n✅ Fixed ${results.modified} file(s) with frontmatter issues`
    );
    console.log(`   Review changes with: git diff`);
    console.log(`   Commit changes with: git add -A && git commit`);
  } else {
    console.log(`\n✨ All files have properly formatted frontmatter!`);
  }
}

main();
