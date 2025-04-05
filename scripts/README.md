# Markdown to Notion Converter

This module provides functionality to convert Markdown content to Notion blocks and create or update Notion pages with that content.

## Features

- Converts Markdown to Notion blocks
- Supports various Markdown elements:
  - Headings (h1, h2, h3)
  - Paragraphs
  - Lists (ordered and unordered)
  - Code blocks with language detection
  - Blockquotes
  - Thematic breaks (horizontal rules)
  - Images
- Creates or updates Notion pages with the converted content
- Supports additional page properties

## Usage

### Converting Markdown to Notion Blocks

```typescript
import { markdownToNotionBlocks } from './markdownToNotion.js';

const markdown = `
# Heading 1

This is a paragraph.

- List item 1
- List item 2

\`\`\`javascript
console.log('Hello, world!');
\`\`\`
`;

const blocks = await markdownToNotionBlocks(markdown);
```

### Creating a Notion Page from Markdown

#### Method 1: From a Markdown File

```typescript
import { createNotionPageFromMarkdown } from './markdownToNotion.js';
import { notion, DATABASE_ID } from './notionClient.js';

// Define additional properties for the page
const properties = {
  Language: {
    rich_text: [{ text: { content: 'English' } }]
  },
  Published: {
    checkbox: true
  }
};

// Create a page from a markdown file
const pageId = await createNotionPageFromMarkdown(
  notion,
  DATABASE_ID,
  'Page Title',
  'path/to/markdown/file.md',
  properties
);

console.log('Created page with ID:', pageId);
```

#### Method 2: From Markdown Content Directly

```typescript
import { createNotionPageFromMarkdown } from './markdownToNotion.js';
import { notion, DATABASE_ID } from './notionClient.js';

const markdown = `
# Heading 1

This is a paragraph.
`;

// Define additional properties for the page
const properties = {
  Language: {
    rich_text: [{ text: { content: 'English' } }]
  },
  Published: {
    checkbox: true
  }
};

// Create a page from markdown content directly
const pageId = await createNotionPageFromMarkdown(
  notion,
  DATABASE_ID,
  'Page Title',
  markdown,
  properties,
  true // Pass content directly
);

console.log('Created page with ID:', pageId);
```

## Testing

Run the tests with:

```bash
bun test
```

Or try the example script:

```bash
bun testMarkdownToNotion
```

## Dependencies

- `@notionhq/client`: Notion API client
- `unified`: Text processing framework
- `remark-parse`: Markdown parser
- `unist-util-visit`: Utility for traversing the syntax tree
