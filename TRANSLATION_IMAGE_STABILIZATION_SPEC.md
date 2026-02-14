# Translation Image Stabilization - Technical Specification

**Issue:** #137 - Notion translation pipeline: replace expiring Notion/S3 image URLs with canonical `/images/...` paths

**Last Updated:** 2025-01-13

---

## Problem Statement

The Notion translation workflow (`scripts/notion-translate/index.ts`) converts Notion pages to Markdown via `n2m.pageToMarkdown()` and translates using OpenAI. The resulting translated Markdown contains **expiring Notion/S3 image URLs** which break over time.

### Current Behavior

1. `convertPageToMarkdown(pageId)` generates markdown with expiring S3 URLs
2. Markdown with S3 URLs is sent to OpenAI for translation
3. Translated markdown still contains S3 URLs (or potentially mutated URLs)
4. URLs expire after ~1 hour, breaking images in translated docs

### Expected Behavior

1. All translated Markdown should reference stable canonical images at `/images/...`
2. Translation may download/cache images as needed (using the same `static/images/` cache), not only during English fetch
3. Translations should reuse EN images by default (no duplication per language)
4. Localized Notion pages may intentionally use different images; these must also be rewritten to stable `/images/...` paths

---

## Technical Analysis

### Current Translation Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    processPageTranslation()                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. convertPageToMarkdown(pageId)                                   │
│     └── n2m.pageToMarkdown() → Markdown with S3 URLs 🔴             │
│                                                                     │
│  2. translateText(markdown, title, language)                        │
│     └── OpenAI API → Translated markdown (still has S3 URLs) 🔴    │
│                                                                     │
│  3. saveTranslatedContentToDisk()                                   │
│     └── Saves markdown with expiring URLs 🔴                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Proposed Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    processPageTranslation()                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. selectMarkdownSourceForImages(englishPage, targetLanguage) ✅   │
│     └── If localized Notion page exists → use its markdown          │
│     └── Otherwise → use EN markdown (default reuse)                 │
│                                                                     │
│  2. convertPageToMarkdown(selectedPageId)                           │
│     └── n2m.pageToMarkdown() → Markdown with S3 URLs                │
│                                                                     │
│  3. processAndReplaceImages(markdown, safeFilename) ✅ NEW          │
│     └── Downloads images → Rewrites to /images/... paths            │
│                                                                     │
│  4. translateText(stabilizedMarkdown, title, language)              │
│     └── OpenAI API → Translated markdown with /images/... paths ✅  │
│                                                                     │
│  5. validateAndFixRemainingImages(translated, safeFilename) ✅ NEW  │
│     └── Validates no S3 URLs remain; fails page if validation fails │
│                                                                     │
│  6. saveTranslatedContentToDisk()                                   │
│     └── Saves markdown with stable /images/... paths ✅             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Image Source Precedence Rules

1. **Language page image wins**: If the localized Notion page contains an image block, that image is used (downloaded and rewritten to `/images/...`), even if EN has a different image at the same position.

2. **EN fallback**: If the localized Notion page does not include an override (no translated page exists, or the image block was not modified), the EN image reference remains.

---

## Key Code Locations

### Translation Pipeline

| File | Location | Function | Purpose |
|------|----------|----------|---------|
| `scripts/notion-translate/index.ts` | Line 541-549 | `convertPageToMarkdown()` | Converts Notion page to markdown |
| `scripts/notion-translate/index.ts` | Line 949 | (in `processPageTranslation`) | Where markdown is generated |
| `scripts/notion-translate/index.ts` | Line 961-966 | `translateText()` call | Where translation happens |
| `scripts/notion-translate/index.ts` | Line 562-620 | `saveTranslatedContentToDisk()` | Generates slug, saves file |
| `scripts/notion-translate/translateFrontMatter.ts` | Line 26-72 | `TRANSLATION_PROMPT` | OpenAI prompt template |

### Image Processing (to be integrated)

