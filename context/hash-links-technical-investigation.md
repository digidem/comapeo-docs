# Hash Links Technical Investigation

**Issue:** #93 - Hash links are simply skipped and are no links at all during rendering
**Investigation Date:** 2025-11-27
**Status:** Complete

---

## Executive Summary

This document provides detailed technical findings from investigating how Notion links are currently processed through the notion-to-md library and the comapeo-docs pipeline. Key discovery: **notion-to-md outputs malformed HTML/JSX tags** instead of standard markdown links, requiring special handling.

---

## Investigation Methodology

### Tools Used
1. Codebase search (Grep) for link processing patterns
2. Analysis of existing content sanitizer
3. Review of notion-to-md library documentation
4. Web research on Notion API link handling
5. Analysis of existing remark plugin architecture

### Files Analyzed
- `scripts/notion-fetch/contentSanitizer.ts`
- `scripts/notion-fetch/generateBlocks.ts`
- `scripts/notionClient.ts`
- `scripts/remark-fix-image-paths.ts`
- `docusaurus.config.ts`
- `context/quick-ref/block-examples.json`

---

## Finding 1: notion-to-md Output Format

### Discovery

The notion-to-md library (v3.1.9) does **NOT** output standard markdown links for Notion page references and mentions. Instead, it outputs malformed HTML/JSX-like tags.

### Evidence

From `contentSanitizer.ts` (lines 107-117), we see patterns that are being sanitized:

```typescript
// Fix malformed <link to section.> patterns
content = content.replace(
  /<link\s+to\s+section\.?>/gi,
  "[link to section](#section)"
);

// Fix other malformed <link> tags with invalid attributes
content = content.replace(/<link\s+[^>]*[^\w\s"=-][^>]*>/g, "[link](#)");

// Fix malformed <Link> tags with invalid attributes
content = content.replace(/<Link\s+[^>]*[^\w\s"=-][^>]*>/g, "[Link](#)");
```

### Examples of Malformed Tags

| notion-to-md Output | Current Sanitizer Output | Problem |
|---------------------|--------------------------|---------|
| `<link to section.>` | `[link to section](#section)` | Generic placeholder |
| `<link href.example=value>` | `[link](#)` | Lost all link info |
| `<Link to.page=value>` | `[Link](#)` | Lost all link info |

### Test Evidence

From `contentSanitizer.test.ts` (lines 53-75):

```typescript
test("should fix malformed link tags", () => {
  const input = "Check <link to section.> for details.";
  const result = sanitizeMarkdownContent(input);
  expect(result).toBe("Check [link to section](#section) for details.");
});

test("should fix malformed Link tags with dots", () => {
  const input = "Check <link to section> for details.";
  const result = sanitizeMarkdownContent(input);
  expect(result).toBe("Check [link to section](#section) for details.");
});

test("should fix malformed Link tags with invalid attributes", () => {
  const input = "Visit <link href.example=value> page.";
  const result = sanitizeMarkdownContent(input);
  expect(result).toBe("Visit [link](#) page.");
});
```

### Implications

1. **Current sanitizer discards link information** - converts everything to `[link](#)`
2. **Need to extract page/block IDs** from these malformed tags
3. **Tag format is unpredictable** - varies by link type

---

## Finding 2: Notion Rich Text Structure

### Notion API Format

From `context/quick-ref/block-examples.json`:

```json
{
  "type": "text",
  "text": {
    "content": "Example paragraph text",
    "link": null
  },
  "annotations": {
    "bold": false,
    "italic": false,
    "strikethrough": false,
    "underline": false,
    "code": false,
    "color": "default"
  },
  "plain_text": "Example paragraph text",
  "href": null
}
```

### Link Structure

When a link is present:

```json
{
  "type": "text",
  "text": {
    "content": "link text",
    "link": {
      "url": "https://example.com"
    }
  },
  "href": "https://example.com"
}
```

### Mention Structure

From `scripts/notion-fetch/emojiExtraction.test.ts`:

