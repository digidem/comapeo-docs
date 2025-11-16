import { NOTION_PROPERTIES } from "../constants";

/**
 * Helper function to safely quote YAML values that contain special characters
 * YAML special characters that need quoting: & : [ ] { } , | > * ! % @ ` # - and quotes
 */
export const quoteYamlValue = (value: string): string => {
  if (!value || typeof value !== "string") {
    return "";
  }

  // Check if the value contains any YAML special characters that require quoting
  const needsQuoting = /[&:[\]{}|>*!%@`#"\-]|^\s|^['"]|['"]$/.test(value);

  if (needsQuoting) {
    // Use double quotes and escape any existing double quotes
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return value;
};

/**
 * Extracts published date from Notion page properties with enhanced error handling
 *
 * @param page - The Notion page object containing properties and metadata
 * @returns A formatted date string in en-US locale format (MM/DD/YYYY)
 *
 * Fallback strategy:
 * 1. Use Published date field if available and valid
 * 2. Fall back to last_edited_time if Published date is missing/invalid
 * 3. Final fallback to current date
 */
export function getPublishedDate(page: any): string {
  // Try to get the new Published date field
  const publishedDateProp = page.properties?.[NOTION_PROPERTIES.PUBLISHED_DATE];

  if (publishedDateProp?.date?.start) {
    try {
      // Parse the date string as a local date to avoid timezone issues
      const dateString = publishedDateProp.date.start;
      const [year, month, day] = dateString.split("-").map(Number);

      // Create date in local timezone to avoid UTC conversion issues
      const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor

      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US");
      } else {
        console.warn(
          `Invalid published date format for page ${page.id}, falling back to last_edited_time`
        );
      }
    } catch (error: any) {
      console.warn(
        `Error parsing published date for page ${page.id}:`,
        error?.message ?? String(error)
      );
    }
  }

  // Fall back to last_edited_time if Published date is not available or invalid
  if (page.last_edited_time) {
    try {
      const date = new Date(page.last_edited_time);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US");
      } else {
        console.warn(
          `Invalid last_edited_time format for page ${page.id}, using current date`
        );
      }
    } catch (error: any) {
      console.warn(
        `Error parsing last_edited_time for page ${page.id}:`,
        error?.message ?? String(error)
      );
    }
  }

  // Final fallback to current date
  return new Date().toLocaleDateString("en-US");
}

/**
 * Builds YAML frontmatter for a Docusaurus page
 *
 * @param pageTitle - The title of the page
 * @param sidebarPosition - Position in the sidebar
 * @param tags - Array of tags for the page
 * @param keywords - Array of SEO keywords
 * @param customProps - Custom properties to add to sidebar_custom_props
 * @param relativePath - Relative path to the document for edit URL
 * @param safeSlug - URL-safe slug for the page
 * @param page - The raw Notion page object (for published date)
 * @returns Complete YAML frontmatter string with --- delimiters
 */
export const buildFrontmatter = (
  pageTitle: string,
  sidebarPosition: number,
  tags: string[],
  keywords: string[],
  customProps: Record<string, unknown>,
  relativePath: string,
  safeSlug: string,
  page: any
): string => {
  // Quote the title to handle special characters like & : etc.
  const quotedTitle = quoteYamlValue(pageTitle);

  // Quote keywords and tags to prevent YAML parsing errors
  const quotedKeywords = keywords.map((k) => quoteYamlValue(k));
  const quotedTags = tags.map((t) => quoteYamlValue(t));

  let frontmatter = `---
id: doc-${safeSlug}
title: ${quotedTitle}
sidebar_label: ${quotedTitle}
sidebar_position: ${sidebarPosition}
pagination_label: ${quotedTitle}
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/${relativePath}
keywords:
${quotedKeywords.map((k) => `  - ${k}`).join("\n")}
tags: [${quotedTags.join(", ")}]
slug: /${safeSlug}
last_update:
  date: ${getPublishedDate(page)}
  author: Awana Digital`;

  if (Object.keys(customProps).length > 0) {
    frontmatter += `\nsidebar_custom_props:`;
    for (const [key, value] of Object.entries(customProps)) {
      if (
        typeof value === "string" &&
        (value.includes('"') ||
          value.includes("'") ||
          /[^\x20-\x7E]/.test(value))
      ) {
        const quoteChar = value.includes('"') ? "'" : '"';
        frontmatter += `\n  ${key}: ${quoteChar}${value}${quoteChar}`;
      } else {
        frontmatter += `\n  ${key}: ${value}`;
      }
    }
  }

  frontmatter += `\n---\n`;
  return frontmatter;
};
