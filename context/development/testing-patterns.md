# Testing Patterns for Notion Scripts

TDD patterns and testing structure for the three-script architecture.

## Testing Framework

**Stack**: Vitest with Node environment

- **Location**: `scripts/**/*.{test,spec}.{ts,js,tsx}`
- **Coverage**: 85% branches/functions/lines/statements
- **Globals**: Enabled for describe/it/expect

## Test Structure Patterns

### 1. Unit Tests

Test individual functions and utilities:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { generatePlaceholder } from "./placeholderGenerator";

describe("generatePlaceholder", () => {
  it("should create contextual content for page type", () => {
    // Arrange
    const pageData = {
      title: "Installing CoMapeo",
      elementType: "Page",
      language: "English",
    };

    // Act
    const result = generatePlaceholder(pageData);

    // Assert
    expect(result).toContain("installation");
    expect(result.length).toBeGreaterThan(100);
  });
});
```

### 2. Integration Tests

Test script coordination and API interactions:

```typescript
describe("notion:gen-placeholders integration", () => {
  it("should process multiple pages with rate limiting", async () => {
    // Arrange
    const mockPages = createMockPages(5);
    const rateLimiter = new RateLimiter(100); // 100ms delay

    // Act
    const results = await processPages(mockPages, rateLimiter);

    // Assert
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.success)).toBe(true);
  });
});
```

### 3. Mock Patterns

#### Notion API Mocking

```typescript
import { vi } from "vitest";

const mockNotionClient = {
  pages: {
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  blocks: {
    children: {
      list: vi.fn(),
      append: vi.fn(),
    },
  },
};
```

#### Page Data Mocking

```typescript
const createMockPage = (overrides = {}) => ({
  id: "test-id",
  title: "Test Page",
  status: "No Status",
  elementType: "Page",
  language: "English",
  hasContent: false,
  contentScore: 0,
  ...overrides,
});
```

## Test Categories by Script

### `notion:gen-placeholders`

- **Content Generation**: Test placeholder quality and relevance
- **Filtering Logic**: Test page selection criteria
- **API Integration**: Test Notion page updates
- **Rate Limiting**: Test API call spacing
- **Error Handling**: Test failure recovery

### `notion:fetch-all`

- **Content Conversion**: Test markdown generation
- **Callout Processing**: Test callout color/type handling (issue #17)
- **Image Processing**: Test image optimization
- **Metadata Preservation**: Test frontmatter generation
- **Multi-language**: Test translation handling

### `notion:export`

- **Data Completeness**: Test full database capture
- **Schema Accuracy**: Test property mapping
- **Block Analysis**: Test content scoring
- **JSON Structure**: Test output format validity
- **Large Dataset**: Test performance with full database

## Test Data Management

### Fixtures

```typescript
// tests/fixtures/notion-pages.json
{
  "emptyPage": { "id": "empty", "hasContent": false },
  "richPage": { "id": "rich", "blocks": [...] },
  "calloutPage": { "id": "callout", "blocks": [{"type": "callout"}] }
}
```

### Test Utilities

```typescript
// tests/utils/notion-helpers.ts
export const createMockDatabase = (pageCount: number) => { ... };
export const assertValidMarkdown = (content: string) => { ... };
export const mockNotionResponse = (data: any) => { ... };
```

## Quality Assertions

### Content Quality

```typescript
expect(content).toMatch(/^# .+/); // Has title
expect(content.length).toBeGreaterThan(100); // Meaningful length
expect(content).not.toContain("TODO"); // No placeholders
```

### Performance

```typescript
const startTime = Date.now();
await processLargeDataset();
const duration = Date.now() - startTime;
expect(duration).toBeLessThan(5000); // Under 5 seconds
```

### Safety

```typescript
expect(() => updateEnglishPage()).toThrow("SAFETY ERROR");
expect(backupCreated).toBe(true);
```
