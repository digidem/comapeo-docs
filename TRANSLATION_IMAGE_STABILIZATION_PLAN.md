# Implementation Plan: Translation Image Stabilization

**Issue:** #137
**Spec:** `TRANSLATION_IMAGE_STABILIZATION_SPEC.md` (reviewed 2026-02-14)
**Created:** 2026-02-14

---

## Overview

Integrate existing image processing from the EN fetch pipeline into the translation pipeline so all translated markdown uses stable `/images/...` paths instead of expiring Notion/S3 URLs.

**Architecture:** Process images BEFORE translation using `processAndReplaceImages()` from `scripts/notion-fetch/imageReplacer.ts`, then validate AFTER translation that no S3 URLs remain. Fail page translation if any image download fails or S3 URLs survive.

---

## Dependency Graph

```
TASK-1.1 (imports) ──┐
                     ├──► TASK-1.3 (image processing in else branch)
TASK-1.2 (helper)  ──┤
                     └──► TASK-1.4 (post-translation validation)
                                     │
TASK-2.1 (prompt) ───────────────────┤ (optional, independent)
                                     │
                                     ▼
TASK-3.1..3.8 (tests) ──► TASK-4.1..4.4 (validation) ──► TASK-5.1..5.2 (commit)
```

---

## Phase 1: Core Integration

**Primary file:** `scripts/notion-translate/index.ts`

---

### TASK-1.1: Add imports for image processing functions

**Action:** INSERT
**File:** `scripts/notion-translate/index.ts`
**Location:** After line 24 (after the last existing import block: `import { LANGUAGES, MAIN_LANGUAGE, ... } from "../constants.js";`)

**Code to add:**

```typescript
import {
  processAndReplaceImages,
  getImageDiagnostics,
} from "../notion-fetch/imageReplacer.js";
```

**Dependencies:** None
**Verification:** `bun run typecheck --noEmit` passes — confirms the import resolves and exported types match.

---

### TASK-1.2: Extract `generateSafeFilename` helper from `saveTranslatedContentToDisk`

**Action:** REFACTOR (extract + replace)
**File:** `scripts/notion-translate/index.ts`
**Location:** Insert new function BEFORE `saveTranslatedContentToDisk()` (before line 562), AFTER `const MAX_SLUG_LENGTH = 50;` (line 560)

**Step A — Add new helper function after line 560:**

```typescript
/**
 * Generates a deterministic, filesystem-safe filename from a title and page ID.
 * Reuses the exact slug logic from saveTranslatedContentToDisk() to ensure
 * image filenames remain consistent with markdown filenames.
 */
function generateSafeFilename(title: string, pageId: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, MAX_SLUG_LENGTH);
  const stablePageId = pageId.toLowerCase().replace(/[^a-z0-9]/g, "");
  const deterministicBase = baseSlug || "untitled";
  return `${deterministicBase}-${stablePageId}`;
}
```

**Step B — Refactor `saveTranslatedContentToDisk` to use the new helper.**

Replace lines 573-580 (the inline slug logic):

```typescript
// BEFORE (lines 573-580):
const baseSlug = title
  .toLowerCase()
  .replace(/\s+/g, "-")
  .replace(/[^a-z0-9-]/g, "")
  .substring(0, MAX_SLUG_LENGTH);
const stablePageId = englishPage.id.toLowerCase().replace(/[^a-z0-9]/g, "");
const deterministicBase = baseSlug || "untitled";
const deterministicName = `${deterministicBase}-${stablePageId}`;
```

With:

```typescript
// AFTER:
const deterministicName = generateSafeFilename(title, englishPage.id);
```

**Dependencies:** None
**Verification:** Existing tests in `index.test.ts` that exercise `saveTranslatedContentToDisk` must still pass unchanged. The refactoring is purely mechanical — same logic, extracted.

---

### TASK-1.3: Add image processing before translation

**Action:** MODIFY
**File:** `scripts/notion-translate/index.ts`
**Location:** Inside `processSinglePageTranslation()`, lines 948-968

**Current code (lines 948-968):**

```typescript
// Convert English page to markdown
const markdownContent = await convertPageToMarkdown(englishPage.id);

// Translate the content
let translatedContent: string;
let translatedTitle: string;

if (isTitlePage) {
  // For title pages, create a minimal content with just the title
  translatedContent = `# ${originalTitle}`;
  translatedTitle = originalTitle;
} else {
  // For regular pages, translate the full content
  const translated = await translateText(
    markdownContent,
    originalTitle,
    config.language
  );
  translatedContent = translated.markdown;
  translatedTitle = translated.title;
}
```

**Replace with:**

```typescript
// Convert English page to markdown
const rawMarkdownContent = await convertPageToMarkdown(englishPage.id);