```json
{
  "type": "mention",
  "mention": {
    "type": "custom_emoji",
    "custom_emoji": {
      "url": "https://example.com/emoji1.png",
      "name": "smile"
    }
  },
  "plain_text": ":smile:"
}
```

**Note:** Page mentions likely follow similar structure with `"type": "page"` or `"type": "link_to_page"`

---

## Finding 3: Current Link Processing Pipeline

### Step-by-Step Flow

```
┌────────────────────────────────────────────────────────────┐
│ 1. Notion API - Raw Block Data                            │
│    • Rich text arrays with link objects                   │
│    • Mention objects for page references                  │
│    • Block IDs for all content blocks                     │
└────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────┐
│ 2. notionClient.ts - Notion Client Setup                  │
│    • Initializes NotionToMarkdown (n2m)                   │
│    • Sets custom paragraph transformer                    │
│    • Line 259: const n2m = new NotionToMarkdown(...)      │
└────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────┐
│ 3. cacheLoaders.ts - Markdown Conversion                  │
│    • Line 173: n2m.pageToMarkdown(pageId)                 │
│    • Converts Notion blocks to markdown array             │
│    • notion-to-md processes rich_text → malformed tags    │
└────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────┐
│ 4. generateBlocks.ts - Block Processing                   │
│    • Line 280: n2m.toMarkdownString(markdown)             │
│    • Converts markdown array to string                    │
│    • Returns structure: { parent: "...", child: {...} }   │
└────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────┐
│ 5. contentSanitizer.ts - Fix Malformed Tags               │
│    • Line 107-117: Replace <link ...> patterns            │
│    • Converts to markdown links                           │
│    • PROBLEM: Discards actual link targets                │
└────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────┐
│ 6. contentWriter.ts - Write Markdown Files                │
│    • Combines frontmatter + content                       │
│    • Writes to docs/ or i18n/{lang}/docs/                 │
└────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────┐
│ 7. Docusaurus Build                                        │
│    • Processes markdown files                              │
│    • Applies remark plugins                                │
│    • Line 283 (docusaurus.config.ts):                     │
│      remarkPlugins: [remarkFixImagePaths]                  │
└────────────────────────────────────────────────────────────┘
```

### Key Code References

**notionClient.ts - Initialization (line 259):**
```typescript
const n2m = new NotionToMarkdown({ notionClient: notion });
```

**cacheLoaders.ts - Markdown Conversion (line 173):**
```typescript
fetchFn: (pageId) => n2m.pageToMarkdown(pageId)
```

**generateBlocks.ts - String Conversion (line 280):**
```typescript
const markdownString = n2m.toMarkdownString(markdown);
```

**contentSanitizer.ts - Current Fix Attempt (lines 107-117):**
```typescript
// 3. Fix malformed <link to section.> patterns
content = content.replace(
  /<link\s+to\s+section\.?>/gi,
  "[link to section](#section)"
);

// 4. Fix other malformed <link> tags
content = content.replace(/<link\s+[^>]*[^\w\s"=-][^>]*>/g, "[link](#)");

// 5. Fix malformed <Link> tags
content = content.replace(/<Link\s+[^>]*[^\w\s"=-][^>]*>/g, "[Link](#)");
```

---

## Finding 4: Page URL Generation

### Current Slug Generation

From `generateBlocks.ts` (lines 582-593):

```typescript
const filename = title
  .toLowerCase()
  .replace(/\s+/g, "-")
  .replace(/[^a-z0-9-]/g, "");
```

### Examples

| Notion Page Title | Generated Slug | Generated URL |
|-------------------|----------------|---------------|
| "Getting Started" | `getting-started` | `/docs/getting-started` |
| "API Documentation" | `api-documentation` | `/docs/api-documentation` |
| "v2.0 Release Notes" | `v20-release-notes` | `/docs/v20-release-notes` |

### Frontmatter Structure

From `frontmatterBuilder.ts`:

