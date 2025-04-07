# CoMapeo Documentation

Welcome to the documentation portal for the CoMapeo platform. This site is built with [Docusaurus](https://docusaurus.io/), which powers a modern static website and supports features like multilingual content and automatic Markdown generation from our Notion database.

### Installation

Install all dependencies with:

```
bun i
```

Before proceeding to local development, set up your environment and fetch the latest Notion Markdown files:
1. Rename (or copy) .env.example to .env and update it with your Notion API key, Database ID, and OpenAI API key.
2. Fetch the Notion Markdown documentation by running:

```
bun notion:fetch
```

### Local Development

Launch a local development server with live reloading by running:

```
bun dev
```

This command opens your browser automatically and reflects changes immediately.

### Build

Compile all content—including Markdown files fetched from Notion and integrated translations—into static assets by running:

```
bun build
```

The resulting files are placed in the `build` directory for deployment via any static hosting service.

### Deployment

Deploy your site using one of the following methods:

- Using SSH:

```
USE_SSH=true bun deploy
```

- Without SSH (using GitHub credentials):

```
GIT_USER=<Your GitHub username> bun deploy
```

For GitHub Pages hosting, this command conveniently builds the site and pushes to the `gh-pages` branch.

### Notion Content Workflow

This project uses a Notion database as the source of truth for documentation content. The workflow includes fetching content from Notion, generating Markdown files, and translating content to multiple languages.

#### Environment Variables

To use the Notion workflow, you need to set up the following environment variables in your `.env` file:

```
NOTION_API_KEY=your_notion_api_key
DATABASE_ID=your_notion_database_id
OPENAI_API_KEY=your_openai_api_key
```

#### Available Scripts

- **Full Workflow**: Fetch, generate, and translate content
  ```
  bun notion:workflow
  ```

- **Fetch Only**: Fetch content from Notion and generate English Markdown files
  ```
  bun notion:fetch
  ```

- **Translate Only**: Translate existing English content to other languages
  ```
  bun notion:translate
  ```

#### GitHub Actions Integration

The Notion content workflow is integrated with GitHub Actions. You can trigger the workflow manually from the Actions tab in your GitHub repository.

1. Go to the Actions tab in your GitHub repository
2. Select the "Notion Content Workflow" action
3. Click "Run workflow"
4. Choose the workflow type:
   - `full`: Run the complete workflow (fetch, generate, translate)
   - `fetch-only`: Only fetch and generate English content
   - `translate-only`: Only translate existing English content
5. Choose whether to create a PR with the changes
6. Click "Run workflow"

#### Workflow Details

1. **Fetch and Generate**:
   - Fetches pages from the Notion database
   - Sorts pages by the "Order" property
   - Generates Markdown files for English content
   - Handles section toggles and title sections
   - Processes and optimizes images

2. **Translation**:
   - Identifies published English pages
   - Checks if translation pages exist and need updating
   - Translates content using OpenAI
   - Creates or updates translation pages in Notion
   - Saves translated content to the appropriate output directories

#### Adding New Languages

To add a new language for translation, update the `LANGUAGES` array in `scripts/notionWorkflow.ts`:

```typescript
const LANGUAGES: TranslationConfig[] = [
  {
    language: 'pt-BR',
    notionLangCode: 'Portuguese',
    outputDir: './i18n/pt/docusaurus-plugin-content-docs'
  },
  // Add a new language here
  {
    language: 'es',
    notionLangCode: 'Spanish',
    outputDir: './i18n/es/docusaurus-plugin-content-docs'
  }
];
```

### Roadmap & Future Enhancements

- [x] Develop a robust translation strategy to enhance our multilingual support.
- [x] Integrate GitHub Actions for continuous deployment and automated publishing.
- [x] Refine the Notion-to-Markdown integration for more dynamic updates.
- [ ] Add support for more languages.
- [ ] Implement a review system for translations.