// Translate the content
let translatedContent: string;
let translatedTitle: string;

if (isTitlePage) {
  // For title pages, create a minimal content with just the title
  translatedContent = `# ${originalTitle}`;
  translatedTitle = originalTitle;
} else {
  // Stabilize images: replace expiring S3 URLs with /images/... paths
  const safeFilename = generateSafeFilename(originalTitle, englishPage.id);
  const imageResult = await processAndReplaceImages(
    rawMarkdownContent,
    safeFilename
  );

  // Fail page if any images failed to download (no broken placeholders)
  if (imageResult.stats.totalFailures > 0) {
    throw new Error(
      `Image stabilization failed for "${originalTitle}": ` +
        `${imageResult.stats.totalFailures} image(s) failed to download. ` +
        `Cannot proceed with translation — images would be broken.`
    );
  }

  const markdownContent = imageResult.markdown;

  if (imageResult.stats.successfulImages > 0) {
    console.log(
      chalk.blue(
        `  Images: processed=${imageResult.stats.successfulImages} failed=${imageResult.stats.totalFailures}`
      )
    );
  }

  // For regular pages, translate the full content
  const translated = await translateText(
    markdownContent,
    originalTitle,
    config.language
  );
  translatedContent = translated.markdown;
  translatedTitle = translated.title;

  // Post-translation validation: ensure no S3 URLs survive translation
  const postTranslationDiagnostics = getImageDiagnostics(translatedContent);
  if (postTranslationDiagnostics.s3Matches > 0) {
    throw new Error(
      `Translation for "${originalTitle}" still contains ` +
        `${postTranslationDiagnostics.s3Matches} Notion/S3 URLs.\n` +
        `Offending URLs: ${postTranslationDiagnostics.s3Samples.join(", ")}`
    );
  }
}
```

**Key design decisions:**

1. Image processing is inside the `else` branch (non-title pages only). Title pages set `translatedContent = \`# ${originalTitle}\`` and never use the markdown — running image processing for them would be wasted network calls.
2. `markdownContent` is now scoped to the `else` block via `const` (previously it was `const` at function scope). This is safe because it was only used inside the `else` branch anyway.
3. Post-translation validation (TASK-1.4) is co-located here for clarity. It runs inside the same `else` block, after `translateText()` returns.
4. `originalTitle` (defined at line 942) is reused — no new `getTitle()` call.
5. `chalk` is already imported at line 4.

**Dependencies:** TASK-1.1 (imports), TASK-1.2 (generateSafeFilename helper)
**Verification:** `bun run typecheck --noEmit` + new tests in TASK-3.x

---

### TASK-1.4: Post-translation validation (included in TASK-1.3)

This task is co-located within TASK-1.3's replacement code block. The validation logic is the final section of the `else` branch:

```typescript
const postTranslationDiagnostics = getImageDiagnostics(translatedContent);
if (postTranslationDiagnostics.s3Matches > 0) {
  throw new Error(
    `Translation for "${originalTitle}" still contains ` +
      `${postTranslationDiagnostics.s3Matches} Notion/S3 URLs.\n` +
      `Offending URLs: ${postTranslationDiagnostics.s3Samples.join(", ")}`
  );
}
```

**Behavior:** If OpenAI introduces or preserves S3 URLs in the translated output, the page fails with a diagnostic error listing the offending URLs. This is separate from the pre-translation `totalFailures` check — it catches a different failure mode (LLM mutation vs download failure).

---

## Phase 2: Translation Prompt Enhancement (Optional — P2)

### TASK-2.1: Add `/images/` path preservation instruction to prompt

**Action:** INSERT
**File:** `scripts/notion-translate/translateFrontMatter.ts`
**Location:** Inside `TRANSLATION_PROMPT` string, in the `## Constraints` section, after line 52 (`- **Do not translate or modify any image URLs.**`)

**Add this line:**

```
- **Do not modify any paths starting with `/images/` — these are canonical asset references that must remain unchanged.**
```

**Context:** The prompt already has 3 instructions about preserving image URLs (lines 44, 52, 63). This is defense in depth only. The post-translation validation in TASK-1.3 is the real safety net. This task is P2 priority and can be skipped if desired.

**Dependencies:** None
**Verification:** `bunx vitest run scripts/notion-translate/translateFrontMatter.test.ts`

---

## Phase 3: Testing

### Test file location

**File:** `scripts/notion-translate/imageStabilization.test.ts` (NEW)

