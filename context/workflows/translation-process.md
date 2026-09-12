# Translation Process

> [!NOTE]
> Notion page content translation is now managed by `../comapeo-content-pipeline/` (which generates translated docs directly onto the `content` branch).
> In-repo theme chrome translation is managed by `scripts/translate-theme/`.
> The legacy `bun run notion:translate` script and `translate-docs.yml` workflow have been retired.

i18n workflow for CoMapeo documentation using Notion and Docusaurus.

## Translation Architecture

### Source Language

- **English**: Primary content creation
- **Location**: Main Notion pages
- **Status Flow**: Creation → Development → Ready for translation

### Target Languages

- **Spanish**: `es` locale, 31.3% coverage
- **Portuguese**: `pt` locale, 34.7% coverage
- **Output**: `i18n/{lang}/docusaurus-plugin-content-docs/current/`

## Translation Workflow

### 1. Content Preparation

**Trigger**: English content reaches "Ready for translation" status

**Requirements**:

- Source content finalized and reviewed
- All images and media included
- Technical accuracy validated
- Content structure complete

### 2. Translation Generation

**Pipeline**: Page translation is executed via `../comapeo-content-pipeline/` (e.g. `bun run translations:generate`).
In-repo theme-chrome translation is executed via `bun scripts/translate-theme/index.ts`.

**Process**:

1. **Create Translation Pages**: Generate Spanish/Portuguese pages in Notion
2. **Update Code Strings**: Translate UI strings in `i18n/*/code.json`
3. **Translate Navigation**: Update navbar/footer strings from `docusaurus.config.ts`
4. **Generate Markdown**: Save translated content to locale directories

_(Note: The failure contract and TRANSLATION_SUMMARY schema below describe the original translation system design now implemented in `../comapeo-content-pipeline/`)_

**Fail-safe contract**:

- The pipeline exits non-zero when doc/content translation fails.
- The pipeline exits non-zero when no English pages are in `Ready for translation`.
- Theme (navbar/footer) translation in this repo exits non-zero on failure.
- Translation continues when `code.json` (UI strings) is missing or malformed (soft-fail).
- Every pipeline run emits a machine-readable summary.

### 3. Auto Translation Complete

**Status**: Pages set to "Auto translation generated"

**Process**:

1. Automated workflow updates Notion status from "Ready for translation" only after a successful translation run
2. Translation pages ready for human review
3. Run via `bun run notionStatus:translation` or GitHub Action

**Workflow execution**:

- Managed by `../comapeo-content-pipeline/` which writes translated docs to the `content` branch.
- Status updates and commit steps are managed by the pipeline.

### 4. Translation Review

**Status**: Human review of auto-translated content

**Process**:

1. Review automated translations for accuracy
2. Cultural adaptation and localization
3. Technical term consistency
4. Regional considerations

### 5. Publication

**Status**: "Ready to publish" in translation pages

**Process**:

1. Included in automated content sync via `comapeo-content-pipeline` to the `content` branch
2. Generate localized site structure
3. Deploy with main content updates

## Technical Implementation

### Docusaurus i18n Structure

```
i18n/
├── es/
│   ├── code.json                    # UI strings
│   └── docusaurus-plugin-content-docs/
│       └── current/                 # Spanish content
└── pt/
    ├── code.json                    # UI strings
    └── docusaurus-plugin-content-docs/
        └── current/                 # Portuguese content
```

### Translation Configuration

From `scripts/constants.ts`:

```typescript
export const LANGUAGES: TranslationConfig[] = [
  {
    language: "pt-BR",
    notionLangCode: "Portuguese",
    outputDir: "./i18n/pt/docusaurus-plugin-content-docs/current",
  },
  {
    language: "es",
    notionLangCode: "Spanish",
    outputDir: "./i18n/es/docusaurus-plugin-content-docs/current",
  },
];
```

### Environment Variables

- Required for translation workflow: `NOTION_API_KEY`, `OPENAI_API_KEY`, and `DATA_SOURCE_ID`.
- Backward compatibility: `DATABASE_ID` is still accepted as a fallback where needed.
- In GitHub Actions, keep `DATA_SOURCE_ID` and `DATABASE_ID` aligned until full migration completes.

