# Translation Parity Known Issues

This document tracks translation parity and markdown→Notion pipeline issues identified during review and the implementation status of each item.

## Current Status

- **Tracked parity and pipeline issues:** ✅ Resolved
- **Open issues currently tracked in this document:** ✅ None

## Resolved Issues

### Parity harness (`scripts/locale-parity.test.ts`)

1. Setext heading detection (`h1`/`h2`) added.
2. Nested list depth tokenization (`ul:<depth>`, `ol:<depth>`) added.
3. Indented code block tokenization (`code-indented`) added.
4. Admonition body token scoping added (`admonition-body:*`).
5. Media stripping expanded to include reference-style images.
6. Table alignment rows filtered from structural row comparisons.
7. Deterministic sorting enforced via explicit locale compare.
8. Structure strictness control added (`LOCALE_PARITY_STRICTNESS=relaxed`, strict default).
9. CRLF-safe frontmatter stripping enabled.
10. Locale docs path made configurable (`LOCALE_PARITY_DOCS_PATH_TEMPLATE`).
11. Optional frontmatter parity validation added (`LOCALE_PARITY_VALIDATE_FRONTMATTER=true`).
12. First-token structural mismatch diagnostics logged.

### Callout and markdown transform (`scripts/notion-fetch`)

13. Icon stripping fallback made conservative to avoid semantic loss in no-separator cases.
14. Locale punctuation separator handling expanded.
15. Grapheme fallback behavior hardened for environments without `Intl.Segmenter`.
16. Callout text extraction hardened with typed guards (no `any` extraction path).

### Markdown→Notion translation (`scripts/notion-translate`)

17. Code language alias coverage expanded and normalized.
18. Empty list items preserved as whitespace list entries.
19. Large-page safety guard for block volume added.
20. Error granularity improved for empty/unsupported/oversized conversion outcomes.

### Additional hardening from merge-readiness audit

21. `calloutProcessor` icon typing broadened to handle `custom_emoji` and non-background color variants safely.
22. `markdownTransform` markdown conversion cast tightened with explicit `unknown` bridge for `n2m` input compatibility.
23. `markdownToNotion` language alias mapping corrected to avoid unsupported Notion language literals (e.g., TOML falls back to `plain text`).
24. `verify-locale-output` tests now parse typed translation entries to avoid `unknown` property access type errors.
25. Test environment bootstrap now includes `OPENAI_API_KEY` and `DATA_SOURCE_ID` to keep `notion-translate/index.test.ts` aligned with runtime environment validation.
26. Indented-code detection now excludes deeply-indented list markers, preventing nested list items from being mis-tokenized as `code-indented`.
27. Setext-heading detection is now restricted to paragraph-like candidates, avoiding false `h2` tokens for list-item + thematic-break patterns.

## Verification Commands

- `bunx vitest run scripts/locale-parity.test.ts`
- `bunx vitest run scripts/notion-fetch/calloutProcessor.test.ts scripts/notion-fetch/markdownTransform.test.ts`
- `bunx vitest run scripts/notion-translate/markdownToNotion.test.ts`
- `bun run typecheck --noEmit`

When new issues are found, append them with severity, impact, fix, and verification notes.