> **Note:** Existing translation tests are at `scripts/notion-translate/*.test.ts` (flat directory, no `__tests__/` subfolder). Follow the existing convention.

---

### TASK-3.1: Create test file with mocking infrastructure

**Action:** CREATE
**File:** `scripts/notion-translate/imageStabilization.test.ts`

**Required mocks:**

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockNotionPage, installTestNotionEnv } from "../test-utils";

// Mock image processing functions
const mockProcessAndReplaceImages = vi.fn();
const mockGetImageDiagnostics = vi.fn();

vi.mock("../notion-fetch/imageReplacer", () => ({
  processAndReplaceImages: mockProcessAndReplaceImages,
  getImageDiagnostics: mockGetImageDiagnostics,
}));
```

Additional mocks needed (matching patterns from `index.test.ts` lines 4-68):

- `fs/promises` (mockWriteFile, mockMkdir, etc.)
- `../notionClient` (notion, DATABASE_ID, DATA_SOURCE_ID, n2m, enhancedNotion)
- `./translateFrontMatter` (translateText, TranslationError)
- `./translateCodeJson` (translateJson, extractTranslatableText, getLanguageName)
- `./markdownToNotion` (createNotionPageFromMarkdown)
- `../fetchNotionData.js` (fetchNotionData, sortAndExpandNotionData)

**Default mock return values for image processing:**

```typescript
// Default: successful image processing, no failures
mockProcessAndReplaceImages.mockResolvedValue({
  markdown: "# Hello\n\n![image](/images/test_0.png)\n\nContent",
  stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
  metrics: {
    totalProcessed: 1,
    skippedSmallSize: 0,
    skippedAlreadyOptimized: 0,
    skippedResize: 0,
    fullyProcessed: 1,
  },
});

