# Development Constants

Constants and mappings for Notion integration development.

## Property Name Mappings

From `scripts/constants.ts`:

```typescript
export const NOTION_PROPERTIES = {
  TITLE: "Content elements",
  LANGUAGE: "Language", 
  STATUS: "Publish Status",
  ORDER: "Order",
  TAGS: "Tags",
  ELEMENT_TYPE: "Element Type",
  READY_FOR_TRANSLATION: "Ready for translation",
  READY_TO_PUBLISH: "Ready to publish"
};
```

## Valid Values

### Status Values
```typescript
const VALID_STATUSES = [
  "No Status",      // Default, 72% of pages
  "Not started",    // Planned content
  "Update in progress",  // Work in progress
  "Draft published",     // Live content
  "Ready to publish",    // Completed content
  "Remove"          // Exclude from processing
];
```

### Element Types
```typescript
const VALID_ELEMENT_TYPES = [
  "Page",     // Standard content pages (70.5%)
  "Title",    // Section headers (19.2%)
  "Toggle",   // Collapsible sections (5.2%)
  "Unknown"   // Unclassified content (5.2%)
];
```

### Languages
```typescript
const VALID_LANGUAGES = [
  "English",     // Source language (32.7%)
  "Spanish",     // Translation target (31.3%)
  "Portuguese"   // Translation target (34.7%)
];
```

## Configuration Constants

### API Settings
```typescript
export const MAX_RETRIES = 3;
export const NOTION_API_CHUNK_SIZE = 50;
```

### Content Processing
```typescript
export const IMAGE_MAX_WIDTH = 1280;
export const JPEG_QUALITY = 80;
export const WEBP_QUALITY = 80;
```

### AI Integration
```typescript
export const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
export const DEFAULT_OPENAI_TEMPERATURE = 0.3;
export const DEFAULT_OPENAI_MAX_TOKENS = 4096;
```

## Safety Constants

```typescript
export const ENGLISH_MODIFICATION_ERROR = 
  "SAFETY ERROR: Cannot create or update English pages.";
export const ENGLISH_DIR_SAVE_ERROR = 
  "Safety check failed: Cannot save translated content to English docs directory";
```