# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Docusaurus Regression Tests:** Added swizzled component contract tests and config validation tests to catch breaking changes on Docusaurus upgrades.
- **Fetch-One API:** Added `fetch-one` job type for single-page Notion fetch.
- **Translation Strategies:** Added no-overwrite strategy for human-reviewed translations (#179).
- **DeepSeek Support:** Added `OPENAI_BASE_URL` secret support for custom API providers like DeepSeek.
- **Pre-Release Safety:** Added validation checks to ensure all translations (locales) are complete.
- **Locale URL Tests:** Added unit tests for locale URL construction.

### Changed

- **Docusaurus 3.10.1:** Upgraded all `@docusaurus/*` packages from 3.9.2 to 3.10.1.
- **Node 20:** Bumped minimum Node version from 18 to 20 (Node 18 EOL, dropped by Docusaurus 3.10).
- **DocCard Re-swizzle:** Re-swizzled `DocCard` against Docusaurus 3.10 upstream — now uses `useDocById` for automatic doc descriptions.
- **Notion API Migration:** Completed `DATA_SOURCE_ID` migration — removed deprecated `databasesQuery()`, `dataSourcesQuery()` is sole query method.
- **Vitest Date Mock:** Replaced 40-line manual Date constructor mock with `vi.setSystemTime` (works in Vitest 4.x).
- **ESLint:** Pinned ESLint to v9.x for `eslint-plugin-react` compatibility.
- **Lockfile Cleanup:** Removed stale `package-lock.json` (Bun-only project), updated `bun.lockb` references to `bun.lock`.

### Fixed

- **Translation Completeness:** Fixed several issues with how the system measures if a page is fully translated.
- **Long-form Content Translation:** Prevented issues where content could be lost when translating very long pages (#169).
- **i18n Locale Detection:** Derive current locale from pathname to fix stale context bug.
- **Locale Dropdown:** Fixed double locale prefix, category index page handling, and z-index stacking issues.
- **Build Scripts:** Resolved bugs in the TypeScript compilation and Markdown parsing scripts.
- **Translation Chunking:** Use model-specific context limits and `json_object` format for custom API providers.