```yaml
---
id: doc-getting-started
title: Getting Started
slug: /getting-started
---
```

### Multi-Language Structure

**English:**
- Slug: `installation-guide`
- File: `docs/installation-guide.md`
- URL: `/docs/installation-guide`

**Portuguese:**
- Slug: `installation-guide` (same!)
- File: `i18n/pt/docs/installation-guide.md`
- URL: `/pt/docs/installation-guide`

---

## Finding 5: Existing Remark Plugin Pattern

### Current Implementation

`scripts/remark-fix-image-paths.ts` (lines 1-30):

```typescript
export default function remarkFixImagePaths() {
  function transformNode(node: any): void {
    if (!node || typeof node !== "object") return;

    // Markdown image nodes
    if (node.type === "image" && typeof node.url === "string") {
      if (node.url.startsWith("images/")) {
        node.url = `/${node.url}`;
      }
    }

    // Raw HTML nodes possibly containing <img>
    if (node.type === "html" && typeof node.value === "string") {
      node.value = node.value.replace(/src=(["'])images\//g, "src=$1/images/");
    }

    // Recurse into children
    if (Array.isArray(node.children)) {
      for (const child of node.children) transformNode(child);
    }
  }

  return (tree: any): void => {
    transformNode(tree);
  };
}
```

### Configuration

`docusaurus.config.ts` (line 283):

```typescript
docs: {
  path: "docs",
  sidebarPath: "./src/components/sidebars.ts",
  remarkPlugins: [remarkFixImagePaths],
  // ...
}
```

### Pattern Analysis

1. **Traverses AST nodes** recursively
2. **Checks node type** (image, html, etc.)
3. **Transforms URLs** in-place
4. **Handles nested structures** via recursion
5. **Simple and maintainable**

---

## Finding 6: Page Metadata Cache System

### Current Implementation

From `pageMetadataCache.ts`:

```typescript
interface PageMetadata {
  lastEdited: string;      // ISO timestamp
  outputPaths: string[];   // Generated file paths
  processedAt: string;     // ISO timestamp
}

interface CacheData {
  version: string;
  scriptHash: string;
  pages: Record<string, PageMetadata>;
}
```

### Example Cache Entry

```json
{
  "version": "2.0.0",
  "scriptHash": "abc123...",
  "pages": {
    "notion-page-id-123": {
      "lastEdited": "2025-11-27T10:00:00Z",
      "outputPaths": ["docs/getting-started.md"],
      "processedAt": "2025-11-27T10:05:00Z"
    }
  }
}
```

### Usage

- **Incremental sync**: Skip unchanged pages
- **Deleted page detection**: Remove orphaned files
- **Change tracking**: Detect when re-processing needed

### Extension Opportunity

Could be extended to include:
- `slug: string` - Generated page slug
- `blockAnchors: Record<string, string>` - Block ID → anchor mappings
- `linkedPages: string[]` - Pages this page links to

---

## Finding 7: Block Fetching System

### Block Structure

From `fetchNotionData.ts` (line 285):

```typescript
async function fetchNotionBlocks(pageId: string) {
  const blocks = await enhancedNotion.blocksChildrenList({
    block_id: pageId,
  });

  // Recursively fetch nested blocks
  for (const block of blocks) {
    if (block.has_children) {
      block.children = await fetchNotionBlocks(block.id);
    }
  }

  return blocks;
}
```

### Block Data Available

Each block includes:
- `id` - Unique block identifier
- `type` - Block type (paragraph, heading_1, heading_2, etc.)
- `[type]` - Type-specific properties (e.g., `heading_1.rich_text`)
- `has_children` - Whether block has nested content
- `children` - Nested blocks (if fetched)

### Heading Block Example

```json
{
  "id": "block-abc123",
  "type": "heading_1",
  "heading_1": {
    "rich_text": [
      {
        "type": "text",
        "text": { "content": "About This Guide", "link": null },
        "plain_text": "About This Guide"
      }
    ],
    "is_toggleable": false,
    "color": "default"
  }
}
```

