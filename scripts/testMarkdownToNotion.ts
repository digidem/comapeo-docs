import dotenv from 'dotenv';
import { notion, DATABASE_ID } from './notionClient.js';
import { createNotionPageFromMarkdown } from './markdownToNotion.js';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Sample markdown content for testing
const SAMPLE_MARKDOWN = `
# 👋 Meet Auggie

I'm your AI coding assistant. I excel at understanding large, complex codebases but I am happy to chip in on codebases of all sizes.

## Who are you?

Hey, luandro, since I am an LLM and I don't have a real memory (sad) I'll be using \`📦 Augment Memories\`

## How I work

* **Augment Memories:** Project-specific memories
  * New folder = clean slate
  * I learn from my mistakes when you correct me
  * You can ask me to remember things (e.g. "commit to memory...")

* **Native Integrations:** Configure integrations like GitHub + Linear with 1-click over in Settings
`;

async function main() {
  try {
    // Define properties for the Notion page
    const properties = {
      Language: {
        rich_text: [
          {
            text: {
              content: 'English'
            }
          }
        ]
      },
      Published: {
        checkbox: false
      }
    };

    // Method 1: Create a Notion page from markdown content directly
    console.log('Method 1: Creating Notion page from markdown content directly...');
    const pageId1 = await createNotionPageFromMarkdown(
      notion,
      DATABASE_ID,
      'Test Markdown to Notion (Direct Content)',
      SAMPLE_MARKDOWN,
      properties,
      true // Pass content directly
    );

    console.log('Successfully created Notion page with ID:', pageId1);

    // Method 2: Create a temporary markdown file and use that
    const tempDir = './temp';
    await fs.mkdir(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, 'test-markdown.md');
    await fs.writeFile(tempFilePath, SAMPLE_MARKDOWN, 'utf8');

    console.log('\nMethod 2: Creating Notion page from markdown file...');
    console.log('Created temporary markdown file:', tempFilePath);

    const pageId2 = await createNotionPageFromMarkdown(
      notion,
      DATABASE_ID,
      'Test Markdown to Notion (From File)',
      tempFilePath,
      properties
    );

    console.log('Successfully created Notion page with ID:', pageId2);
    console.log('View the pages in Notion to see the results');

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('Cleaned up temporary files');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
