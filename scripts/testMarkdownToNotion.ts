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
    // Create a temporary markdown file
    const tempDir = './temp';
    await fs.mkdir(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, 'test-markdown.md');
    await fs.writeFile(tempFilePath, SAMPLE_MARKDOWN, 'utf8');
    
    console.log('Created temporary markdown file:', tempFilePath);
    
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
        checkbox: true
      }
    };
    
    // Create a Notion page from the markdown
    console.log('Creating Notion page from markdown...');
    const pageId = await createNotionPageFromMarkdown(
      notion,
      DATABASE_ID,
      'Test Markdown to Notion',
      tempFilePath,
      properties
    );
    
    console.log('Successfully created Notion page with ID:', pageId);
    console.log('View the page in Notion to see the results');
    
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('Cleaned up temporary files');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
