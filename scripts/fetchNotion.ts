import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fetchNotionData, fetchNotionDataByLanguage } from './fetchNotionData.js';
import { generateBlocks } from './generateBlocks.js';
import { n2m } from './notionClient.js';
import { LANGUAGES, NOTION_PROPERTIES, NotionPage } from './constants.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Saves content to the output directory
 * @param page The Notion page
 * @param content The markdown content
 * @param outputDir The output directory
 * @param translatedFilename Optional translated filename to use instead of the original
 * @returns The path to the saved file
 */
async function saveContent(page: NotionPage, content: string, outputDir: string, translatedFilename?: string): Promise<string> {
  try {
    // Create a sanitized filename from the title
    // @ts-expect-error - We know the property structure
    const title = page.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;
    const filename = translatedFilename || title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') + '.md';

    // Determine the output path
    const outputPath = path.join(outputDir, filename);

    // Handle section folders
    // @ts-expect-error - We know the property structure
    if (page.properties[NOTION_PROPERTIES.SECTION] && page.properties[NOTION_PROPERTIES.SECTION].select) {
      // @ts-expect-error - We know the property structure
      const sectionType = page.properties[NOTION_PROPERTIES.SECTION].select.name.toLowerCase();

      if (sectionType === 'toggle') {
        // For toggle sections, create a folder with the same name
        const sectionFolder = title
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        const sectionPath = path.join(outputDir, sectionFolder);
        await fs.mkdir(sectionPath, { recursive: true });

        // Create _category_.json file
        const categoryContent = {
          label: title,
          // @ts-expect-error - We know the property structure
          position: page.properties[NOTION_PROPERTIES.ORDER]?.number || 1,
          collapsible: true,
          collapsed: true,
          link: {
            type: "generated-index"
          },
          customProps: {
            title: title
          }
        };

        await fs.writeFile(
          path.join(sectionPath, '_category_.json'),
          JSON.stringify(categoryContent, null, 2),
          'utf8'
        );
      }
    }

    // Create the output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    // Write the content to the file
    await fs.writeFile(outputPath, content, 'utf8');
    console.log(chalk.green(`✓ Saved ${outputPath}`));

    return outputPath;
  } catch (error) {
    console.error(chalk.red(`Error saving content: ${error.message}`));
    throw error;
  }
}

/**
 * Process a single Notion page
 * @param page The Notion page
 * @param outputDir The output directory
 */
