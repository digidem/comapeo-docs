# Notion Commands Reference

Command reference for Notion-related workflows in `comapeo-docs`.

> **Note**: Content fetching and markdown generation commands (`notion:fetch`, `notion:fetch-all`, `notion:gen-placeholders`, `notion:translate`) have retired as part of #192 and migrated to `../comapeo-content-pipeline/`. See that repository for content generation CLI tools.

## Surviving In-Repo Commands

### Status Management Workflows

Update the status of Notion documentation pages for different stages of the editorial and publishing pipeline:

```bash
# Move pages to translation stage
bun run notionStatus:translation

# Move pages to draft published stage
bun run notionStatus:draft

# Move pages to publish stage
bun run notionStatus:publish

# Publish production workflow
bun run notionStatus:publish-production

# Mark pages ready for translation
bun run notionStatus:ready-for-translation
```

### Content Template Creation

Create a new Notion page template:

```bash
bun run notion:create-template "Page Title"
```

### Version Tagging

Update documentation release version metadata in Notion:

```bash
bun run notion:version
```

### Theme Chrome Translation

Translate theme UI chrome (`navbar`, `footer`, `code.json`) for configured locales (Portuguese and Spanish):

```bash
bun scripts/translate-theme/index.ts
```
