# Translation Image Stabilization - Technical Specification

**Issue:** #137 - Notion translation pipeline: replace expiring Notion/S3 image URLs with canonical `/images/...` paths

**Last Updated:** 2026-02-14

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
│                    processSinglePageTranslation()                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. convertPageToMarkdown(englishPage.id)                           │
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
│                    processSinglePageTranslation()                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. convertPageToMarkdown(englishPage.id)                           │
│     └── n2m.pageToMarkdown() → Markdown with S3 URLs                │
│                                                                     │
│  2. processAndReplaceImages(markdown, safeFilename) ✅ NEW          │
│     └── Downloads images → Rewrites to /images/... paths            │
│     └── On download failure → fails page (no placeholder fallback)  │
│                                                                     │
│  3. translateText(stabilizedMarkdown, title, language)              │
│     └── OpenAI API → Translated markdown with /images/... paths ✅  │
│                                                                     │
│  4. getImageDiagnostics(translated) + throw on S3 URLs ✅ NEW      │
│     └── Validates no S3 URLs remain; fails page if validation fails │
│                                                                     │
│  5. saveTranslatedContentToDisk()                                   │
│     └── Saves markdown with stable /images/... paths ✅             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

> **Note on per-language image overrides:** The current translation pipeline always uses `englishPage.id` for markdown generation. The `translationPage` parameter exists but is only used for Notion page creation/update. Supporting localized image overrides (using a translated Notion page's images instead of EN) would require additional logic to determine when a localized page has intentionally different images. This is documented in the "Per-Language Image Overrides" section below as a future enhancement, not part of the initial implementation.

### Image Source Rules

**Initial implementation:** All translations use the English page's markdown for image processing. Images from the EN page are downloaded, stabilized to `/images/...` paths, and then the stabilized markdown is translated.

**Future enhancement (per-language overrides):** If a localized Notion page intentionally uses different images (e.g., localized UI screenshots), those images should also be downloaded and rewritten to `/images/...`. This requires:

1. Logic to detect when a localized Notion page exists and has different image blocks
2. Selecting the localized page's markdown for image processing instead of EN
3. This is out of scope for the initial implementation — see "Per-Language Image Overrides" section below

---

## Key Code Locations

### Translation Pipeline

| File                                               | Location     | Function                            | Purpose                          |
| -------------------------------------------------- | ------------ | ----------------------------------- | -------------------------------- |
| `scripts/notion-translate/index.ts`                | Line 541-549 | `convertPageToMarkdown()`           | Converts Notion page to markdown |
| `scripts/notion-translate/index.ts`                | Line 949     | (in `processSinglePageTranslation`) | Where markdown is generated      |
| `scripts/notion-translate/index.ts`                | Line 961-966 | `translateText()` call              | Where translation happens        |
| `scripts/notion-translate/index.ts`                | Line 562-620 | `saveTranslatedContentToDisk()`     | Generates slug, saves file       |
| `scripts/notion-translate/translateFrontMatter.ts` | Line 26-72   | `TRANSLATION_PROMPT`                | OpenAI prompt template           |

### Image Processing (to be integrated)

| File                                    | Location     | Function                          | Purpose                                                       |
| --------------------------------------- | ------------ | --------------------------------- | ------------------------------------------------------------- |
| `scripts/notion-fetch/imageReplacer.ts` | Line 398-519 | `processAndReplaceImages()`       | Main image processing function                                |
| `scripts/notion-fetch/imageReplacer.ts` | Line 858-890 | `validateAndFixRemainingImages()` | Safety net for remaining S3 URLs (warns only, does NOT throw) |
| `scripts/notion-fetch/imageReplacer.ts` | Line 719     | `hasS3Urls()`                     | Check if content has S3 URLs                                  |
| `scripts/notion-fetch/imageReplacer.ts` | Line 833     | `getImageDiagnostics()`           | Get image URL diagnostics                                     |

---

## Per-Language Image Overrides (Future Enhancement)

> **Status:** Not part of the initial implementation. Documented here for future reference.

### Default Behavior (Initial Implementation)

All translated pages reuse canonical EN images (`/images/...`). No image download needed if EN already processed the images.

### Override Behavior (Future)

| Scenario     | Behavior                                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Default**  | Translated pages reuse canonical EN images (`/images/...`). No image download needed if EN already processed.                                                                                                                                |
| **Override** | Translators could intentionally use a different image (e.g., localized UI screenshot) by inserting/replacing the image in the translated Notion page. The pipeline would download and rewrite that new image to a stable `/images/...` path. |

### How Overrides Would Work (Future)

Overrides would be done by placing a normal image block in the translated Notion page (or `<img>` tag), **not** by manually editing URLs in markdown files.

The pipeline would need to:

1. Check if a translated Notion page exists for the target language
2. Compare image blocks between EN and localized pages
3. Download localized images and rewrite to `/images/...`
4. The existing `static/images/` cache and naming conventions would be reused (no per-language folders)

### Example

**Before (EN image reused):**

```markdown
![Settings screen](/images/settings_0.png)
```

**After (localized PT image, future):**

```markdown
![Tela de configurações](/images/teladeconfiguracoes_0.png)
```

Both paths would be stable `/images/...` references that won't expire.

---

## Function Contracts

### `processAndReplaceImages(markdown, safeFilename)`

**Input:**

- `markdown: string` — Source markdown content (may contain Notion/S3 URLs)
- `safeFilename: string` — Safe filename prefix for downloaded images

**Output:** `Promise<ImageReplacementResult>`

```typescript
interface ImageReplacementResult {
  markdown: string; // Processed markdown with /images/... paths
  stats: {
    successfulImages: number;
    totalFailures: number;
    totalSaved: number;
  };
  metrics: ImageProcessingMetrics;
}
```

### `getImageDiagnostics(content)` (used for post-translation validation)

**Input:**

- `content: string` — Markdown content to check

**Output:** `ImageDiagnostics`

```typescript
interface ImageDiagnostics {
  totalMatches: number;
  markdownMatches: number;
  htmlMatches: number;
  s3Matches: number;
  s3Samples: string[]; // Up to 5 sample S3 URLs found
}
```

**Usage in translation:** After translation, call `getImageDiagnostics(translatedContent)`. If `s3Matches > 0`, **throw an error** to fail the page translation with diagnostics. This is custom validation logic in the translation pipeline — not a behavior of `getImageDiagnostics` itself.

> **Note on `validateAndFixRemainingImages`:** This existing function in `imageReplacer.ts:858-890` re-runs `processAndReplaceImages` and **warns** but never throws. It is designed for the EN fetch pipeline's "best effort" approach. For translation, we need stricter behavior (fail on any remaining S3 URLs), so we use `getImageDiagnostics` + `throw` instead.

### `createFallbackImageMarkdown` (behavior to override for translation)

**Current behavior in EN fetch:** When an image download fails, `processAndReplaceImages` calls `createFallbackImageMarkdown` which produces:

```
<!-- Failed to download image: {url} -->
**[Image N: alt]** *(Image failed to download)*
```

This removes the S3 URL (so S3 validation would pass) but produces a broken image reference.

**Required behavior for translation:** If `processAndReplaceImages` reports any `totalFailures > 0`, the translation pipeline must **fail the page** rather than accepting the fallback placeholders. Check `imageResult.stats.totalFailures > 0` and throw before proceeding to translation.

---

## Implementation Design

### 1. Reuse Existing Safe Filename Logic

Extract the exact slug/safe filename logic currently used in `saveTranslatedContentToDisk()` into a shared helper function. Do not change slug semantics; reuse existing logic to avoid filename churn.

**Location:** `scripts/notion-translate/index.ts`

The actual slug logic at `saveTranslatedContentToDisk:571-580` builds a deterministic name from both the title slug AND the stable page ID:

```typescript
// Extract existing logic from saveTranslatedContentToDisk() into reusable helper
// MUST include the page ID component for deterministic, idempotent filenames
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

> **Important:** The spec originally showed a simplified version that omitted the page ID suffix. The page ID is critical for deterministic, collision-free filenames. Without it, two pages with the same title would produce the same image filenames.

### 2. Modify processSinglePageTranslation Function

**Location:** `scripts/notion-translate/index.ts`, around line 949

**Before:**

```typescript
// Convert English page to markdown
const markdownContent = await convertPageToMarkdown(englishPage.id);
```

**After:**

```typescript
// Convert English page to markdown (always uses EN page for initial implementation)
const rawMarkdownContent = await convertPageToMarkdown(englishPage.id);

// Stabilize images: replace S3 URLs with /images/... paths
const title = getTitle(englishPage);
const safeFilename = generateSafeFilename(title, englishPage.id);
const imageResult = await processAndReplaceImages(
  rawMarkdownContent,
  safeFilename
);

// Fail page if any images failed to download (no broken placeholders in translations)
if (imageResult.stats.totalFailures > 0) {
  throw new Error(
    `Image stabilization failed for "${title}": ${imageResult.stats.totalFailures} image(s) failed to download. ` +
      `Cannot proceed with translation — images would be broken.`
  );
}

const markdownContent = imageResult.markdown;

// Single diagnostic line per page (only if images were processed)
if (imageResult.stats.successfulImages > 0) {
  console.log(
    chalk.blue(
      `  Images: processed=${imageResult.stats.successfulImages} failed=${imageResult.stats.totalFailures}`
    )
  );
}
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

### 4. Update Translation Prompt (Optional — Defense in Depth)

**Location:** `scripts/notion-translate/translateFrontMatter.ts`

The prompt already contains two instructions about preserving image URLs:

- Line 44: "Any image URL... must be maintained exactly as in the original markdown"
- Line 52: "Do not translate or modify any image URLs"
- Line 63: "Ensure all image URLs remain exactly as in the original markdown"

Since images are processed BEFORE translation, OpenAI will see `/images/...` paths rather than S3 URLs. The existing prompt instructions cover this case. However, for defense in depth, consider adding to the constraints section:

```
- **Do not modify any paths starting with `/images/` - these are canonical asset references that must remain unchanged.**
```

> **Note:** This is P2 priority. The existing prompt instructions are sufficient; the post-translation validation (step 3) is the real safety net.

---

## Imports Required

Add to `scripts/notion-translate/index.ts`:

```typescript
import {
  processAndReplaceImages,
  getImageDiagnostics,
} from "../notion-fetch/imageReplacer.js";
```

> **Note:** `validateAndFixRemainingImages` is NOT imported. That function only warns; we need stricter behavior (throw on failure). We use `getImageDiagnostics` + custom throw logic instead.

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

5. **Image Download Failure Handling**
   - Test that `totalFailures > 0` causes translation to fail (throws)
   - Verify no placeholder fallbacks are accepted in translation context
   - Confirm error message includes page title and failure count

### Integration Tests

1. **Full Pipeline Test**
   - Mock Notion API and OpenAI API
   - Verify end-to-end flow produces stable URLs

2. **Edge Cases**
   - Empty markdown
   - Markdown with no images
   - Markdown with mixed stable/unstable URLs
   - Markdown with only already-stable `/images/...` paths (should be a no-op)

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
  - Notion-family S3 URLs:
    - `prod-files-secure.s3.*.amazonaws.com` (Notion's secure files bucket)
    - `s3.*.amazonaws.com/secure.notion-static.com` (Notion's static content)
  - Signed AWS URLs with `X-Amz-*` params (any amazonaws.com domain)
  - `www.notion.so/image/`
- [ ] Images in translated pages reference `/images/<filename>` and resolve at build time
- [ ] Images are not duplicated per language (translations reuse shared `/images` assets)
- [ ] Works for both Markdown image syntax (`![alt](...)`) and inline HTML (`<img src="...">`)
- [ ] Idempotent: re-running translation does not cause churn in image links
- [ ] Localized Notion pages may intentionally use different images; these must also be rewritten to stable `/images/...` paths (no Notion/S3 URLs) — **deferred to future enhancement; initial implementation uses EN images only**
- [ ] If any image fails to download, the page translation fails with a diagnostic error (no broken placeholder images)

---

## Risks and Mitigations

### Risk 1: Image Download Failures

**Risk:** Network issues could cause image downloads to fail. The existing `processAndReplaceImages()` replaces failed images with placeholder text (`<!-- Failed to download image -->` + `**[Image N: alt]** *(Image failed to download)*`). This removes S3 URLs (so S3 validation passes) but produces broken images.

**Mitigation:**

- `processAndReplaceImages()` has built-in retry logic (3 attempts per image)
- After image processing, check `imageResult.stats.totalFailures > 0` — if any images failed, **fail the page translation** before sending to OpenAI
- Do not accept placeholder fallbacks — deterministic failure is preferred over silent degradation
- The `getImageDiagnostics` post-translation check is a second safety net for any S3 URLs that OpenAI might re-introduce

### Risk 2: OpenAI Mutating Image Paths

**Risk:** OpenAI might still modify `/images/...` paths despite prompt instructions.

**Mitigation:**

- Process images BEFORE translation (paths are less likely to look "translateable")
- Enhanced prompt with explicit instruction about `/images/` paths
- `getImageDiagnostics()` + throw for post-translation validation

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

| Task | Description                                                         | File(s)                             |
| ---- | ------------------------------------------------------------------- | ----------------------------------- |
| 1.1  | Add imports for image processing functions                          | `scripts/notion-translate/index.ts` |
| 1.2  | Extract shared filename helper from `saveTranslatedContentToDisk()` | `scripts/notion-translate/index.ts` |
| 1.3  | Add image processing before translation with failure check          | `scripts/notion-translate/index.ts` |
| 1.4  | Add post-translation validation (fail on S3 URLs)                   | `scripts/notion-translate/index.ts` |

**Implementation Details:**

```typescript
// Task 1.1: Add imports (at top of file)
import {
  processAndReplaceImages,
  getImageDiagnostics,
} from "../notion-fetch/imageReplacer.js";

// Task 1.2: Extract existing filename logic into reusable helper
// MUST include page ID suffix - see "Reuse Existing Safe Filename Logic" section
// Do NOT change slug semantics - reuse exact logic from saveTranslatedContentToDisk()

// Task 1.3-1.4: See "Modify processSinglePageTranslation Function" section
```

---

### Phase 2: Translation Prompt Enhancement (P2 — Optional)

| Task | Description                                           | File(s)                                            |
| ---- | ----------------------------------------------------- | -------------------------------------------------- |
| 2.1  | Add explicit `/images/` path preservation instruction | `scripts/notion-translate/translateFrontMatter.ts` |

The prompt already has three instructions about preserving image URLs. This is defense in depth only. The post-translation validation is the real safety net.

**Implementation Details:**

Update `TRANSLATION_PROMPT` at line ~52 in constraints section:

```
- **Do not modify any paths starting with `/images/` - these are canonical asset references that must remain unchanged.**
```

---

### Phase 3: Testing (P0)

| Task | Description                                 | File(s)                                                         |
| ---- | ------------------------------------------- | --------------------------------------------------------------- |
| 3.1  | Create image stabilization test file        | `scripts/notion-translate/__tests__/imageStabilization.test.ts` |
| 3.2  | Test S3 URL detection and replacement       | Same                                                            |
| 3.3  | Test `/images/` path preservation           | Same                                                            |
| 3.4  | Test HTML image tag handling                | Same                                                            |
| 3.5  | Test idempotency                            | Same                                                            |
| 3.6  | Test title page bypass                      | Same                                                            |
| 3.7  | Update existing translation tests if needed | `scripts/notion-translate/index.test.ts`                        |

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
});
```

---

### Phase 4: Validation (P1)

| Task | Description                                 | File(s) |
| ---- | ------------------------------------------- | ------- |
| 4.1  | Run lint on modified files                  | CLI     |
| 4.2  | Run format on modified files                | CLI     |
| 4.3  | Run existing tests to verify no regressions | CLI     |
| 4.4  | Manual testing with sample translation      | CLI     |

---

### Phase 5: PR Creation

| Task | Description                             |
| ---- | --------------------------------------- |
| 5.1  | Create feature branch                   |
| 5.2  | Commit changes with conventional commit |
| 5.3  | Push and create PR                      |
| 5.4  | Link PR to issue #137                   |

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

## Prerequisites

- **EN fetch recommended first:** For best performance, run `bun scripts/notion-fetch` before translation. EN images are downloaded once to `static/images/`; translations reuse cached images (no extra downloads). If translation runs without EN fetch first, images will still be downloaded during translation (just slower).

---

## Out of Scope

1. **No retroactive fixing of existing translations** — Only new translation runs will use this flow; no migration work
2. **Image optimization changes** — Existing compression/optimization logic unchanged
3. **Notion API changes** — No changes to how we fetch from Notion
4. **Per-language image folders** — Reuse existing `static/images/` and naming conventions; no new per-language storage system
5. **New image mapping/registry system** — Reuse existing image replacer functions from notion-fetch pipeline
6. **Per-language image overrides** — Initial implementation uses EN images only. Localized image overrides are documented as a future enhancement
7. **Frontmatter image fields** — `processAndReplaceImages` handles markdown image syntax and HTML `<img>` tags but not YAML frontmatter image fields (e.g., `image: https://s3...`). These are not currently used in this project

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
const NOTION_IMAGE_PROXY_REGEX = /https:\/\/www\.notion\.so\/image\/[^\s)"']+/i;
```