async function processPage(page: NotionPage, outputDir: string) {
  try {
    // @ts-expect-error - We know the property structure
    const title = page.properties[NOTION_PROPERTIES.TITLE].title[0].plain_text;
    console.log(chalk.blue(`Processing: ${title}`));

    // Convert the page to markdown
    const mdBlocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdBlocks);

    // Extract the translated title from the first H1 heading if available
    let translatedTitle = title;
    const h1Match = mdString.parent.match(/^\s*#\s+(.+?)\s*$/m);
    if (h1Match && h1Match[1]) {
      translatedTitle = h1Match[1].trim();
      console.log(chalk.yellow(`  ↳ Found translated title: ${translatedTitle}`));
    }

    // Create sanitized filenames/ids from both original and translated titles
    const originalWebsiteBlock = title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Use the translated title for the filename
    const translatedWebsiteBlock = translatedTitle
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Use the original title for the ID (for consistency with references)
    const websiteBlock = originalWebsiteBlock;

    // Extract metadata from the page
    let sidebarPosition = 1;
    const keywords: string[] = [];
    const tags: string[] = [];
    const customProps: Record<string, string> = {};

    // Check for Keywords property
    // @ts-expect-error - We know the property structure
    if (page.properties.Keywords?.multi_select && page.properties.Keywords.multi_select.length > 0) {
      // @ts-expect-error - We know the property structure
      keywords.push(...page.properties.Keywords.multi_select.map((keyword: { name: string }) => keyword.name));
    }

    // Check for Position/Order property
    // @ts-expect-error - We know the property structure
    if (page.properties[NOTION_PROPERTIES.ORDER]?.number) {
      // @ts-expect-error - We know the property structure
      sidebarPosition = page.properties[NOTION_PROPERTIES.ORDER].number;
    }

    // Check for Icon property
    // @ts-expect-error - We know the property structure
    if (page.properties['Icon']?.rich_text && page.properties['Icon'].rich_text.length > 0) {
      // @ts-expect-error - We know the property structure
      customProps.icon = page.properties['Icon'].rich_text[0].plain_text;
    }

    // Check for Section property to determine if it should be in a folder
    const translatedFilename = `${translatedWebsiteBlock}.md`;
    let relativePath = `${websiteBlock}.md`;
    // @ts-expect-error - We know the property structure
    if (page.properties[NOTION_PROPERTIES.SECTION]?.select?.name === 'toggle') {
      // Get the section folder name from the title
      const sectionFolder = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      relativePath = `${sectionFolder}/${websiteBlock}.md`;
    }

    // Generate frontmatter
    const frontmatter = `---
id: doc-${websiteBlock}
title: ${translatedTitle}
sidebar_label: ${translatedTitle}
sidebar_position: ${sidebarPosition}
pagination_label: ${translatedTitle}
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/${relativePath}
keywords:
${keywords.map(k => `  - ${k}`).join('\n')}
tags: [${tags.join(', ')}]
slug: /${websiteBlock}
last_update:
  date: ${new Date().toLocaleDateString('en-US')}
  author: Awana Digital
`;

    // Add customProps to frontmatter if they exist
    let completeFrontmatter = frontmatter;
    if (Object.keys(customProps).length > 0) {
      completeFrontmatter += `sidebar_custom_props:\n`;
      for (const [key, value] of Object.entries(customProps)) {
        // For emoji icons or titles with special characters, wrap in quotes
        if (typeof value === 'string' && (value.includes('"') || value.includes("'") || /[^\x20-\x7E]/.test(value))) {
          // If the value contains double quotes, use single quotes; otherwise use double quotes
          const quoteChar = value.includes('"') ? "'" : '"';
          completeFrontmatter += `  ${key}: ${quoteChar}${value}${quoteChar}\n`;
        } else {
          completeFrontmatter += `  ${key}: ${value}\n`;
        }
      }
    }

    // Close the frontmatter
    completeFrontmatter += `---\n\n`;

    // Add frontmatter to the markdown content
    const contentWithFrontmatter = completeFrontmatter + mdString.parent;

    // Save the content with the translated filename
    await saveContent(page, contentWithFrontmatter, outputDir, translatedFilename);
    console.log(chalk.green(`  ↳ Added frontmatter with id: doc-${websiteBlock}, title: ${translatedTitle}, filename: ${translatedFilename}`));
  } catch (error) {
    // @ts-expect-error - We know the property structure
    const title = page.properties[NOTION_PROPERTIES.TITLE]?.title[0]?.plain_text || page.id;
    console.error(chalk.red(`Error processing ${title}: ${error.message}`));
  }
}