### Key Insight

**All block content is already available during markdown generation!**
- No additional API calls needed for anchor generation
- Can extract heading text from `rich_text` arrays
- Can build block ID → content mapping during fetch

---

## Finding 8: notion-to-md Limitations

### Known Issue

**GitHub Issue #161:** "Add support for 'Link to block' to URL hash conversion"
- **Status:** Open (created 2025-07-21)
- **Author:** hlysine (Henry Lin)
- **URL:** https://github.com/souvikinator/notion-to-md/issues/161

### Current Behavior

From issue description:
> Currently, notion-to-md ignores the hash value entirely. The block ID information is stripped out during conversion, resulting in plain page references without any anchor or scroll target functionality.

### Proposed API (from issue)

```typescript
const n2m = new NotionConverter(notion)
  .withPageReferences({
    urlPropertyNameNotion: 'URL',
    transformBlockToUrlHash: block => "my-heading"
  })
```

### Version Information

- **Current version in project:** 3.1.9
- **Latest version:** 3.1.9 (as of investigation)
- **No fix available yet**

---

## Finding 9: Docusaurus Heading Anchors

### How Docusaurus Generates Anchors

From web research ([Docusaurus Issue #9663](https://github.com/facebook/docusaurus/issues/9663)):

Docusaurus uses GitHub-style slugification:

```typescript
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/[^\w\-]+/g, '')       // remove special chars
    .replace(/\-\-+/g, '-')         // collapse multiple hyphens
    .replace(/^-+/, '')             // trim leading hyphens
    .replace(/-+$/, '');            // trim trailing hyphens
}
```

### Examples

| Heading Text | Generated Anchor |
|--------------|------------------|
| "About This Guide" | `about-this-guide` |
| "v2.0 Release" | `v20-release` |
| "Getting Started!" | `getting-started` |
| "FAQ (Frequently Asked)" | `faq-frequently-asked` |

### Custom Anchor IDs

Docusaurus supports custom heading IDs ([Issue #3322](https://github.com/facebook/docusaurus/issues/3322)):

```markdown
## About This Guide {#custom-id}
```

Generates: `<h2 id="custom-id">About This Guide</h2>`

### I18n Considerations

From [Issue #11358](https://github.com/facebook/docusaurus/issues/11358):
- Hash links cause problems with Google Translate
- Anchors are currently case-sensitive
- No built-in translation of anchor IDs

---

## Finding 10: Cross-Page Linking Gap

### Critical Missing Component

**No system exists to convert Notion page URLs to local doc URLs.**

### What's Missing

1. **Page ID → Slug Mapping**
   - Need: `notion-page-id-123` → `getting-started`
   - Current: Only exists in-memory during generation

2. **URL Conversion**
   - Need: `https://notion.so/page-id` → `/docs/getting-started`
   - Current: No transformation happens

3. **Link Rewriting**
   - Need: Process markdown links to convert URLs
   - Current: Links remain as Notion URLs

### Evidence

Searched codebase for:
- ❌ No "link rewriter" module
- ❌ No "URL mapper" system
- ❌ No custom link transformer in `notionClient.ts`
- ❌ No link processing in `contentSanitizer.ts` (only malformed tag fixes)

---

## Unanswered Questions

### 1. Exact Malformed Tag Format

**Question:** What exact format does notion-to-md output for different link types?

**Need to verify:**
- Same-page hash links
- Cross-page links
- Cross-page + hash links
- Page mentions (@Page Name)
- link_to_page blocks

**Action:** Create test Notion page and run notion-to-md

---

### 2. Block ID Availability

**Question:** Are block IDs preserved in the malformed tags?

**Example:**
- Does `<link to section.>` contain hidden block ID?
- Or is block ID completely lost?

**Action:** Examine raw notion-to-md output before sanitization

---

### 3. Page ID in Links

**Question:** How does notion-to-md represent cross-page links?

**Possibilities:**
- `<link page-id#block-id>`
- `<mention page-id>`
- Lost completely?

**Action:** Test with cross-page links in Notion

---

### 4. I18n Hash Behavior

**Question:** How do hash links work across language versions?

**Test scenarios:**
- Portuguese page → Portuguese heading (same page)
- Portuguese page → English heading (cross-language)
- Should anchors be translated?

**Action:** Research Docusaurus i18n documentation

---

## Recommended Next Steps

### 1. Immediate: Investigation Phase

Create test Notion page with:
- [ ] Same-page hash link to heading
- [ ] Cross-page link (no hash)
- [ ] Cross-page link with hash to heading
- [ ] Page mention (@Page Name)
- [ ] link_to_page block
- [ ] External link (control)

Run through pipeline and document:
- [ ] Raw Notion API response
- [ ] notion-to-md output (before sanitization)
- [ ] After sanitization
- [ ] Final markdown output

### 2. Document Findings

Create investigation report with:
- [ ] Exact tag formats discovered
- [ ] Block ID preservation (yes/no)
- [ ] Page ID availability
- [ ] Edge cases found

### 3. Update Implementation Plan

Based on investigation findings:
- [ ] Confirm or revise chosen approach
- [ ] Update effort estimates
- [ ] Identify additional requirements
- [ ] Create detailed technical spec

### 4. Prototype

Build minimal prototype:
- [ ] Enhanced sanitizer (extract IDs)
- [ ] Simple mapping system
- [ ] Basic link rewriting
- [ ] Validate approach works

### 5. Full Implementation

Only after prototype validated:
- [ ] Implement full solution
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Deployment

---

## Technical Recommendations

### 1. Use Remark Plugin Architecture

**Rationale:**
- ✅ Follows existing pattern (`remark-fix-image-paths`)
- ✅ Standard Docusaurus approach
- ✅ Team already familiar with this
- ✅ More maintainable long-term

### 2. Enhance Content Sanitizer

**Changes needed:**
```typescript
// OLD: Discard link information
content.replace(/<link\s+to\s+section\.?>/gi, "[link](#)");

// NEW: Extract and preserve
content.replace(/<link\s+to\s+([^>]+)>/gi, (match, linkInfo) => {
  const { pageId, blockId, text } = extractLinkInfo(linkInfo);
  return `[${text}](notion://${pageId}${blockId ? '#' + blockId : ''})`;
});
```

### 3. Export Link Mappings

**New module:** `linkMappingExporter.ts`

```typescript
interface LinkMappings {
  version: string;
  generated: string;
  pages: Record<string, string>;    // pageId → slug
  blocks: Record<string, string>;   // blockId → anchor
}
```

**Output:** `scripts/notion-link-mappings.json`

### 4. Create Remark Plugin

**New module:** `remark-notion-links.ts`

- Load mappings from JSON
- Transform `notion://` URLs
- Generate proper local paths
- Validate and warn on broken links

---

## References

### Codebase Files
- `scripts/notion-fetch/contentSanitizer.ts` - Current sanitization
- `scripts/notion-fetch/generateBlocks.ts` - Page processing
- `scripts/notionClient.ts` - notion-to-md initialization
- `scripts/remark-fix-image-paths.ts` - Existing remark plugin
- `scripts/notion-fetch/pageMetadataCache.ts` - Cache system

### External Resources
- [notion-to-md Issue #161](https://github.com/souvikinator/notion-to-md/issues/161)
- [Docusaurus MDX Plugins](https://docusaurus.io/docs/markdown-features/plugins)
- [Docusaurus Hash Links Issue #11358](https://github.com/facebook/docusaurus/issues/11358)
- [Docusaurus Heading IDs Issue #3322](https://github.com/facebook/docusaurus/issues/3322)
- [Notion Help: Links & Backlinks](https://www.notion.com/help/create-links-and-backlinks)

---

**Document Version:** 1.0
**Investigation Complete:** 2025-11-27
**Investigator:** Claude (AI Assistant)
**Status:** Ready for team review