| File | Location | Function | Purpose |
|------|----------|----------|---------|
| `scripts/notion-fetch/imageReplacer.ts` | Line 398-519 | `processAndReplaceImages()` | Main image processing function |
| `scripts/notion-fetch/imageReplacer.ts` | Line 858-890 | `validateAndFixRemainingImages()` | Safety net for remaining S3 URLs |
| `scripts/notion-fetch/imageReplacer.ts` | Line 719 | `hasS3Urls()` | Check if content has S3 URLs |
| `scripts/notion-fetch/imageReplacer.ts` | Line 833 | `getImageDiagnostics()` | Get image URL diagnostics |

---

## Per-Language Image Overrides (Intentional Localized Screenshots)

### Default vs Override Behavior

| Scenario | Behavior |
|----------|----------|
| **Default** | Translated pages reuse canonical EN images (`/images/...`). No image download needed if EN already processed. |
| **Override** | Translators can intentionally use a different image (e.g., localized UI screenshot) by inserting/replacing the image in the translated Notion page. The pipeline will download and rewrite that new image to a stable `/images/...` path. |

### How Overrides Work

Overrides are done by placing a normal image block in the translated Notion page (or `<img>` tag), **not** by manually editing URLs in markdown files.

The pipeline detects localized images automatically:
1. If a translated Notion page exists for the target language, its markdown is used for image processing
2. Any Notion/S3 URLs in that markdown are downloaded and rewritten to `/images/...`
3. The existing `static/images/` cache and naming conventions are reused (no per-language folders)

### How to Override an Image

**For translators/content editors:**

To use a localized screenshot instead of the English one:
1. Open the translated Notion page for your language
2. Replace the image block with your localized screenshot
3. Run the translation pipeline — the new image will be downloaded and stabilized automatically

**Before (EN image reused):**
```markdown
![Settings screen](/images/settings_0.png)
```

**After (localized PT image):**
```markdown
![Tela de configurações](/images/teladeconfiguracoes_0.png)
```

Both paths are stable `/images/...` references that won't expire.

---

## Function Contracts

### `processAndReplaceImages(markdown, safeFilename)`

**Input:**
- `markdown: string` — Source markdown content (may contain Notion/S3 URLs)
- `safeFilename: string` — Safe filename prefix for downloaded images

**Output:** `Promise<ImageReplacementResult>`
```typescript
interface ImageReplacementResult {
  markdown: string;           // Processed markdown with /images/... paths
  stats: {
    successfulImages: number;
    totalFailures: number;
    totalSaved: number;
  };
  metrics: ImageProcessingMetrics;
}
```

### `validateAndFixRemainingImages(markdown, safeFilename)`

**Input:**
- `markdown: string` — Markdown to validate (post-translation)
- `safeFilename: string` — Safe filename prefix for logging

**Output:** `Promise<string>` — Validated/fixed markdown

**Behavior:** If any Notion/S3 URLs remain after validation, **fail translation for that page** and print diagnostics (page + offending URLs). Do not use placeholder fallbacks.

---

## Implementation Design

### 1. Reuse Existing Safe Filename Logic

Extract the exact slug/safe filename logic currently used in `saveTranslatedContentToDisk()` into a shared helper function. Do not change slug semantics; reuse existing logic to avoid filename churn.

**Location:** `scripts/notion-translate/index.ts`

```typescript
// Extract existing logic from saveTranslatedContentToDisk() into reusable helper
// (same file or small util module)
function generateSafeSlug(title: string): string {
  // Reuse EXACT logic from saveTranslatedContentToDisk - do not modify
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, MAX_SLUG_LENGTH) || "untitled";
}
```

### 2. Modify processPageTranslation Function

**Location:** `scripts/notion-translate/index.ts`, around line 949

**Before:**
```typescript
// Convert English page to markdown
const markdownContent = await convertPageToMarkdown(englishPage.id);
```

**After:**
```typescript
// Select markdown source: use localized page if exists (for image overrides), else EN
const imageSourcePageId = translationPage?.id ?? englishPage.id;
const rawMarkdownContent = await convertPageToMarkdown(imageSourcePageId);

// Stabilize images: replace S3 URLs with /images/... paths
const title = getTitle(englishPage);
const safeFilename = generateSafeSlug(title);
const imageResult = await processAndReplaceImages(rawMarkdownContent, safeFilename);
const markdownContent = imageResult.markdown;

// Single diagnostic line per page
console.log(
  chalk.blue(
    `  Images: processed=${imageResult.stats.successfulImages} reused=${imageResult.metrics.skippedSmallSize} failed=${imageResult.stats.totalFailures}`
  )
);
```