async function main() {
  console.log(chalk.bold.cyan('🚀 Starting Notion data fetch and processing\n'));

  try {
    // 1. Process English pages first
    const fetchSpinner = ora('Fetching data from Notion').start();
    let englishData = await fetchNotionData();

    // Sort data by Order property if available to ensure proper sequencing
    englishData = englishData.sort((a, b) => {
      // @ts-expect-error - We know the property structure
      const orderA = a.properties[NOTION_PROPERTIES.ORDER]?.number ?? Number.MAX_SAFE_INTEGER;
      // @ts-expect-error - We know the property structure
      const orderB = b.properties[NOTION_PROPERTIES.ORDER]?.number ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });

    fetchSpinner.succeed(chalk.green(`Fetched ${englishData.length} English pages successfully`));

    // Generate English blocks
    const generateSpinner = ora('Generating English blocks').start();
    const { totalSaved, sectionCount, titleSectionCount } = await generateBlocks(englishData, (progress: { current: number, total: number, title: string }) => {
      generateSpinner.text = chalk.blue(`Generating blocks: ${progress.current}/${progress.total} - ${progress.title}`);
    });
    generateSpinner.succeed(chalk.green('English blocks generated successfully'));

    // 2. Process other languages
    for (const langConfig of LANGUAGES) {
      console.log(chalk.cyan(`\nProcessing ${langConfig.notionLangCode} translations:`));

      // Fetch pages for this language
      const langPages = await fetchNotionDataByLanguage(langConfig.notionLangCode);

      if (langPages.length > 0) {
        // Sort by Order property
        const sortedLangPages = langPages.sort((a, b) => {
          // @ts-expect-error - We know the property structure
          const orderA = a.properties[NOTION_PROPERTIES.ORDER]?.number ?? Number.MAX_SAFE_INTEGER;
          // @ts-expect-error - We know the property structure
          const orderB = b.properties[NOTION_PROPERTIES.ORDER]?.number ?? Number.MAX_SAFE_INTEGER;
          return orderA - orderB;
        });

        // Process each page
        for (const page of sortedLangPages) {
          await processPage(page as NotionPage, langConfig.outputDir);
        }
      } else {
        console.log(chalk.yellow(`No published pages found in Notion for ${langConfig.notionLangCode}. Checking local files...`));

        // Check if we have translated files in the filesystem
        try {
          const translatedDir = langConfig.outputDir;
          const files = await fs.readdir(translatedDir);

          for (const file of files) {
            // Skip directories and non-markdown files
            const filePath = path.join(translatedDir, file);
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
              continue; // Skip directories
            }

            if (!file.endsWith('.md')) {
              continue; // Skip non-markdown files
            }

            // Read the file content
            const content = await fs.readFile(filePath, 'utf8');

            // Extract the title from the first H1 heading
            const h1Match = content.match(/^\s*#\s+(.+?)\s*$/m);
            let translatedTitle = file.replace(/\.md$/, '');

            if (h1Match && h1Match[1]) {
              translatedTitle = h1Match[1].trim();
              console.log(chalk.yellow(`  ↳ Found translated title in ${file}: ${translatedTitle}`));
            }

            // Create sanitized filenames/ids from both original and translated titles
            const originalWebsiteBlock = file.replace(/\.md$/, '')
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '');

            // Use the translated title for the filename
            const translatedWebsiteBlock = translatedTitle
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '');

            // Use the original title for the ID (for consistency with references)
            const websiteBlock = originalWebsiteBlock;

            // Create the translated filename
            const translatedFilename = `${translatedWebsiteBlock}.md`;

            // Generate frontmatter
            const frontmatter = `---
id: doc-${websiteBlock}
title: ${translatedTitle}
sidebar_label: ${translatedTitle}
sidebar_position: 1
pagination_label: ${translatedTitle}
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/i18n/${langConfig.language}/docusaurus-plugin-content-docs/current/${translatedFilename}
keywords:

tags: []
slug: /${websiteBlock}
last_update:
  date: ${new Date().toLocaleDateString('en-US')}
  author: Awana Digital
---

`;

            // Remove any existing frontmatter
            let contentWithoutFrontmatter = content;
            const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/m);
            if (frontmatterMatch) {
              contentWithoutFrontmatter = content.replace(frontmatterMatch[0], '');
            }

            // Add new frontmatter
            const newContent = frontmatter + contentWithoutFrontmatter;

            // Create the new file path with the translated filename
            const newFilePath = path.join(translatedDir, translatedFilename);

            // Check if we need to rename the file
            if (filePath !== newFilePath && file !== translatedFilename) {
              // Write to the new file
              await fs.writeFile(newFilePath, newContent, 'utf8');
              console.log(chalk.green(`  ↳ Created new file ${translatedFilename} with title: ${translatedTitle}`));

              // Remove the old file if it's different
              await fs.unlink(filePath);
              console.log(chalk.yellow(`  ↳ Removed old file ${file}`));
            } else {
              // Just update the existing file
              await fs.writeFile(filePath, newContent, 'utf8');
              console.log(chalk.green(`  ↳ Updated frontmatter in ${file} with title: ${translatedTitle}`));
            }
          }
        } catch (error) {
          console.error(chalk.red(`Error processing local files for ${langConfig.notionLangCode}: ${error.message}`));
        }
      }
    }

    console.log(chalk.bold.green('\n✨ All tasks completed successfully!'));
    console.log(chalk.bold.cyan(`A total of ${(totalSaved / 1024).toFixed(2)} KB was saved on image compression.`));
    console.log(chalk.bold.yellow(`Created ${sectionCount} section folders with _category_.json files.`));
    console.log(chalk.bold.magenta(`Applied ${titleSectionCount} title sections to content items.`));
  } catch (error) {
    console.error(chalk.bold.red("\n❌ Error updating files:"), error);
  }
}

main();