#### DATA_SOURCE_ID Migration Policy

**Status**: Standardization in progress

**Background**: Notion API v5 (version `2025-09-03`) introduced `data_sources` as a new concept. Databases are now called "data sources" and may have different IDs than the legacy `DATABASE_ID`.

**Current Standard** (as of 2026-02):

1. **Primary Variable**: `DATA_SOURCE_ID` is the required variable for all new code
2. **Fallback Support**: `DATABASE_ID` is accepted for backward compatibility
3. **Validation**: Scripts warn when `DATA_SOURCE_ID` is not set
4. **Runtime Behavior**: Code uses `DATA_SOURCE_ID || DATABASE_ID` pattern

**Migration Steps**:

1. **Discover your DATA_SOURCE_ID**:

   ```bash
   bun scripts/migration/discoverDataSource.ts
   ```

2. **Update your `.env` file**:

   ```bash
   # Add the discovered DATA_SOURCE_ID
   DATA_SOURCE_ID=your_discovered_data_source_id_here

   # Keep DATABASE_ID for now (will be deprecated in future)
   DATABASE_ID=your_existing_database_id_here
   ```

3. **Update GitHub Secrets**:
   - Go to repository Settings → Secrets and variables → Actions
   - Add `DATA_SOURCE_ID` with the discovered value
   - Keep `DATABASE_ID` secret until full migration completes

4. **Verify the migration**:

   ```bash
   # Test status script with new credentials
   bun run notionStatus:ready-for-translation
   ```

**Deprecation Timeline**:

- **Current Phase** (2026-02): Migration and discovery phase
  - Both `DATA_SOURCE_ID` and `DATABASE_ID` accepted
  - Scripts prefer `DATA_SOURCE_ID` with fallback to `DATABASE_ID`
  - Warnings logged when `DATA_SOURCE_ID` is missing

- **Next Phase** (TBD): Hard requirement phase
  - `DATA_SOURCE_ID` becomes required
  - `DATABASE_ID` fallback removed
  - Migration deadline communicated in advance

- **Final Phase** (TBD): Deprecation phase
  - `DATABASE_ID` fully removed from codebase
  - All references updated to `DATA_SOURCE_ID`

**Compatibility Notes**:

- In Notion API v5, `DATABASE_ID` and `DATA_SOURCE_ID` may be **different values**
- Always run the discovery script to find the correct `DATA_SOURCE_ID`
- Do not assume `DATA_SOURCE_ID === DATABASE_ID`
- The fallback pattern (`DATA_SOURCE_ID || DATABASE_ID`) ensures smooth migration

**See Also**:

- Migration script: `scripts/migration/discoverDataSource.ts`
- External content pipeline: `../comapeo-content-pipeline/`
- Theme translation: `scripts/translate-theme/`

## Content Synchronization

### Shared Metadata

- Navigation structure maintained across languages
- Image paths consistent (`/images/...`)
- Frontmatter structure preserved
- Cross-references maintained

### Language-Specific Content

- Translated text content
- Localized examples
- Cultural adaptations
- Regional terminology

## Quality Assurance

### Automated Checks

- Translation completeness validation
- Link integrity verification
- Image reference consistency
- Frontmatter accuracy

### Manual Review

- Technical accuracy
- Cultural appropriateness
- Terminology consistency
- Reading experience

## Translation Guidelines

### Spanish (es)

- Neutral Spanish for broad accessibility
- Technical terms in Spanish when available
- CoMapeo brand name unchanged
- Regional examples where appropriate

### Portuguese (pt)

- Brazilian Portuguese standard
- Technical terms in Portuguese when clear
- CoMapeo brand name unchanged
- Brazil-specific examples and contexts

## Development Integration

### Component Translation

Use `@docusaurus/Translate` for UI components:

```tsx
import Translate from "@docusaurus/Translate";

<Translate id="homepage.tagline">
  Collaborative mapping for territory defense
</Translate>;
```

### Translation Strings

Update `i18n/*/code.json` with UI translations:

```json
{
  "homepage.tagline": "Mapeo colaborativo para la defensa del territorio"
}
```
