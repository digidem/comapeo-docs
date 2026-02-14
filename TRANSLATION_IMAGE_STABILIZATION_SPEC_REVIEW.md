# Review: TRANSLATION_IMAGE_STABILIZATION_SPEC.md

**Reviewed:** 2026-02-13
**Spec File:** `TRANSLATION_IMAGE_STABILIZATION_SPEC.md`
**Issue:** #137 - Notion translation pipeline: replace expiring Notion/S3 image URLs with canonical `/images/...` paths

---

## Overall Assessment

The spec is **sound and well-structured**. It correctly identifies the problem and proposes a reasonable solution. However, I found several issues:

---

## Issues Found

### 1. The spec has an outdated date

**Location:** Line 5

The spec says "Last Updated: 2025-01-13" but today is 2026-02-13 - likely a typo.

---

### 2. The translation prompt ALREADY has image preservation instructions

**Location:** `translateFrontMatter.ts:44,52,63`

The current prompt already tells OpenAI:

> "Any image URL... must be maintained exactly as in the original markdown"
> "Do not translate or modify any image URLs."

**Problem:** The spec proposes adding a new prompt instruction for `/images/` paths (Phase 2), but this won't fix the core issue. The current instructions tell OpenAI to preserve whatever URL exists - including expiring S3 URLs!

The spec correctly identifies that images need to be processed **before** translation (to convert S3 URLs to `/images/...` paths first). But the Phase 2 prompt enhancement is redundant since:

1. Images are already processed before translation
2. The prompt already says "don't modify URLs"

---

### 3. Blindspot: What happens when there's NO translation page?

**Location:** Spec section "Image Source Precedence Rules"

The spec says:

> If localized Notion page exists → use its markdown
> Otherwise → use EN markdown (default reuse)

But in `processSinglePageTranslation` (`scripts/notion-translate/index.ts:949`), it **always** uses `englishPage.id`:

```typescript
const markdownContent = await convertPageToMarkdown(englishPage.id);
```

There's no logic to check for page and use its markdown instead. The a localized Notion `translationPage` parameter exists but isn't used for markdown generation. This is a gap the spec correctly identifies but the code doesn't currently support.

---

### 4. Blindspot: `validateAndFixRemainingImages` doesn't fail

**Location:** `imageReplacer.ts:858-890`

`validateAndFixRemainingImages` **does not fail** - it just warns and returns the markdown with remaining S3 URLs.

The spec says (line 180):

> **fail translation for that page** and print diagnostics

But the actual function just logs warnings. This is a mismatch between spec and implementation of the function it's trying to reuse.

---

### 5. The spec references line numbers that don't exist

- Line 949: `processPageTranslation` - doesn't exist, it's `processSinglePageTranslation`
- Line 961-966: `translateText()` call - this is correct
- Line 562-620: `saveTranslatedContentToDisk` - the function starts at line 562 but isn't 58 lines long

These are minor but could confuse implementers.

---

### 6. The slug generation logic in spec is simplified

**Location:** Spec section "Implementation Design", item 1

The spec shows:

```typescript
function generateSafeSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .substring(0, MAX_SLUG_LENGTH) || "untitled"
  );
}
```

But the actual implementation at `saveTranslatedContentToDisk:573-580` is more complex:

- Uses page ID for determinism
- Has different handling for empty slugs
- Creates `deterministicName` with both slug AND stable page ID

The spec should either reference the exact existing logic or note that a new helper needs to extract this properly.

---

### 7. Missing consideration: EN-first prerequisite

The spec says translations should reuse EN images "by default (no duplication per language)". This works because:

1. EN images are downloaded to `static/images/` during the fetch phase
2. `processAndReplaceImages` checks for existing files before downloading

However, there's no guarantee the EN fetch has already run. If someone runs translation standalone, images would need to be downloaded. This should be documented as a prerequisite.

---

## Summary

| Issue                                           | Severity                                |
| ----------------------------------------------- | --------------------------------------- |
| Outdated date                                   | Minor                                   |
| Redundant Phase 2 prompt enhancement            | Low - doesn't hurt but adds confusion   |
| Missing localized page markdown selection logic | **High** - core requirement not in code |
| `validateAndFixRemainingImages` doesn't fail    | **High** - spec/impl mismatch           |
| Line number references off                      | Minor                                   |
| Simplified slug logic in spec                   | Medium - could cause bugs               |
| No explicit EN-first prerequisite documented    | Low                                     |

