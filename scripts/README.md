# Notion Workflow Scripts

This directory contains scripts for fetching content from Notion, generating Docusaurus pages, and translating content.

## Main Workflow

The Notion workflow consists of three main steps:

1. **Fetch**: Fetch published English pages from Notion
2. **Generate**: Generate Docusaurus pages from the fetched content
3. **Translate**: Translate the English content to other languages

## Scripts

### Main Scripts

- `notionWorkflow.ts`: The main script that runs the entire workflow (fetch, generate, translate)
- `fetchNotion.ts`: Fetches published English pages from Notion and generates Docusaurus pages
- `translateNotionPages.ts`: Translates English pages to other languages

### Utility Scripts

- `constants.ts`: Contains constants used across the scripts
- `notionClient.ts`: Initializes the Notion client and exports it for use in other scripts
- `fetchNotionData.ts`: Contains functions for fetching data from Notion
- `generateBlocks.ts`: Generates Docusaurus pages from Notion content
- `markdownToNotion.ts`: Converts markdown to Notion blocks and creates Notion pages
- `openaiTranslator.ts`: Translates text using OpenAI
- `imageCompressor.ts`: Compresses images
- `imageProcessor.ts`: Processes images (resize, optimize)

## Usage

### Running the Full Workflow

```bash
npm run notion:workflow
```

This will:
1. Fetch published English pages from Notion
2. Generate Docusaurus pages from the fetched content
3. Translate the English content to other languages

### Running Individual Steps

```bash
# Fetch and generate only
npm run notion:fetch

# Translate only
npm run notion:translate
```

## Configuration

Configuration is done through environment variables and constants:

- Environment variables are loaded from `.env` file
- Constants are defined in `constants.ts`

### Required Environment Variables

- `NOTION_API_KEY`: Your Notion API key
- `DATABASE_ID`: The ID of your Notion database
- `OPENAI_API_KEY`: Your OpenAI API key (for translation)

### Translation Languages

Languages for translation are defined in `constants.ts`:

```typescript
export const LANGUAGES: TranslationConfig[] = [
  {
    language: 'pt-BR',
    notionLangCode: 'Portuguese',
    outputDir: './i18n/pt/docusaurus-plugin-content-docs'
  },
  // Add more languages as needed
];
```

To add a new language, add a new entry to the `LANGUAGES` array.

## Markdown to Notion Features

The `markdownToNotion.ts` module provides functionality to convert Markdown content to Notion blocks and create or update Notion pages with that content.

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

## Testing

Run the tests with:

```bash
npm test
```

## Dependencies

- `@notionhq/client`: Notion API client
- `openai`: OpenAI API client for translations
- `unified`: Text processing framework
- `remark-parse`: Markdown parser
- `unist-util-visit`: Utility for traversing the syntax tree
- `ora`: Terminal spinner
- `chalk`: Terminal styling
