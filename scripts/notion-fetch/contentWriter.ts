/**
 * Content writing utilities for Docusaurus markdown files
 *
 * Handles:
 * - Duplicate title removal from Notion exports
 * - Frontmatter addition
 * - File writing with placeholder generation
 * - Progress logging
 */

import fs from "node:fs";
import chalk from "chalk";

/**
 * Removes duplicate H1 heading if it matches the page title
 *
 * Notion exports often include an H1 heading that duplicates the page title.
 * This function removes it to avoid redundancy in Docusaurus.
 *
 * @param content - Markdown content
 * @param pageTitle - Page title from frontmatter
 * @returns Content with duplicate title removed
 */
export function removeDuplicateTitle(
  content: string,
  pageTitle: string
): string {
  // Find the first H1 heading pattern at the beginning of the content
  const firstH1Regex = /^\s*# (.+?)(?:\n|$)/;
  const firstH1Match = content.match(firstH1Regex);

  if (!firstH1Match) {
    return content;
  }

  const firstH1Text = firstH1Match[1].trim();
  // Check if this heading is similar to the page title (exact match or contains)
  if (
    firstH1Text === pageTitle ||
    pageTitle.includes(firstH1Text) ||
    firstH1Text.includes(pageTitle)
  ) {
    // Remove the duplicate heading
    let processedContent = content.replace(firstH1Match[0], "");

    // Also remove any empty lines at the beginning
    processedContent = processedContent.replace(/^\s+/, "");

    return processedContent;
  }

  return content;
}

/**
 * Writes markdown file with frontmatter
 *
 * @param filePath - Target file path
 * @param frontmatter - YAML frontmatter block
 * @param content - Markdown content body
 * @param pageTitle - Page title for logging
 * @param processedPages - Current page count
 * @param totalPages - Total page count
 * @param pageSpinner - Spinner instance
 * @param customProps - Custom properties to log
 * @param currentSectionFolder - Current section folder (if any)
 * @param lang - Language code
 */
export function writeMarkdownFile(
  filePath: string,
  frontmatter: string,
  content: string,
  pageTitle: string,
  processedPages: number,
  totalPages: number,
  pageSpinner: any,
  safeFilename: string,
  customProps: Record<string, unknown>,
  currentSectionFolder: Record<string, string>,
  lang: string
): void {
  const contentWithFrontmatter = frontmatter + content;
  fs.writeFileSync(filePath, contentWithFrontmatter, "utf8");

  pageSpinner.succeed(
    chalk.green(
      `Page ${processedPages + 1}/${totalPages} processed: ${filePath}`
    )
  );
  console.log(
    chalk.blue(
      `  ↳ Added frontmatter with id: doc-${safeFilename}, title: ${pageTitle}`
    )
  );

  // Log information about custom properties
  if (Object.keys(customProps).length > 0) {
    console.log(
      chalk.yellow(
        `  ↳ Added custom properties: ${JSON.stringify(customProps)}`
      )
    );
  }

  // Log information about section folder placement
  if (currentSectionFolder[lang]) {
    console.log(
      chalk.cyan(`  ↳ Placed in section folder: ${currentSectionFolder[lang]}`)
    );
  }
}

/**
 * Writes placeholder file when page has no content
 *
 * @param filePath - Target file path
 * @param frontmatter - YAML frontmatter block
 * @param pageId - Notion page ID
 * @param processedPages - Current page count
 * @param totalPages - Total page count
 * @param pageSpinner - Spinner instance
 */
export function writePlaceholderFile(
  filePath: string,
  frontmatter: string,
  pageId: string,
  processedPages: number,
  totalPages: number,
  pageSpinner: any
): void {
  const placeholderBody = `\n<!-- Placeholder content generated automatically because the Notion page is missing a Website Block. -->\n\n:::note\nContent placeholder – add blocks in Notion to replace this file.\n:::\n`;

  fs.writeFileSync(filePath, `${frontmatter}${placeholderBody}`, "utf8");

  pageSpinner.warn(
    chalk.yellow(
      `No 'Website Block' property found for page ${processedPages + 1}/${totalPages}: ${pageId}. Placeholder content generated.`
    )
  );
}
