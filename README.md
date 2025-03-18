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
bun notionToMd
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

### Roadmap & Future Enhancements

- [ ] Develop a robust translation strategy to further enhance our multilingual support.
- [ ] Integrate GitHub Actions for continuous deployment and automated publishing.
- [ ] Refine the Notion-to-Markdown integration for more dynamic updates.
