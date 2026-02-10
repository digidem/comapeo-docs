# Translation Process

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

**Command**: `bun run notion:translate`

**Process**:

1. **Create Translation Pages**: Generate Spanish/Portuguese pages in Notion
2. **Update Code Strings**: Translate UI strings in `i18n/*/code.json`
3. **Translate Navigation**: Update navbar/footer strings from `docusaurus.config.ts`
4. **Generate Markdown**: Save translated content to locale directories

**Fail-safe contract**:

- The command exits non-zero when any doc/content translation fails.
- The command exits non-zero when no English pages are in `Ready for translation`.
- The command exits non-zero when any theme (navbar/footer) translation fails.
- The command **continues** when `code.json` (UI strings) is missing or malformed (soft-fail).
- Every run emits a machine-readable `TRANSLATION_SUMMARY ...` log line.

### Soft-fail policy for code.json

**Rationale**: Doc translation is the primary value, while `code.json` (UI strings) and theme translations are secondary. Hard-failing on secondary values would block all primary work.

**Behavior**:

- If `i18n/en/code.json` is missing or contains invalid JSON:
  - A warning is logged to the console
  - A non-critical failure entry is added to the summary
  - Doc translation continues normally
  - The summary's `codeJsonFailures` count is incremented
  - The command exit status reflects the overall result (including doc failures)

**Example output**:

```
⚠ English code.json not found. Skipping UI string translation (continuing with doc translation).
```

**Summary categorization**:

```json
{
  "failures": [
    {
      "language": "en",
      "title": "code.json (source file)",
      "error": "Source file not found - UI string translation skipped",
      "isCritical": false
    }
  ],
  "codeJsonFailures": 1
}
```

### 3. Auto Translation Complete

**Status**: Pages set to "Auto translation generated"

**Process**:

1. Automated workflow updates Notion status from "Ready for translation" only after a successful translation run
2. Translation pages ready for human review
3. Run via `bun run notionStatus:translation` or GitHub Action

**Workflow dispatch**:

- `.github/workflows/translate-docs.yml` accepts `target_branch` input.
- Status update and commit steps are gated by `if: success()`.

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

1. Include in `notion:fetch-all` processing
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
