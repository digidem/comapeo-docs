/**
 * Section processing utilities for Docusaurus content organization
 *
 * Handles:
 * - Toggle sections (collapsible categories)
 * - Title/Heading sections (metadata for next item)
 * - Section folder management
 */

import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import type SpinnerManager from "./spinnerManager";

/**
 * Category configuration for Docusaurus _category_.json
 */
export interface CategoryConfig {
  label: string;
  position: number;
  collapsible: boolean;
  collapsed: boolean;
  link: {
    type: string;
  };
  customProps: {
    title: string | null;
  };
}

/**
 * Creates a toggle section (collapsible category folder)
 *
 * Toggle sections become folders with _category_.json files in Docusaurus.
 * They can optionally carry a "title" from a previous heading section.
 *
 * @param page - Notion page record
 * @param filename - Safe filename for folder
 * @param safeFilename - Fallback filename if primary is empty
 * @param pageTitle - Page title for fallback
 * @param lang - Language code
 * @param i - Index for position
 * @param PATH - Target directory path
 * @param currentHeading - Map of current heading by language
 * @param pageSpinner - Spinner instance for progress updates
 * @returns Section folder name
 */
export function processToggleSection(
  page: Record<string, any>,
  filename: string,
  safeFilename: string,
  pageTitle: string,
  lang: string,
  i: number,
  PATH: string,
  currentHeading: Map<string, string>,
  pageSpinner: any
): string {
  const sectionName =
    page.properties?.["Title"]?.title?.[0]?.plain_text ?? pageTitle;
  if (!page.properties?.["Title"]?.title?.[0]?.plain_text) {
    console.warn(
      chalk.yellow(
        `Missing 'Title' property for toggle page ${page.id}; falling back to page title.`
      )
    );
  }
  const sectionFolder = filename || safeFilename;
  const sectionFolderPath = path.join(PATH, sectionFolder);
  fs.mkdirSync(sectionFolderPath, { recursive: true });
  pageSpinner.succeed(chalk.green(`Section folder created: ${sectionFolder}`));

  // Only create _category_.json for English (default locale)
  if (lang === "en") {
    const categoryContent: CategoryConfig = {
      label: sectionName,
      position: i + 1,
      collapsible: true,
      collapsed: true,
      link: {
        type: "generated-index",
      },
      customProps: { title: null },
    };

    // Apply pending heading title if exists
    if (currentHeading.get(lang)) {
      categoryContent.customProps.title = currentHeading.get(lang)!;
      currentHeading.set(lang, null);
    }

    const categoryFilePath = path.join(sectionFolderPath, "_category_.json");
    fs.writeFileSync(
      categoryFilePath,
      JSON.stringify(categoryContent, null, 2),
      "utf8"
    );
    pageSpinner.succeed(
      chalk.green(`added _category_.json to ${sectionFolder}`)
    );
  }

  return sectionFolder;
}

/**
 * Processes a heading/title section
 *
 * Heading sections don't create files themselves - they set metadata
 * that will be applied to the next page or toggle section.
 *
 * @param pageTitle - Title text
 * @param lang - Language code
 * @param currentHeading - Map of current heading by language
 * @param pageSpinner - Spinner instance for progress updates
 */
export function processHeadingSection(
  pageTitle: string,
  lang: string,
  currentHeading: Map<string, string>,
  pageSpinner: any
): void {
  currentHeading.set(lang, pageTitle);
  pageSpinner.succeed(
    chalk.green(
      `Title section detected: ${currentHeading.get(lang)}, will be applied to next item`
    )
  );
}