// Default: no S3 URLs in translated content
mockGetImageDiagnostics.mockReturnValue({
  totalMatches: 1,
  markdownMatches: 1,
  htmlMatches: 0,
  s3Matches: 0,
  s3Samples: [],
});
```

---

### TASK-3.2: Test S3 URL rewriting

**Test:** Verify that `processAndReplaceImages` is called with the raw markdown from `convertPageToMarkdown`, and its output (with `/images/...` paths) is passed to `translateText`.

```typescript
it("should pass image-stabilized markdown to translateText", async () => {
  // Setup: n2m returns markdown with S3 URL
  mockN2m.toMarkdownString.mockReturnValue({
    parent:
      "![img](https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx/image.png)",
  });

  // Setup: processAndReplaceImages returns stabilized markdown
  mockProcessAndReplaceImages.mockResolvedValue({
    markdown: "![img](/images/test_0.png)",
    stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
    metrics: {
      totalProcessed: 1,
      skippedSmallSize: 0,
      skippedAlreadyOptimized: 0,
      skippedResize: 0,
      fullyProcessed: 1,
    },
  });

  // Run translation
  await runTranslation(); // helper that triggers processSinglePageTranslation

  // Assert: translateText received the stabilized markdown
  expect(mockTranslateText).toHaveBeenCalledWith(
    "![img](/images/test_0.png)",
    expect.any(String),
    expect.any(String)
  );
});
```

---

### TASK-3.3: Test image download failure handling

**Test:** Verify that when `processAndReplaceImages` returns `stats.totalFailures > 0`, the translation throws with a descriptive error.

```typescript
it("should throw when image download fails", async () => {
  mockProcessAndReplaceImages.mockResolvedValue({
    markdown: "<!-- Failed to download image -->",
    stats: { successfulImages: 0, totalFailures: 1, totalSaved: 0 },
    metrics: {
      totalProcessed: 1,
      skippedSmallSize: 0,
      skippedAlreadyOptimized: 0,
      skippedResize: 0,
      fullyProcessed: 0,
    },
  });

  await expect(runTranslation()).rejects.toThrow(/image.*failed to download/i);
  // translateText should NOT have been called
  expect(mockTranslateText).not.toHaveBeenCalled();
});
```

---

### TASK-3.4: Test post-translation S3 URL validation

**Test:** Verify that when `getImageDiagnostics` reports S3 URLs in translated content, the function throws.

```typescript
it("should throw when translated content still contains S3 URLs", async () => {
  mockProcessAndReplaceImages.mockResolvedValue({
    markdown: "![img](/images/test_0.png)",
    stats: { successfulImages: 1, totalFailures: 0, totalSaved: 1024 },
    metrics: {
      totalProcessed: 1,
      skippedSmallSize: 0,
      skippedAlreadyOptimized: 0,
      skippedResize: 0,
      fullyProcessed: 1,
    },
  });

  mockGetImageDiagnostics.mockReturnValue({
    totalMatches: 1,
    markdownMatches: 1,
    htmlMatches: 0,
    s3Matches: 1,
    s3Samples: ["https://prod-files-secure.s3.us-west-2.amazonaws.com/xxx"],
  });

  await expect(runTranslation()).rejects.toThrow(/Notion\/S3 URLs/);
});
```

---

### TASK-3.5: Test idempotency

**Test:** Markdown with only `/images/...` paths passes through `processAndReplaceImages` unchanged.

```typescript
it("should pass through already-stabilized content unchanged", async () => {
  const stableMarkdown = "![img](/images/existing_0.png)\n\nText content";
  mockN2m.toMarkdownString.mockReturnValue({ parent: stableMarkdown });

  mockProcessAndReplaceImages.mockResolvedValue({
    markdown: stableMarkdown, // unchanged
    stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
    metrics: {
      totalProcessed: 0,
      skippedSmallSize: 0,
      skippedAlreadyOptimized: 0,
      skippedResize: 0,
      fullyProcessed: 0,
    },
  });

  await runTranslation();
  expect(mockTranslateText).toHaveBeenCalledWith(
    stableMarkdown,
    expect.any(String),
    expect.any(String)
  );
});
```

---

### TASK-3.6: Test title page bypass

**Test:** Title pages skip image processing entirely.

```typescript
it("should skip image processing for title pages", async () => {
  const titlePage = createMockNotionPage({
    id: "title-page-1",
    title: "Section Title",
    status: "Ready for translation",
    language: "English",
    elementType: "title",
    parentItem: "parent-1",
    lastEdited: "2026-02-01T00:00:00.000Z",
  });

  // Setup with title page...
  await runTranslation(titlePage);

  expect(mockProcessAndReplaceImages).not.toHaveBeenCalled();
  expect(mockGetImageDiagnostics).not.toHaveBeenCalled();
});
```

---

### TASK-3.7: Test `generateSafeFilename` helper

Since `generateSafeFilename` is a module-private function, test it indirectly by verifying the `safeFilename` argument passed to `processAndReplaceImages`.

```typescript
describe("generateSafeFilename (via processAndReplaceImages call)", () => {
  it("should generate slug with page ID suffix", async () => {
    const page = createMockNotionPage({
      id: "abc-123-def",
      title: "Hello World",
      // ...
    });

    await runTranslation(page);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
      expect.any(String),
      "hello-world-abc123def" // slug + sanitized page ID
    );
  });

  it("should handle special characters in title", async () => {
    const page = createMockNotionPage({
      id: "page-id-1",
      title: "Héllo Wörld! @#$%",
      // ...
    });

    await runTranslation(page);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
      expect.any(String),
      "hllo-wrld-pageid1" // special chars stripped
    );
  });

  it("should use 'untitled' for empty title", async () => {
    const page = createMockNotionPage({
      id: "page-id-2",
      title: "",
      // ...
    });

    await runTranslation(page);

    expect(mockProcessAndReplaceImages).toHaveBeenCalledWith(
      expect.any(String),
      "untitled-pageid2"
    );
  });

  it("should truncate long titles to MAX_SLUG_LENGTH", async () => {
    const longTitle = "a".repeat(100);
    const page = createMockNotionPage({
      id: "page-id-3",
      title: longTitle,
      // ...
    });

    await runTranslation(page);

    const [, safeFilename] = mockProcessAndReplaceImages.mock.calls[0];
    const slugPart = safeFilename.split("-pageid3")[0];
    expect(slugPart.length).toBeLessThanOrEqual(50); // MAX_SLUG_LENGTH
  });
});
```

---

### TASK-3.8: Update existing test file to add imageReplacer mock

**Action:** MODIFY
**File:** `scripts/notion-translate/index.test.ts`
**Location:** After existing `vi.mock` blocks (after line 68)

**Add:**

```typescript
vi.mock("../notion-fetch/imageReplacer", () => ({
  processAndReplaceImages: vi.fn().mockResolvedValue({
    markdown: "# Hello\n\nEnglish markdown",
    stats: { successfulImages: 0, totalFailures: 0, totalSaved: 0 },
    metrics: {
      totalProcessed: 0,
      skippedSmallSize: 0,
      skippedAlreadyOptimized: 0,
      skippedResize: 0,
      fullyProcessed: 0,
    },
  }),
  getImageDiagnostics: vi.fn().mockReturnValue({
    totalMatches: 0,
    markdownMatches: 0,
    htmlMatches: 0,
    s3Matches: 0,
    s3Samples: [],
  }),
}));
```

**Why this is necessary:** After TASK-1.1 adds the import, the existing test file will fail at module resolution if `../notion-fetch/imageReplacer` is not mocked. The mock returns passthrough values (no images, no failures) to preserve existing test behavior.

**Verification:** `bunx vitest run scripts/notion-translate/index.test.ts` — all existing tests pass unchanged.

---

## Phase 4: Validation

### TASK-4.1: Lint modified files

```bash
bunx eslint scripts/notion-translate/index.ts scripts/notion-translate/imageStabilization.test.ts --fix
```

If TASK-2.1 was done:

```bash
bunx eslint scripts/notion-translate/translateFrontMatter.ts --fix
```

### TASK-4.2: Format modified files

```bash
bunx prettier --write scripts/notion-translate/index.ts scripts/notion-translate/imageStabilization.test.ts scripts/notion-translate/index.test.ts
```

If TASK-2.1 was done:

```bash
bunx prettier --write scripts/notion-translate/translateFrontMatter.ts
```

### TASK-4.3: Run all translation tests

```bash
bunx vitest run scripts/notion-translate/
```

**Expected:** All tests pass, including existing tests in `index.test.ts` (with the new mock from TASK-3.8).

### TASK-4.4: Typecheck

```bash
bun run typecheck --noEmit
```

**Expected:** Zero type errors. The imported functions have well-defined TypeScript signatures.

---

## Phase 5: Commit & Push

### TASK-5.1: Commit

```
feat(translate): stabilize image URLs before translation (#137)

Replace expiring Notion/S3 image URLs with stable /images/... paths
before sending markdown to OpenAI for translation. Fail page translation
if any images fail to download or if S3 URLs remain post-translation.

Closes #137
```

### TASK-5.2: Push and create PR

Link PR to issue #137. Reference the spec document in PR body.

---

## Files Changed Summary

| File                                                  | Action            | Tasks                                  |
| ----------------------------------------------------- | ----------------- | -------------------------------------- |
| `scripts/notion-translate/index.ts`                   | MODIFY            | TASK-1.1, TASK-1.2, TASK-1.3, TASK-1.4 |
| `scripts/notion-translate/translateFrontMatter.ts`    | MODIFY (optional) | TASK-2.1                               |
| `scripts/notion-translate/imageStabilization.test.ts` | CREATE            | TASK-3.1 through TASK-3.7              |
| `scripts/notion-translate/index.test.ts`              | MODIFY            | TASK-3.8                               |

## Reused Functions (DO NOT modify or reimplement)

| Function                  | Source File                             | Line | Signature                                                                     |
| ------------------------- | --------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| `processAndReplaceImages` | `scripts/notion-fetch/imageReplacer.ts` | 398  | `(markdown: string, safeFilename: string) => Promise<ImageReplacementResult>` |
| `getImageDiagnostics`     | `scripts/notion-fetch/imageReplacer.ts` | 833  | `(content: string) => ImageDiagnostics`                                       |

## Return Types Used

```typescript
// From imageReplacer.ts
interface ImageReplacementResult {
  markdown: string;
  stats: {
    successfulImages: number;
    totalFailures: number;
    totalSaved: number;
  };
  metrics: ImageProcessingMetrics;
}

// From imageReplacer.ts
interface ImageDiagnostics {
  totalMatches: number;
  markdownMatches: number;
  htmlMatches: number;
  s3Matches: number;
  s3Samples: string[];
}

// From imageProcessing.ts
interface ImageProcessingMetrics {
  totalProcessed: number;
  skippedSmallSize: number;
  skippedAlreadyOptimized: number;
  skippedResize: number;
  fullyProcessed: number;
}
```

## Invariants

After implementation, these must hold for all translated markdown output:

1. Zero Notion/S3 URL patterns in output
2. All image references use `/images/...` canonical paths
3. Re-running translation produces identical `/images/...` paths (deterministic filenames via page ID)
4. Title pages are unaffected (no image processing)
5. Image download failures cause page-level failure, never silent degradation

## Verification Commands (post-implementation)

```bash
# All translation tests pass
bunx vitest run scripts/notion-translate/

# Type safety
bun run typecheck --noEmit

# Lint clean
bunx eslint scripts/notion-translate/index.ts --fix

# Check for S3 URLs in translated output (should return empty)
grep -rE "amazonaws\.com|notion-static\.com|notion\.so/image|X-Amz-" i18n/*/docusaurus-plugin-content-docs/ || echo "PASS: No S3 URLs found"
```