### 3. Add Post-Translation Validation

**Location:** After translation, before saving to disk

Validation must catch:
- Any remaining Notion/S3 URLs
- Any modification of canonical `/images/...` paths (encoding changes, locale prefix insertion, spacing normalization, etc.)

If validation fails, **fail the page translation with diagnostics** — do not silently continue.

```typescript
// Validate: no S3 URLs remain, canonical paths preserved
const diagnostics = getImageDiagnostics(translatedContent);
if (diagnostics.s3Matches > 0) {
  throw new Error(
    `Translation failed for "${title}": ${diagnostics.s3Matches} Notion/S3 URLs remain.\n` +
    `Offending URLs: ${diagnostics.s3Samples.join(", ")}`
  );
}
```

### 4. Update Translation Prompt

**Location:** `scripts/notion-translate/translateFrontMatter.ts`

**Add to constraints section:**
```
- **Do not modify any paths starting with `/images/` - these are canonical asset references that must remain unchanged.**
```

---

## Imports Required

Add to `scripts/notion-translate/index.ts`:

```typescript
import {
  processAndReplaceImages,
  validateAndFixRemainingImages,
  getImageDiagnostics,
} from "../notion-fetch/imageReplacer.js";
```

---

## Invariants

The following invariants must hold for all translated markdown output:

1. **Zero Notion/S3 URL patterns** — No URLs matching expiring patterns (see Appendix)
2. **Only `/images/...` paths for images** — All image references use canonical static paths
3. **Deterministic filenames** — Re-running translation produces identical `/images/...` paths

### Verification Commands

```bash
# Check for ANY expiring URLs (should return empty)
grep -rE "amazonaws\.com|notion-static\.com|notion\.so/image|X-Amz-" i18n/*/docusaurus-plugin-content-docs/

# Check image references are canonical (should show /images/... only)
grep -rE "!\[.*\]\(" i18n/*/docusaurus-plugin-content-docs/ | grep -v "/images/"
# Should return empty
```

---

## Testing Requirements

### General Testing Rules

- **Mock network fetch and filesystem writes** used by image processing; tests must not hit real Notion/S3
- Tests must be fast and deterministic

### Unit Tests

Create `scripts/notion-translate/__tests__/imageStabilization.test.ts`:

1. **S3 URL Rewriting**
   - Test that markdown with Notion/S3 URLs is rewritten to `/images/...`
   - Covers all S3 URL patterns from acceptance criteria

2. **Translation Preservation**
   - Test that `/images/...` paths survive translation
   - Mock OpenAI response to verify path preservation

3. **HTML Image Support**
   - Test `<img src="...">` tags are handled correctly
   - Verify both markdown and HTML image syntax work

4. **Idempotency**
   - Test re-running doesn't cause churn
   - Already-processed content should remain unchanged

5. **Per-Language Image Overrides**
   - Test: EN markdown references image A, localized markdown references image B (Notion URL)
   - Result: uses image B rewritten to `/images/...`
   - Confirm EN fallback remains unchanged when no override exists

### Integration Tests

1. **Full Pipeline Test**
   - Mock Notion API and OpenAI API
   - Verify end-to-end flow produces stable URLs

2. **Edge Cases**
   - Empty markdown
   - Markdown with no images
   - Markdown with mixed stable/unstable URLs

### Test Patterns to Verify

```typescript
// Should detect and replace these URLs:
const S3_URL_PATTERNS = [
  "https://secure.notion-static.com/...",
  "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/...",
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/...",
  "https://www.notion.so/image/...",
  "...?X-Amz-Algorithm=...&X-Amz-Signature=...",
];

// Should preserve these URLs:
const STABLE_URL_PATTERNS = [
  "/images/example.png",
  "/images/intro/screenshot.jpg",
];
```

---

## Acceptance Criteria

From issue #137:

- [ ] After running `bun scripts/notion-translate`, translated markdown contains **zero** URLs matching:
  - `secure.notion-static.com`
  - `notion-static.com`
  - `amazonaws.com`
  - `X-Amz-` params
  - `www.notion.so/image/`
