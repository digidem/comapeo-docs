# Translation Image Stabilization - Simplified Specification

**Issue:** #137 - Replace expiring image URLs with stable paths in translated docs

**Goal:** When we translate English docs to other languages, make sure the images don't break over time.

---

## The Problem (Simple Explanation)

**How things work now:**
1. We fetch a page from Notion
2. Notion gives us images with URLs that expire after 1 hour (like a magic link that stops working)
3. We translate the text to another language (Spanish, Portuguese, etc.)
4. The translated page still has those expiring URLs
5. After 1 hour, the images break and show nothing

**How we want it to work:**
1. We fetch a page from Notion
2. We download the images to our own storage (they stay forever)
3. We translate the text
4. The translated page points to our own stable images (they never expire!)

---

## What Changes

### Before (Current)
```
English Notion → Get expiring URL → Translate → Save with expiring URL → Images break after 1 hour
```

### After (New)
```
English Notion → Download image → Stable path → Translate → Save with stable path → Images work forever
```

---

## How It Works (Step by Step)

### Step 1: Choose which page to use for images

**Rule:** Use the translated Notion page if it exists, otherwise use the English page.

- If we have a Spanish Notion page with its own screenshots → use those
- If we don't have a Spanish page → use the English images (they're already downloaded)

### Step 2: Convert to Markdown

Convert the chosen Notion page to markdown. The markdown still has expiring URLs at this point.

### Step 3: Download and replace images (NEW!)

For each image in the markdown:
1. Is it an expiring URL? → Download the image to our storage
2. Is it already downloaded? → Skip (use cached version)
3. Replace the URL with our stable path: `/images/filename.png`

**Note:** Images download in batches of 5 (parallel) for performance. If EN fetch already ran, translation reuses cached images.

### Step 4: Translate the text

Send the markdown (now with stable image paths) to OpenAI for translation.

**Important:** We translate AFTER replacing images so OpenAI sees stable paths, not expiring URLs.

### Step 5: Validate (NEW!)

After translation, check that:
- No expiring URLs remain
- Stable paths weren't changed

If any expiring URLs are found → fail the translation (with error message)

### Step 6: Save

Save the translated markdown with stable image paths to the output folder.

---

## Key Decisions

### Q: What if a translated page uses a different image than English?
A: That's okay! If the Spanish page has its own screenshot, we'll download that one instead. Both become stable paths.

### Q: What if the image download fails?
A: The translation fails for that page. We don't allow broken images in translated docs.

### Q: Do we download images again for each language?
A: No! Images are cached. If English already downloaded "settings.png", Spanish reuses it.

### Q: What happens to the alt text?
A: OpenAI translates it. `![Settings screen]` becomes `![Tela de configurações]` in Portuguese.

---

## What Files Change

| File | What We Do |
|------|------------|
| `scripts/notion-translate/index.ts` | Add image processing before translation, add validation after |
| `scripts/notion-translate/__tests__/imageStabilization.test.ts` | New tests for image stabilization |

We reuse existing code from `scripts/notion-fetch/imageReplacer.ts` - no new image downloading logic needed!

---

## Acceptance Criteria

- [ ] No expiring URLs in translated docs (`secure.notion-static.com`, `amazonaws.com`, etc.)
- [ ] All images use stable paths (`/images/filename.png`)
- [ ] Images are not duplicated per language
- [ ] Works with both `![alt](url)` and `<img src="url">` syntax
- [ ] Re-running translation doesn't change image paths (idempotent)
- [ ] Localized Notion pages can override with different images

---

## Testing

### What we test:

1. **S3 URL rewriting** - Markdown with expiring URLs becomes stable paths
2. **Path preservation** - `/images/...` paths survive translation unchanged
3. **Alt text translation** - Image alt text gets translated
4. **Idempotency** - Re-running produces same paths
5. **Overrides** - Localized page with different image uses that image
6. **Fallback** - No localized page = use English images

### How we test:

- Mock the network (don't actually download images)
- Mock OpenAI (don't actually call the API)
- Run tests with: `bunx vitest run scripts/notion-translate/__tests__/imageStabilization.test.ts`

---

## Rollback

If something goes wrong:
1. Comment out the image processing lines in `processSinglePageTranslation`
2. Deploy the fix
3. Re-run translations

Existing translations are NOT affected - only new runs use this flow.

---

## Out of Scope

- Fixing existing translated docs (only new runs)
- Changing how English docs handle images (already works)
- Per-language image folders (all languages share `/images/`)
- Frontmatter/featured images (not used in this project)

---

## Important Notes

### Existing translations are NOT affected
Only NEW translation runs will use this flow. Existing translated docs keep their current URLs.

### EN fetch recommended first
For best performance, run EN fetch (`bun scripts/notion-fetch`) before translation:
- EN images are downloaded once to `/images/`
- Translations reuse cached images (no extra downloads)

If you run translation without EN fetch first, images will be downloaded during translation (still works, just slower).

---

## Quick Reference

### URLs that expire (bad):
- `https://secure.notion-static.com/...`
- `https://s3.us-west-2.amazonaws.com/secure.notion-static.com/...`
- `https://prod-files-secure.s3.us-west-2.amazonaws.com/...`
- `https://www.notion.so/image/...`
- Any URL with `X-Amz-` parameters

### Stable paths (good):
- `/images/anything.png`
- `/images/folder/filename.jpg`

---

## For Developers

### Key functions from notion-fetch that we use:

```typescript
import {
  processAndReplaceImages,  // Download images, replace URLs
  getImageDiagnostics,       // Check for remaining S3 URLs
} from "../notion-fetch/imageReplacer.js";
```

### Integration point:

In `processSinglePageTranslation()` (around line 949):

```typescript
// AFTER (new):
// 1. Choose which page has the images we want
const imageSourcePageId = translationPage?.id ?? englishPage.id;
const rawMarkdown = await convertPageToMarkdown(imageSourcePageId);

// 2. Download images and replace URLs with stable paths
// Uses existing slug logic from saveTranslatedContentToDisk for consistent filenames
const safeFilename = generateSafeFilename(title);  // NEW HELPER - extract from existing code
const { markdown: markdownContent } = await processAndReplaceImages(rawMarkdown, safeFilename);

// 3. Translate (now with stable paths)
const translated = await translateText(markdownContent, title, language);

// 4. Validate - make sure no S3 URLs slipped through
const diagnostics = getImageDiagnostics(translated.markdown);
if (diagnostics.s3Matches > 0) {
  throw new Error(`Found ${diagnostics.s3Matches} expiring URLs in translation`);
}
```

**New helper needed:** `generateSafeFilename(title)` - Extract the slug logic from `saveTranslatedContentToDisk()` (lines 573-580) to reuse for image filenames.

---

**End of Simplified Spec**
