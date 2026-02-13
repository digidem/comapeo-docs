# Translation Image Stabilization - Technical Specification

**Issue:** #137 - Notion translation pipeline: replace expiring Notion/S3 image URLs with canonical `/images/...` paths

**Last Updated:** $(date +%Y-%m-%d)

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
2. Images should be downloaded to `static/images/` during the English fetch
3. Translations should reuse these same images (no duplication per language)

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
│  1. convertPageToMarkdown(pageId)                                   │
│     └── n2m.pageToMarkdown() → Markdown with S3 URLs                │
│                                                                     │
│  2. processAndReplaceImages(markdown, safeFilename) ✅ NEW          │
│     └── Downloads images → Rewrites to /images/... paths            │
│                                                                     │
│  3. translateText(stabilizedMarkdown, title, language)              │
│     └── OpenAI API → Translated markdown with /images/... paths ✅  │
│                                                                     │
│  4. validateAndFixRemainingImages(translated, safeFilename) ✅ NEW  │
│     └── Safety net: catches any remaining S3 URLs                   │
│                                                                     │
│  5. saveTranslatedContentToDisk()                                   │
│     └── Saves markdown with stable /images/... paths ✅             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

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
| `scripts/notion-fetch/imageReplacer.ts` | Line 858-518 | `validateAndFixRemainingImages()` | Safety net for remaining S3 URLs |
| `scripts/notion-fetch/imageReplacer.ts` | Line 719 | `hasS3Urls()` | Check if content has S3 URLs |
| `scripts/notion-fetch/imageReplacer.ts` | Line 833 | `getImageDiagnostics()` | Get image URL diagnostics |

---

## Implementation Design

### 1. Extract Safe Filename Generation

**Rationale:** The slug generation logic in `saveTranslatedContentToDisk()` should be reusable.

**Location:** `scripts/notion-translate/index.ts`

```typescript
// Extract as standalone function (reuse existing logic)
function generateSafeFilename(title: string): string {
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
// Convert English page to markdown (contains S3 URLs)
const rawMarkdownContent = await convertPageToMarkdown(englishPage.id);

// Stabilize images: replace S3 URLs with /images/... paths
const title = getTitle(englishPage);
const safeFilename = generateSafeFilename(title);
const imageResult = await processAndReplaceImages(rawMarkdownContent, safeFilename);
const markdownContent = imageResult.markdown;

// Log image processing results
if (imageResult.stats.successfulImages > 0 || imageResult.stats.totalFailures > 0) {
  console.log(
    chalk.blue(
      `  📸 Images: ${imageResult.stats.successfulImages} processed, ${imageResult.stats.totalFailures} failed`
    )
  );
}
```

### 3. Add Post-Translation Validation

**Location:** After translation, before saving to disk

```typescript
// Translate the content
let translatedContent: string;
// ... existing translation code ...

// Validate and fix any remaining S3 URLs (safety net)
translatedContent = await validateAndFixRemainingImages(
  translatedContent,
  safeFilename
);
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
} from "../notion-fetch/imageReplacer.js";
```

---

## Testing Requirements

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

---

## Risks and Mitigations

### Risk 1: Image Download Failures

**Risk:** Network issues could cause image downloads to fail, leaving S3 URLs in place.

**Mitigation:**
- `processAndReplaceImages()` has built-in retry logic
- `validateAndFixRemainingImages()` acts as safety net
- Failed images get informative fallback placeholders

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

### Phase 1: Core Integration (HIGH PRIORITY)

**Estimated Time:** 2-3 hours

| Task | Description | File(s) | Priority |
|------|-------------|---------|----------|
| 1.1 | Add imports for image processing functions | `scripts/notion-translate/index.ts` | P0 |
| 1.2 | Extract `generateSafeFilename()` helper function | `scripts/notion-translate/index.ts` | P0 |
| 1.3 | Add image processing before translation | `scripts/notion-translate/index.ts` | P0 |
| 1.4 | Add post-translation validation | `scripts/notion-translate/index.ts` | P0 |
| 1.5 | Add logging for image processing results | `scripts/notion-translate/index.ts` | P1 |

**Implementation Details:**

```typescript
// Task 1.1: Add imports (at top of file)
import {
  processAndReplaceImages,
  validateAndFixRemainingImages,
} from "../notion-fetch/imageReplacer.js";

// Task 1.2: Extract helper (around line 560)
function generateSafeFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, MAX_SLUG_LENGTH) || "untitled";
}

// Task 1.3 & 1.4: Modify processPageTranslation (around line 949)
// See spec section "Modify processPageTranslation Function"
```

---

### Phase 2: Translation Prompt Enhancement (MEDIUM PRIORITY)

**Estimated Time:** 30 minutes

| Task | Description | File(s) | Priority |
|------|-------------|---------|----------|
| 2.1 | Add explicit `/images/` path preservation instruction | `scripts/notion-translate/translateFrontMatter.ts` | P1 |

**Implementation Details:**

Update `TRANSLATION_PROMPT` at line ~44 in constraints section:
```
- **Do not modify any paths starting with `/images/` - these are canonical asset references that must remain unchanged.**
```

---

### Phase 3: Testing (HIGH PRIORITY)

**Estimated Time:** 2-3 hours

| Task | Description | File(s) | Priority |
|------|-------------|---------|----------|
| 3.1 | Create image stabilization test file | `scripts/notion-translate/__tests__/imageStabilization.test.ts` | P0 |
| 3.2 | Test S3 URL detection and replacement | Same | P0 |
| 3.3 | Test `/images/` path preservation | Same | P0 |
| 3.4 | Test HTML image tag handling | Same | P1 |
| 3.5 | Test idempotency | Same | P1 |
| 3.6 | Update existing translation tests if needed | `scripts/notion-translate/index.test.ts` | P1 |

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

### Phase 4: Validation and Documentation (MEDIUM PRIORITY)

**Estimated Time:** 1 hour

| Task | Description | File(s) | Priority |
|------|-------------|---------|----------|
| 4.1 | Run lint on modified files | CLI | P1 |
| 4.2 | Run format on modified files | CLI | P1 |
| 4.3 | Run existing tests to verify no regressions | CLI | P0 |
| 4.4 | Manual testing with sample translation | CLI | P1 |
| 4.5 | Update AGENTS.md with any new patterns learned | `AGENTS.md` | P2 |

---

### Phase 5: PR Creation (FINAL)

**Estimated Time:** 30 minutes

| Task | Description | Priority |
|------|-------------|----------|
| 5.1 | Create feature branch | P0 |
| 5.2 | Commit changes with conventional commit | P0 |
| 5.3 | Push and create PR | P0 |
| 5.4 | Link PR to issue #137 | P0 |

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

---

### Success Metrics

After implementation, verify:

1. **Zero S3 URLs in output:**
   ```bash
   grep -r "amazonaws.com\|notion-static.com\|notion.so/image" i18n/*/docusaurus-plugin-content-docs/
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

### Estimated Total Time

| Phase | Time |
|-------|------|
| Phase 1: Core Integration | 2-3 hours |
| Phase 2: Prompt Enhancement | 30 minutes |
| Phase 3: Testing | 2-3 hours |
| Phase 4: Validation | 1 hour |
| Phase 5: PR Creation | 30 minutes |
| **Total** | **6-8 hours** |

---

## Out of Scope

1. **Retroactive fixing of existing translations** - Only new translations will use this flow
2. **Image optimization changes** - Existing compression/optimization logic unchanged
3. **Notion API changes** - No changes to how we fetch from Notion
4. **Multi-language image assets** - No per-language image copies (by design)

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
