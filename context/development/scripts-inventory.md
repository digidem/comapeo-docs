# Scripts Inventory

> **Historical Reference**: The legacy Notion content fetching and translation scripts documented below (`scripts/notion-fetch/`, `scripts/notion-translate/`, `notion:fetch*`, `notion:translate`) have been retired (#192) and migrated to `../comapeo-content-pipeline/`.
>
> For surviving in-repo scripts, see the active inventory below.

## Active Scripts Inventory

### 1. Theme Translation (`scripts/translate-theme/`)

- **Entry point**: `scripts/translate-theme/index.ts`
- **Purpose**: Translates UI chrome (navbar, footer, `code.json`) using OpenAI.
- **Command**: `bun scripts/translate-theme/index.ts`

### 2. Notion Status Utilities (`scripts/notion-status/`)

- **Entry point**: `scripts/notion-status/index.ts`
- **Purpose**: Batch status updates for Notion pages in deploy workflows.
- **Commands**: `bun run notionStatus:ready-for-translation`, `bun run notionStatus:translation`, `bun run notionStatus:draft`, `bun run notionStatus:publish`, `bun run notionStatus:publish-production`

### 3. Template & Version Utilities

- **Template**: `scripts/notion-create-template/index.ts` (`bun run notion:create-template`)
- **Version**: `scripts/notion-version/index.ts` (`bun run notion:version`)

### 4. Build & Content Policy Helpers

- `scripts/verify-generated-content-policy.ts` (`bun run verify:generated-content-policy`)
- `scripts/cleanup-generated-content.ts` (`bun run clean:generated`)
- `scripts/fix-frontmatter.ts` (`bun run fix:frontmatter`)
- `scripts/generate-robots-txt.ts` (`bun run generate:robots`)