- [ ] Images in translated pages reference `/images/<filename>` and resolve at build time
- [ ] Images are not duplicated per language (translations reuse shared `/images` assets)
- [ ] Works for both Markdown image syntax (`![alt](...)`) and inline HTML (`<img src="...">`)
- [ ] Idempotent: re-running translation does not cause churn in image links
- [ ] Localized Notion pages may intentionally use different images; these must also be rewritten to stable `/images/...` paths (no Notion/S3 URLs)

---

## Risks and Mitigations

### Risk 1: Image Download Failures

**Risk:** Network issues could cause image downloads to fail, leaving S3 URLs in place.

**Mitigation:**
- `processAndReplaceImages()` has built-in retry logic
- If any Notion/S3 URLs remain after validation, **fail translation for that page** and print diagnostics
- Do not use placeholder fallbacks — deterministic failure is preferred over silent degradation

### Risk 2: OpenAI Mutating Image Paths

**Risk:** OpenAI might still modify `/images/...` paths despite prompt instructions.

**Mitigation:**
- Process images BEFORE translation (paths are less likely to look "translateable")
- Enhanced prompt with explicit instruction about `/images/` paths
- `validateAndFixRemainingImages()` post-translation validation

### Risk 3: Performance Impact

**Risk:** Image processing adds time to each translation.

**Mitigation:**
- Images are downloaded once and reused across languages
- Existing caching in image pipeline reduces redundant downloads
- Can be parallelized with translation if needed

### Risk 4: Duplicate Image Downloads

**Risk:** Same images could be downloaded multiple times if English fetch already processed them.

**Mitigation:**
- Image cache in `static/images/` prevents re-downloading existing images
- `processAndReplaceImages()` checks for existing files before downloading
- Content-based filenames ensure deduplication

---

## Implementation Plan

### Phase 1: Core Integration (P0)

| Task | Description | File(s) |
|------|-------------|---------|
| 1.1 | Add imports for image processing functions | `scripts/notion-translate/index.ts` |
| 1.2 | Extract shared slug helper from `saveTranslatedContentToDisk()` | `scripts/notion-translate/index.ts` |
| 1.3 | Add language-aware image source selection | `scripts/notion-translate/index.ts` |
| 1.4 | Add image processing before translation | `scripts/notion-translate/index.ts` |
| 1.5 | Add post-translation validation (fail on S3 URLs) | `scripts/notion-translate/index.ts` |

**Implementation Details:**

```typescript
// Task 1.1: Add imports (at top of file)
import {
  processAndReplaceImages,
  getImageDiagnostics,
} from "../notion-fetch/imageReplacer.js";

// Task 1.2: Extract existing slug logic into reusable helper
// Do NOT change slug semantics - reuse exact logic from saveTranslatedContentToDisk()

// Task 1.3-1.5: See "Modify processPageTranslation Function" section
```

---

### Phase 2: Translation Prompt Enhancement (P1)

| Task | Description | File(s) |
|------|-------------|---------|
| 2.1 | Add explicit `/images/` path preservation instruction | `scripts/notion-translate/translateFrontMatter.ts` |

**Implementation Details:**

Update `TRANSLATION_PROMPT` at line ~44 in constraints section:
```
- **Do not modify any paths starting with `/images/` - these are canonical asset references that must remain unchanged.**
```

---

### Phase 3: Testing (P0)

| Task | Description | File(s) |
|------|-------------|---------|
| 3.1 | Create image stabilization test file | `scripts/notion-translate/__tests__/imageStabilization.test.ts` |
| 3.2 | Test S3 URL detection and replacement | Same |
| 3.3 | Test `/images/` path preservation | Same |
| 3.4 | Test HTML image tag handling | Same |
| 3.5 | Test idempotency | Same |
| 3.6 | Test per-language image overrides | Same |
| 3.7 | Update existing translation tests if needed | `scripts/notion-translate/index.test.ts` |

**Test File Structure:**

