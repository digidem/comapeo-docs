import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'node:url';
import { n2m } from './notionClient.js';
import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import { processImage } from './imageProcessor.js';
import { compressImage } from './imageCompressor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_PATH = path.join(__dirname, "../docs");
const IMAGES_PATH = path.join(CONTENT_PATH, "../static/images/");

// Ensure directories exist without deleting existing content
if (!fs.existsSync(CONTENT_PATH)) {
  fs.mkdirSync(CONTENT_PATH, { recursive: true });
}

if (!fs.existsSync(IMAGES_PATH)) {
  fs.mkdirSync(IMAGES_PATH, { recursive: true });
}

async function downloadAndProcessImage(url, blockName, index) {
  const spinner = ora(`Processing image ${index + 1}`).start();
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    // Remove query parameters from the URL
    const cleanUrl = url.split('?')[0];

    // Get the file extension, defaulting to .jpg if not present
    const extension = path.extname(cleanUrl).toLowerCase() || '.jpg';

    // Create a short, sanitized filename
    const sanitizedBlockName = blockName.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
    const filename = `${sanitizedBlockName}_${index}${extension}`;

    const filepath = path.join(IMAGES_PATH, filename);

    spinner.text = `Processing image ${index + 1}: Resizing`;
    const { outputBuffer: resizedBuffer, originalSize } = await processImage(buffer, filepath);

    spinner.text = `Processing image ${index + 1}: Compressing`;
    const { compressedBuffer, compressedSize } = await compressImage(resizedBuffer, filepath);

    // Save the processed and compressed image
    fs.writeFileSync(filepath, compressedBuffer);
    spinner.succeed(chalk.green(`Image ${index + 1} processed and saved: ${filepath}`));

    const savedBytes = originalSize - compressedSize;
    const imagePath = `/images/${filename.replace(/\\/g, '/')}`;
    return { newPath: imagePath, savedBytes };
  } catch (error) {
    spinner.fail(chalk.red(`Error processing image ${index + 1} from ${url}`));
    console.error(error);
    return { newPath: url, savedBytes: 0 };
  }
}

