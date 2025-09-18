# CoMapeo Documentation

Welcome to the documentation portal for the CoMapeo platform. This site is built with [Docusaurus](https://docusaurus.io/), which powers a modern static website and supports features like multilingual content and automatic Markdown generation from our Notion database.

### Installation

Install all dependencies with:

```
bun i
```

Before proceeding to local development, set up your environment and fetch the latest Notion Markdown files:

1. Rename (or copy) .env.example to .env and update it with your Notion API key and Database ID.
2. Fetch the Notion Markdown documentation by running:

```
bun notion:fetch
```

### Notion Fetch Workflow

The `bun notion:fetch` script pulls structured content from Notion and rewrites local docs. Keep these rules in mind so the output matches your expectations:

- **Filter criteria**: Only pages where `Status` equals `Ready to publish` _and_ the `Parent item` relation is empty are treated as parent records. Pages that fail either check are skipped.
- **Sub-page grouping**: Parents must link their language variants through the `Sub-item` relation. Each linked child should set `Language` to `English`, `Spanish`, or `Portuguese`. Any other language values are ignored.
- **Section field drives layout**:
  - `Section = Page` exports markdown, regenerates frontmatter, rewrites remote images under `static/images/`, and tracks compression savings for the summary.
  - `Section = Toggle` creates a folder (plus `_category_.json` for English) and increments the “section folders” counter.
  - `Section = Heading` stores the heading for the next `Page` entry’s sidebar metadata and increments the “title sections applied” counter.
- **Summary counters**: The totals printed at the end reflect the actions above. Zeros mean no matching work occurred (for example, no toggles, no headings, or no images to optimize).
- **Translations**: When a non-English child page is processed, its title is written to `i18n/<locale>/code.json` using the parent’s English title as the key. Ensure those files exist before running the script.
- **Slug and edit URL**: Markdown frontmatter derives the slug and `custom_edit_url` from the parent title. Adjust the Notion title to change the generated path.
- **Safety checks**: Missing `NOTION_API_KEY` or `DATABASE_ID` cause the script to exit early after logging an error. Other runtime failures (such as image download issues) are logged and processing continues for remaining pages.

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

### Roadmap & Future Enhancements

- [ ] Develop a robust translation strategy to further enhance our multilingual support.
- [ ] Integrate GitHub Actions for continuous deployment and automated publishing.
- [ ] Refine the Notion-to-Markdown integration for more dynamic updates.
