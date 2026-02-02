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

### 3. Auto Translation Complete
**Status**: Pages set to "Auto translation generated"

**Process**:
1. Automated workflow updates Notion status from "Ready for translation"
2. Translation pages ready for human review
3. Run via `bun run notionStatus:translation` or GitHub Action

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
    outputDir: "./i18n/pt/docusaurus-plugin-content-docs/current"
  },
  {
    language: "es",
    notionLangCode: "Spanish",
    outputDir: "./i18n/es/docusaurus-plugin-content-docs/current"  
  }
];
```

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
import Translate from '@docusaurus/Translate';

<Translate id="homepage.tagline">
  Collaborative mapping for territory defense
</Translate>
```

### Translation Strings
Update `i18n/*/code.json` with UI translations:
```json
{
  "homepage.tagline": "Mapeo colaborativo para la defensa del territorio"
}
```