The core approach (process images before translation) is correct. The main risks are:

1. The code doesn't currently support selecting localized page markdown (per the spec's Image Source Precedence)
2. The validation function doesn't actually fail as spec claims

---

## Recommendations

1. **Remove or clarify Phase 2** - The prompt already has image preservation instructions. Either remove Phase 2 or clarify it's for explicitly calling out `/images/` paths (which is redundant but harmless).

2. **Fix the spec's failure requirement** - Either:
   - Update the spec to match `validateAndFixRemainingImages` behavior (warn, don't fail), OR
   - Create a new validation function that actually fails

3. **Add the missing markdown source selection logic** - The spec correctly identifies this need but the implementation doesn't have it yet.

4. **Update line number references** - Fix to point to `processSinglePageTranslation` instead of `processPageTranslation`.

5. **Document the EN-first prerequisite** - Note that EN fetch should ideally run first, or that translation will download images if needed.

---

## Additional Analysis (Round 2)

### 8. Blindspot: Image alt text translation is not explicitly addressed

**Location:** Spec and translation prompt

The spec doesn't address what happens to image alt text during translation. For example:

**Input:**

```markdown
![Settings screen](/images/settings_0.png)
```

**Expected output for PT:**

```markdown
![Tela de configurações](/images/settings_0.png)
```

The current translation prompt says "translate the text" but doesn't explicitly call out markdown image alt text. OpenAI should translate it, but the spec should explicitly state this expectation.

---

### 9. Blindspot: Frontmatter images not handled

**Location:** `imageReplacer.ts:101-201`

The `extractImageMatches` function only matches markdown image syntax (`![alt](url)`). It does not match frontmatter image fields like:

```yaml
---
title: My Page
image: https://secure.notion-static.com/xxx/image.png
---
```

If Notion pages have featured images or hero images stored in frontmatter with S3 URLs, these won't be stabilized. The spec should clarify whether this is in scope.

---

### 10. Blindspot: Fallback behavior when image download fails during translation

**Location:** `imageReplacer.ts:629`, `imageValidation.ts:68`

When an image fails to download during translation, the current implementation:

1. Creates a fallback comment: `<!-- Failed to download image: {url} -->`
2. Adds placeholder text: `**[Image N: alt]** *(Image failed to download)*`

**Problem:** The spec says translations should use stable `/images/...` paths and fail if validation fails. But the fallback creates a BROKEN reference, not a stable path. The validation would pass (no S3 URLs remain) but the image is still broken.

**This is a critical gap** - the spec assumes all images succeed, but network failures happen. The fallback behavior doesn't meet the "stable paths only" requirement.

---

### 11. Cache key expiration concern

**Location:** `imageProcessing.ts:674-700`

Images are cached by their S3 URL:

```typescript
const cachedEntry = imageCache.get(url);
```

However, S3 URLs expire after ~1 hour. If the EN fetch runs and caches an image:

- EN fetch gets markdown with S3 URL A
- Downloads image, saves to `/images/settings_0.png`
- Caches: URL A → `/images/settings_0.png`

Later when translation runs:

- Translation gets markdown with S3 URL A (still the same URL in Notion's content)
- Looks up cache with URL A → finds it!

**This works** because the S3 URL in the markdown hasn't changed - it's the same Notion URL even if it would expire when accessed. But if translation runs with a DIFFERENT S3 URL (e.g., after Notion regenerates the image), it won't hit the cache.

The spec should clarify: same Notion image = same S3 URL in content = cache hit. This is likely true but worth verifying.

---

### 12. Opportunity: Performance - parallel image processing already exists

**Location:** `imageReplacer.ts:77`, `imageReplacer.ts:569-592`

Images are already processed in batches of 5 concurrently (`MAX_CONCURRENT_IMAGES = 5`). This is good for performance. The spec mentions parallelization as a potential optimization but it's already implemented.

---

### 13. Opportunity: Metrics are available but not documented

**Location:** `imageReplacer.ts:70`

The `ImageReplacementResult` includes `metrics: ImageProcessingMetrics` which tracks:

- Processing time
- Cache hits
- Skipped images (small size, already optimized)

The spec proposes logging `processed=X reused=Y failed=Z` (line 230) - this data IS available in the metrics but the exact property names need verification.

---

### 14. Potential issue: Localized page with NO images vs EN with images

**Scenario:**

- EN page has 3 images
- Localized Notion page exists but has NO images (translator deleted them)
- Spec says: "use localized page markdown for images"

**Question:** Should the localized page markdown be used, resulting in ZERO images in the translation output? Or should it fall back to EN images?

The spec says "If localized Notion page exists → use its markdown" - this implies no fallback to EN images. But this might not be the intended behavior.

---

### 15. Potential issue: Same image URL in both EN and localized

**Scenario:**

- EN page has image A at S3 URL X
- Localized page has SAME image A (same S3 URL X)
- Both would download the same image

**Result:** The localized image would overwrite or be deduplicated (same filename). This is fine, but worth noting.

---

### 16. Missing: Rollback/cleanup on translation failure

**Location:** Spec "Rollback Strategy" section

The rollback strategy says:

> Quick Fix: Temporarily disable image processing in translation by commenting out the integration code

This doesn't address what happens to partially downloaded images if translation fails mid-process. If a translation run fails:

- Some images may have been downloaded to `static/images/`
- These would be orphaned (not referenced by any final markdown)

The spec should mention whether partial downloads need cleanup.

---

### 17. Missing: Testing strategy for cache behavior

**Location:** Spec "Testing Requirements"

The spec doesn't include tests for:

- Cache hits when EN already fetched the image
- Cache misses when running translation standalone
- Cache invalidation scenarios

---

## Summary - Round 2

| Issue                                         | Severity                                |
| --------------------------------------------- | --------------------------------------- |
| Alt text translation not explicitly addressed | Low - likely works but unclear          |
| Frontmatter images not handled                | Medium - may not be in scope            |
| Fallback creates broken references            | **High** - violates "stable paths only" |
| Cache key expiration concern                  | Low - likely works, needs verification  |
| Parallel processing already implemented       | N/A - good news!                        |
| Metrics available but not documented          | Low - minor doc gap                     |
| Localized page with NO images behavior        | Medium - unclear edge case              |
| Rollback doesn't address partial downloads    | Low - minor gap                         |

---

## Updated Recommendations

1. **Add alt text translation requirement to spec** - Explicitly state that markdown image alt text should be translated.

2. **Clarify frontmatter image handling** - Either document that it's out of scope or add handling.

3. **Fix fallback behavior for translation context** - The current fallback is designed for EN fetch (where image will be retried later). For translation, a failing image should either:
   - Fail the page translation (strict), OR
   - Use a placeholder that still references a path (not broken)

4. **Document the localized page "no images" behavior** - Clarify whether localized page with no images means zero images in output or fallback to EN.

5. **Add cache behavior tests** - Include tests for translation running standalone vs after EN fetch.

6. **Document partial download cleanup** - Add to rollback strategy if needed.

---

## Overall Conclusion

The spec's core approach (process images before translation → translate → validate) is sound. The main remaining concerns are:

1. **Critical:** Fallback behavior creates broken references that pass validation
2. **High:** Missing implementation for localized page markdown selection
3. **High:** Spec/impl mismatch on validation failure behavior
4. **Medium:** Unclear edge cases around localized pages with no images

---

## Resolution Status (2026-02-14)

All issues from this review have been addressed in the updated spec:

| Issue                                               | Resolution                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical: Fallback creates broken references**    | Spec now requires checking `imageResult.stats.totalFailures > 0` and throwing before translation. Fallback placeholders are never accepted. |
| **High: Missing localized page markdown selection** | Deferred to future enhancement. Initial implementation uses EN page only. Clearly documented in spec.                                       |
| **High: Spec/impl mismatch on validation**          | Spec now uses `getImageDiagnostics` + custom throw logic instead of `validateAndFixRemainingImages`. Import list corrected.                 |
| **Medium: Unclear edge cases**                      | Resolved by deferring per-language overrides. No ambiguity in initial scope.                                                                |
| Outdated date                                       | Fixed to 2026-02-14                                                                                                                         |
| Redundant Phase 2                                   | Downgraded to P2 (optional, defense in depth)                                                                                               |
| Wrong function name                                 | Fixed to `processSinglePageTranslation`                                                                                                     |
| Simplified slug logic                               | Fixed to include page ID suffix                                                                                                             |
| Metrics property name wrong                         | Removed `reused` from logging (no cache hit metric available)                                                                               |
| Frontmatter images                                  | Documented as out of scope                                                                                                                  |
| EN-first prerequisite                               | Added Prerequisites section                                                                                                                 |
