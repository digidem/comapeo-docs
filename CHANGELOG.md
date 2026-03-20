# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Targeted Notion Fetching:** Added the ability to fetch data for a single Notion page.
- **Pre-Release Safety:** Added validation checks to ensure all translations (locales) are complete.

### Changed
- **Simplified Data Fetching:** Cleaned up and simplified the logic for fetching all pages from Notion.
- **Docker Tests:** Updated the Docker integration tests to work correctly with the newly added fetch-job types.

### Removed
- **Code Cleanup:** Removed redundant code from the API schemas to make the codebase cleaner.

### Fixed
- **Translation Completeness:** Fixed several issues with how the system measures if a page is fully translated.
- **Long-form Content Translation:** Prevented issues where content could be lost when translating very long pages.
- **Language Switcher (Locale Dropdown):** 
  - Fixed a bug where the language switcher would sometimes point to the wrong page.
  - Corrected an issue that caused "double" language codes in URLs.
  - Fixed navigation issues when switching languages on category index pages.
  - Fixed a display issue where the language dropdown might be hidden behind other menu items.
- **Build Scripts:** Resolved bugs in the TypeScript compilation and Markdown parsing scripts.