export async function generateBlocks(data, progressCallback) {
  const totalPages = data.length;
  let totalSaved = 0;

  // Variables to track section folders and title metadata
  let currentSectionFolder = null;
  let nextItemTitle = null;

  // Stats for reporting
  let sectionCount = 0;
  let titleSectionCount = 0;

  // Data is already sorted by Order property in fetchNotion.ts

  for (let i = 0; i < totalPages; i++) {
    const page = data[i];
    console.log(chalk.blue(`Processing page: ${page.id}, ${page.properties['Title'].title[0].plain_text}`));
    const pageSpinner = ora(`Processing page ${i + 1}/${totalPages}`).start();
    const websiteBlock = page.properties['Title'].title[0].plain_text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    try {
      // Check if page has a Section property
      if (page.properties['Section'] && page.properties['Section'].select) {
        const sectionType = page.properties['Section'].select.name.toLowerCase();
        if (sectionType === 'toggle') {
          // A toggle section creates a folder and applies to all subsequent items until a new Section is encountered
          const sectionTitle = page.properties['Title'].title[0].plain_text;
          const sectionFolder = websiteBlock;
          const sectionFolderPath = path.join(CONTENT_PATH, sectionFolder);
          fs.mkdirSync(sectionFolderPath, { recursive: true });

          // Update the current section folder so that subsequent items are placed here
          currentSectionFolder = sectionFolder;
          sectionCount++; // Increment section counter

          // Extract icon if available
          let icon = null;
          if (page.properties['Icon'] && page.properties['Icon'].rich_text && page.properties['Icon'].rich_text.length > 0) {
            icon = page.properties['Icon'].rich_text[0].plain_text;
          }
          // Create _category_.json file
          const categoryContent = {
            label: sectionTitle,
            position: i + 1,
            collapsible: true,
            collapsed: true,
            link: {
              type: "generated-index"
            },
            customProps: {
              title: sectionTitle
            }
          };

          // Apply title from a previous title section if available
          if (nextItemTitle) {
            categoryContent.customProps.title = nextItemTitle;
            nextItemTitle = null; // Reset after using it
          }

          // Add icon if available
          if (icon) {
            categoryContent.customProps.icon = icon;
          }

          const categoryFilePath = path.join(sectionFolderPath, "_category_.json");
          fs.writeFileSync(categoryFilePath, JSON.stringify(categoryContent, null, 2), 'utf8');
          pageSpinner.succeed(chalk.green(`Section folder created: ${sectionFolder} with _category_.json`));
          progressCallback({ current: i + 1, total: totalPages, id: page.id, title: sectionTitle });
          continue; // Skip creating a markdown file for this section item
        }

        if (sectionType === 'title') {
          // A title section does not create its own folder. Instead, its name will be used as metadata
          // for the next non-section item.
          nextItemTitle = page.properties.Title.title[0].plain_text;
          // Don't reset the current section folder, keep items in the current toggle folder if applicable
          titleSectionCount++; // Increment title section counter
          pageSpinner.succeed(chalk.green(`Title section detected: ${nextItemTitle}, will be applied to next item`));
          progressCallback({ current: i + 1, total: totalPages, id: page.id, title: nextItemTitle });
          continue; // Skip creating markdown file for this title section item
        }

        // If we encounter any other section type, clear the section folder to place items at root level
        currentSectionFolder = null;
      }

      const markdown = await n2m.pageToMarkdown(page.id);
      const markdownString = n2m.toMarkdownString(markdown);
      if (markdownString?.parent) {
        // Process images
        const imgRegex = /!\[.*?\]\((.*?)\)/g;
        const imgPromises = [];
        let match;
        let imgIndex = 0;
        while ((match = imgRegex.exec(markdownString.parent)) !== null) {
          const imgUrl = match[1];
          if (!imgUrl.startsWith('http')) continue; // Skip local images
          const fullMatch = match[0];
          imgPromises.push(
            downloadAndProcessImage(imgUrl, websiteBlock, imgIndex).then(({ newPath, savedBytes }) => {
              const newImageMarkdown = fullMatch.replace(imgUrl, newPath);
              markdownString.parent = markdownString.parent.replace(fullMatch, newImageMarkdown);
              totalSaved += savedBytes;
            })
          );
          imgIndex++;
        }
        await Promise.all(imgPromises);

        // Determine file path based on section folder context
        const fileName = `${websiteBlock}.md`;
        let filePath;

        if (currentSectionFolder) {
          filePath = path.join(CONTENT_PATH, currentSectionFolder, fileName);
        } else {
          filePath = path.join(CONTENT_PATH, fileName);
        }

        // Generate frontmatter
        const pageTitle = page.properties['Title'].title[0].plain_text;

        // Extract additional properties if available
        let keywords = ['docs', 'comapeo'];
        let tags = ['comapeo'];
        let sidebarPosition = i + 1;
        const customProps = {};

        // Check for Tags property
        if (page.properties['Tags'] && page.properties['Tags'].multi_select) {
          tags = page.properties['Tags'].multi_select.map(tag => tag.name);
        }

        // Check for Keywords property
        if (page.properties.Keywords?.multi_select && page.properties.Keywords.multi_select.length > 0) {
          keywords = page.properties.Keywords.multi_select.map(keyword => keyword.name);
        }

        // Check for Position property
        if (page.properties['Order'] && page.properties['Order'].number) {
          sidebarPosition = page.properties['Order'].number;
        }

        // Check for Icon property
        if (page.properties['Icon'] && page.properties['Icon'].rich_text && page.properties['Icon'].rich_text.length > 0) {
          customProps.icon = page.properties['Icon'].rich_text[0].plain_text;
        }

        // Apply title from a previous title section if available
        if (nextItemTitle) {
          customProps.title = nextItemTitle;
          nextItemTitle = null; // Reset after using it
        }

        // Determine the relative path for the custom_edit_url
        const relativePath = currentSectionFolder
          ? `${currentSectionFolder}/${fileName}`
          : fileName;

        // Generate frontmatter with custom properties
        let frontmatter = `---
id: doc-${websiteBlock}
title: ${pageTitle}
sidebar_label: ${pageTitle}
sidebar_position: ${sidebarPosition}
pagination_label: ${pageTitle}
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/${relativePath}
keywords:
${keywords.map(k => `  - ${k}`).join('\n')}
tags: [${tags.join(', ')}]
slug: /${websiteBlock}
last_update:
  date: ${new Date().toLocaleDateString('en-US')}
  author: Awana Digital`;

        // Add customProps to frontmatter if they exist
        if (Object.keys(customProps).length > 0) {
          frontmatter += `\nsidebar_custom_props:`;
          for (const [key, value] of Object.entries(customProps)) {
            // For emoji icons or titles with special characters, wrap in quotes
            if (typeof value === 'string' && (value.includes('"') || value.includes("'") || /[^\x20-\x7E]/.test(value))) {
              // If the value contains double quotes, use single quotes; otherwise use double quotes
              const quoteChar = value.includes('"') ? "'" : '"';
              frontmatter += `\n  ${key}: ${quoteChar}${value}${quoteChar}`;
            } else {
              frontmatter += `\n  ${key}: ${value}`;
            }
          }
        }

        frontmatter += `\n---\n`;

        // Remove duplicate title heading if it exists
        // The first H1 heading often duplicates the title in Notion exports
        let contentBody = markdownString.parent;

        // Find the first H1 heading pattern at the beginning of the content
        const firstH1Regex = /^\s*# (.+?)(?:\n|$)/;
        const firstH1Match = contentBody.match(firstH1Regex);

        if (firstH1Match) {
          const firstH1Text = firstH1Match[1].trim();
          // Check if this heading is similar to the page title (exact match or contains)
          if (firstH1Text === pageTitle || pageTitle.includes(firstH1Text) || firstH1Text.includes(pageTitle)) {
            // Remove the duplicate heading
            contentBody = contentBody.replace(firstH1Match[0], '');

            // Also remove any empty lines at the beginning
            contentBody = contentBody.replace(/^\s+/, '');
          }
        }

        // Add frontmatter to markdown content
        const contentWithFrontmatter = frontmatter + contentBody;
        fs.writeFileSync(filePath, contentWithFrontmatter, 'utf8');

        pageSpinner.succeed(chalk.green(`Page ${i + 1}/${totalPages} processed: ${filePath}`));
        console.log(chalk.blue(`  ↳ Added frontmatter with id: doc-${websiteBlock}, title: ${pageTitle}`));

        // Log information about custom properties
        if (Object.keys(customProps).length > 0) {
          console.log(chalk.yellow(`  ↳ Added custom properties: ${JSON.stringify(customProps)}`));
        }

        // Log information about section folder placement
        if (currentSectionFolder) {
          console.log(chalk.cyan(`  ↳ Placed in section folder: ${currentSectionFolder}`));
        }
      } else {
        pageSpinner.fail(chalk.yellow(`No 'Website Block' property found for page ${i + 1}/${totalPages}: ${page.id}`));
      }
    } catch (error) {
      pageSpinner.fail(chalk.red(`Error processing page ${i + 1}/${totalPages}: ${page.id}`));
      console.error(error);
    }

    progressCallback({ current: i + 1, total: totalPages, id: page.id, title: page.properties['Title'].title[0].plain_text });
  }

  return { totalSaved, sectionCount, titleSectionCount };
}