```typescript
// scripts/notion-translate/__tests__/imageStabilization.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Translation Image Stabilization", () => {
  describe("S3 URL Detection", () => {
    it("should detect secure.notion-static.com URLs", ...);
    it("should detect amazonaws.com URLs", ...);
    it("should detect notion.so/image proxy URLs", ...);
    it("should detect URLs with X-Amz params", ...);
  });

  describe("Image Replacement", () => {
    it("should replace S3 URLs with /images/... paths", ...);
    it("should handle markdown image syntax", ...);
    it("should handle HTML img tags", ...);
  });

  describe("Translation Preservation", () => {
    it("should preserve /images/... paths through translation", ...);
  });

  describe("Idempotency", () => {
    it("should not modify already-processed content", ...);
  });

  describe("Per-Language Image Overrides", () => {
    it("should use localized image when override exists", ...);
    // EN references imageA, localized references imageB (Notion URL)
    // Result: imageB rewritten to /images/...
    
    it("should fallback to EN image when no override exists", ...);
  });
});
```

---

### Phase 4: Validation (P1)

| Task | Description | File(s) |
|------|-------------|---------|
| 4.1 | Run lint on modified files | CLI |
| 4.2 | Run format on modified files | CLI |
| 4.3 | Run existing tests to verify no regressions | CLI |
| 4.4 | Manual testing with sample translation | CLI |

---

### Phase 5: PR Creation

| Task | Description |
|------|-------------|
| 5.1 | Create feature branch |
| 5.2 | Commit changes with conventional commit |
| 5.3 | Push and create PR |
| 5.4 | Link PR to issue #137 |

---

### Task Dependencies

```
Phase 1 (Core) ─────────────────┐
                                ├──► Phase 3 (Testing)
Phase 2 (Prompt) ───────────────┘
                                         │
                                         ▼
                                Phase 4 (Validation)
                                         │
                                         ▼
                                Phase 5 (PR)
```

---

### Rollback Strategy

If issues are discovered after deployment:

1. **Quick Fix:** Temporarily disable image processing in translation by commenting out the integration code
2. **Feature Flag:** Could add `ENABLE_TRANSLATION_IMAGE_STABILIZATION` env var if needed
3. **Full Rollback:** Revert the PR

**Note:** This change affects new runs only. No migration of existing translated content is performed.

---

### Success Metrics

After implementation, verify:

1. **Zero S3 URLs in output:**
   ```bash
   grep -rE "amazonaws\.com|notion-static\.com|notion\.so/image|X-Amz-" i18n/*/docusaurus-plugin-content-docs/
   # Should return empty
   ```

2. **Stable image paths:**
   ```bash
   grep -r "/images/" i18n/*/docusaurus-plugin-content-docs/ | head -20
   # Should show /images/... references
   ```

3. **Build success:**
   ```bash
   bun run build
   # Should complete without broken image errors
   ```

---

## Out of Scope

1. **No retroactive fixing of existing translations** — Only new translation runs will use this flow; no migration work
2. **Image optimization changes** — Existing compression/optimization logic unchanged
3. **Notion API changes** — No changes to how we fetch from Notion
4. **Per-language image folders** — Reuse existing `static/images/` and naming conventions; no new per-language storage system
5. **New image mapping/registry system** — Reuse existing image replacer functions from notion-fetch pipeline

---

## Related Documentation

- **IMAGE_URL_EXPIRATION_SPEC.md** - Details on S3 URL expiration handling
- **NOTION_FETCH_ARCHITECTURE.md** - Overall fetch architecture
- **context/development/roadmap.md** - Project roadmap

---

## Appendix: S3 URL Detection Patterns

From `scripts/notion-fetch/imageReplacer.ts`:

```typescript
// Patterns that indicate expiring S3 URLs
const PROD_FILES_S3_REGEX =
  /https:\/\/prod-files-secure\.s3\.[a-z0-9-]+\.amazonaws\.com\//i;
const SECURE_NOTION_STATIC_S3_REGEX =
  /https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/secure\.notion-static\.com\//i;
const AMAZON_S3_SIGNED_REGEX =
  /https?:\/\/[\w.-]*amazonaws\.com[^\s)"']*(?:X-Amz-Algorithm|X-Amz-Expires)[^\s)"']*/i;
const NOTION_IMAGE_PROXY_REGEX =
  /https:\/\/www\.notion\.so\/image\/[^\s)"']+/i;
```
