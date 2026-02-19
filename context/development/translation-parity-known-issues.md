# Translation Parity Known Issues

This document captures known issues in the translation parity pipeline that were identified during review but deferred for later resolution.

## Status: P0 Issues - RESOLVED ✅

The following critical P0 issues were fixed and verified:

| Issue                                           | Status                        | PR/Commit |
| ----------------------------------------------- | ----------------------------- | --------- |
| Callout children blocks lost in transformation  | ✅ Fixed                      | #PR       |
| Missing translation files silently ignored      | ✅ Fixed                      | #PR       |
| Inline formatting stripped (bold, italic, etc.) | ✅ Fixed                      | #PR       |
| Links lose URL data                             | ✅ Fixed                      | #PR       |
| Large code blocks become paragraphs             | ✅ Fixed                      | #PR       |
| Nested list content lost                        | ✅ Fixed                      | #PR       |
| _category_.json only for English                | ✅ Verified (already correct) | N/A       |

---

## Known Issues (Deferred)

## Implementation Audit (Post-fix Review)

This section reflects the current implementation status after the latest parity, callout, and markdown-to-Notion fixes landed.

### Resolved in implementation ✅

- **#1 Setext-style headings not detected** → Fixed in tokenizer (`h1`/`h2` setext detection).
- **#2 Nested list detection missing in harness** → Fixed via list-depth-aware list tokens (`ul:<depth>`, `ol:<depth>`).
- **#3 Indented code blocks not detected** → Fixed with explicit indented code tokenization (`code-indented`).
- **#4 Admonition content detection incomplete** → Fixed by scoping structural tokens within admonitions (`admonition-body:*`) and validating boundary-sensitive structure parity.
- **#5 Media removal patterns incomplete** → Fixed for reference-style images and validated against parity harness media stripping behavior.
- **#6 Table alignment markers treated as rows** → Fixed by filtering alignment rows from table content tokens.
- **#7 Locale-sensitive sorting** → Fixed via explicit `localeCompare(..., "en")`.
- **#8 Code language mapping incomplete** → Fixed by expanding language aliases and normalizing code language mapping.
- **#9 Empty list items skipped** → Fixed by preserving empty list entries as whitespace list items.
- **#12 Type assertion uses `any`** → Fixed in callout text extraction and callout block narrowing paths.
- **#14 Aggregate Notion API block limits** → Addressed with a per-page safety limit and specific failure messaging before append calls.
- **#15 Structure parity false positives** → Improved with `LOCALE_PARITY_STRICTNESS=relaxed` mode (strict remains default).
- **#16 Language-specific typography in normalization** → Improved punctuation classes to include inverted punctuation and locale-aware separators.
- **#17 Error granularity in translation pipeline** → Fixed with specific empty-content/no-supported-blocks and block-limit error messages.
- **#18 Icon stripping without separator can remove intentional content** → Fixed with conservative fallback stripping behavior and regression test (`👁️is`).
- **#19 Frontmatter regex in parity harness is not CRLF-safe** → Fixed with `?` frontmatter matching.

### Remaining known limitations ⚠️

- **#10 Hardcoded Docusaurus path** → Still intentionally static in harness for current repository layout.
- **#11 Frontmatter parity validation** → Still optional/not enforced by the current parity harness.
- **#13 Fallback grapheme handling on old Node runtimes** → Low-priority compatibility caveat if running legacy Node.

### Additional issues noticed during review

1. **Strictness mode discoverability**: `LOCALE_PARITY_STRICTNESS` is env-driven; document this in workflow docs for translator-facing clarity.
2. **Parity mismatch diagnostics UX**: first-token mismatch logging exists, but richer diff output would further improve debugging ergonomics.

## Relevance Verification and Merge-Readiness Plan

Reviewed against current implementation to identify what is still relevant for a "perfect" translation parity PR. Decisions below bias toward fixing even minor correctness and determinism gaps.

### Keep and Fix in This PR (high confidence, merge-blocking for perfection)

1. **#1 Setext-style headings not detected** → **Relevant**. The tokenizer currently only detects ATX headings (`#`) and does not recognize setext heading pairs.
2. **#2 Nested list detection missing in harness** → **Relevant**. List tokenization still ignores indentation depth.
3. **#3 Indented code blocks not detected** → **Relevant**. Only fenced blocks are tracked.
4. **#4 Admonition content detection incomplete** → **Relevant**. Only fence markers are tokenized; content shape inside admonitions can drift silently.
5. **#5 Media removal patterns incomplete** → **Relevant**. Reference-style image patterns are still not covered.
6. **#6 Table alignment markers treated as rows** → **Relevant**. Alignment separators continue to create noisy parity tokens.
7. **#7 Locale-sensitive sorting** → **Relevant**. `localeCompare` remains locale-implicit, which can vary by runtime environment.
8. **#15 Structure parity false positives** → **Relevant**. Current strict token equality can fail valid editorial translation choices.
9. **#19 Frontmatter regex not CRLF-safe** → **Relevant**. Harness frontmatter regex still only uses LF.
10. **#18 Icon stripping without separator can remove intentional content** → **Relevant**. Fallback removal behavior still strips icon-adjacent content aggressively.

### Fix in Follow-Up (important, but not required for parity harness correctness)

1. **#8 Code language mapping incomplete** → Relevant but broader surface area; improve via alias table + tests.
2. **#9 Empty list items skipped** → Relevant for roundtrip fidelity; should be fixed with focused parser behavior tests.
3. **#14 Aggregate Notion API block limits** → Relevant for very large pages; requires integration-oriented validation.
4. **#16 Language-specific typography normalization** → Relevant for multilingual robustness; audit punctuation classes comprehensively.
5. **#17 Error granularity in translation pipeline** → Relevant for operations/debugging quality.
6. **#12 Type assertion uses `any`** → Relevant as type safety debt; low product risk but worth cleaning.

### Can Be Explicitly De-prioritized (documented rationale)

1. **#10 Hardcoded Docusaurus path** → Keep as known limitation unless repo structure is expected to change soon.
2. **#11 Frontmatter not validated** → Optional parity mode; useful but not critical for structural parity.
3. **#13 Fallback grapheme handling on old Node** → Low relevance if supported runtime baseline is modern Node/Bun.

## Implementation Plan to Reach "Perfect" Translation Parity

### Phase 1: Tokenizer correctness hardening (primary merge target)

1. Update `tokenizeStructure` to support setext headings, nested list depth, indented code blocks, and table alignment filtering.
2. Replace current admonition token handling with block-boundary tracking that captures internal structure tokens deterministically.
3. Extend media stripping to include reference-style image syntax and multiline-safe HTML handling where needed.
4. Make sorting deterministic by passing explicit locale in all `localeCompare` calls.
5. Make `FRONTMATTER_REGEX` CRLF-safe (`\r?\n`).

### Phase 2: Strictness without noisy false positives

1. Introduce a strictness mode for structure parity (default strict in CI, optional relaxed mode for editorial workflows).
2. In relaxed mode, allow bounded variations (e.g., paragraph splits/merges) while still enforcing headings, lists, code, admonitions, and table structure.
3. Add clear mismatch diagnostics so failures are actionable (show first token divergence and nearby context).

### Phase 3: Callout/icon safety refinement

1. Adjust `stripIconFromLines` fallback so icon stripping without separator/space is conservative.
2. Add fixtures for edge cases like `👁️is` to prevent semantic content loss.

### Phase 4: Test expansion and confidence gate

1. Add targeted tests for each fixed issue in `scripts/locale-parity.test.ts` and callout tests where relevant.
2. Add regression cases for CRLF, setext headings, nested list depth changes, indented code, and table alignment-only formatting changes.
3. Run targeted lint/format/tests for changed files and include a concise pass/fail matrix in PR notes.

### Suggested Execution Order

1. Ship Phase 1 and Phase 4 tests together.
2. Ship Phase 3 in the same PR if scope remains small; otherwise, a fast follow-up PR.
3. Ship Phase 2 strictness toggle as a separate, explicit behavior-change PR.

### P1 - High Priority

These issues should be addressed in a follow-up release:

#### 1. Setext-Style Headings Not Detected

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 169-174
- **Issue**: Only ATX headings (`#`) are tokenized. Setext headings (`Title
===`) are not compared.
- **Impact**: Structure mismatches in documents using setext formatting may go undetected.
- **Recommendation**: Add regex patterns for `^.+$
=+$` (h1) and `^.+$
-+$` (h2).

#### 2. Nested List Detection Missing in Harness

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 195-199
- **Issue**: Regex `/^[-*+]\s+/u` only matches top-level list items.
- **Impact**: A translator converting a flat list to nested structure (`- Item
  - Nested`) would not be flagged.
- **Recommendation**: Add recursive regex patterns for indented nested lists.

#### 3. Indented Code Blocks Not Detected

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 158-167
- **Issue**: Only fenced code blocks (` ``` `) are handled, not indented code (4+ leading spaces).
- **Impact**: Source documents using indented code will have incorrect structure tokenization.
- **Recommendation**: Add detection for lines starting with 4+ spaces followed by non-list content.

#### 4. Admonition Content Detection Incomplete

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 176-187
- **Issue**: Only opening `:::type` line is captured. Multi-paragraph admonitions not properly compared.
- **Impact**: Translators splitting admonitions into multiple paragraphs may not trigger structure warnings.
- **Recommendation**: Track admonition boundaries and compare full content blocks.

#### 14. Aggregate Notion API Block Limits

- **File**: `scripts/notion-translate/markdownToNotion.ts`
- **Issue**: While individual rich text limits (2000 chars) are handled by splitting, very large pages may still exceed the total block count limit per page or per `children.append` request (100 blocks).
- **Impact**: Incomplete page creation for extremely long documents.
- **Recommendation**: Verify verification for total page limits and ensure robust pagination for `children.append` calls.

---

### P2 - Medium Priority

These issues have lower impact but should be addressed for robustness:

#### 5. Media Removal Patterns Incomplete

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 114-122
- **Issue**: Missing patterns for reference-style images (`![alt][ref]`) and multi-line HTML tags.
- **Impact**: False positive structure mismatches when translators add reference-style images.
- **Recommendation**: Add regex for `[!\[].*?\]\[.*?\]` pattern.

#### 6. Table Alignment Markers Treated as Rows

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 213-217
- **Issue**: Separator rows (`|---|`) treated as content rows.
- **Impact**: Minor diff noise when translators re-align table formatting.
- **Recommendation**: Distinguish separator rows from content in tokenizer.

#### 7. Locale-Sensitive Sorting

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 60, 80
- **Issue**: `localeCompare` used without explicit locale, could produce non-deterministic results across platforms.
- **Impact**: Inconsistent ordering on different Node.js versions or locales.
- **Recommendation**: Use `localeCompare('en')` for explicit sorting.

#### 8. Code Language Mapping Incomplete

- **File**: `scripts/notion-translate/markdownToNotion.ts`
- **Lines**: 619-641
- **Issue**: Only 17 common languages mapped; others default to "plain text".
- **Impact**: Syntax highlighting lost for uncommon languages.
- **Recommendation**: Expand language map or use a comprehensive library.

#### 9. Empty List Items Skipped

- **File**: `scripts/notion-translate/markdownToNotion.ts`
- **Lines**: 179-182
- **Issue**: Items with only whitespace are skipped entirely.
- **Impact**: Numbering gaps in ordered lists.
- **Recommendation**: Preserve empty items as whitespace-only content.

#### 15. Structure Parity False Positives

- **File**: `scripts/locale-parity.test.ts`
- **Issue**: The parity test is highly strict and may flag intentional structural adjustments (e.g., splitting paragraphs for readability in target language) as mismatches.
- **Impact**: Unnecessary CI failures for valid editorial decisions.
- **Recommendation**: Introduce a "strictness" toggle or allow specific structural deviations to be ignored.

#### 16. Language-Specific Typography in Normalization

- **File**: `scripts/notion-fetch/calloutProcessor.ts`, `scripts/notion-fetch/markdownTransform.ts`
- **Issue**: Normalization regexes for punctuation may have blind spots for non-English marks (e.g., Spanish inverted marks `¿`, `¡`).
- **Impact**: Incorrect icon/title stripping for specific locales.
- **Recommendation**: Audit and expand punctuation classes to include all relevant Unicode marks.

#### 18. Icon Stripping Without Separator Can Remove Intentional Content

- **File**: `scripts/notion-fetch/calloutProcessor.ts`
- **Issue**: `stripIconFromLines` now removes the leading icon even when no separator or whitespace follows (e.g., `👁️is`), which may be part of intended text.
- **Impact**: Potential content corruption in callouts where emoji is semantically attached to the first token.
- **Recommendation**: Gate fallback icon removal behind a separator/whitespace check or add a strict mode for conservative stripping.

---

### P3 - Low Priority

These are minor issues or known limitations:

#### 10. Hardcoded Docusaurus Path

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 26-38
- **Issue**: Path `i18n/{locale}/docusaurus-plugin-content-docs/current` is hardcoded.
- **Impact**: Brittle if Docusaurus configuration changes.
- **Recommendation**: Make configurable via constants.

#### 11. Frontmatter Not Validated

- **File**: `scripts/locale-parity.test.ts`
- **Lines**: 111-112
- **Issue**: Frontmatter stripped before comparison; differences not validated.
- **Impact**: Missing frontmatter translation issues undetected.
- **Recommendation**: Add optional frontmatter parity checking.

#### 12. Type Assertion Uses `any`

- **File**: `scripts/notion-fetch/calloutProcessor.ts`
- **Lines**: 82-84
- **Issue**: Type safety bypassed with `as any`.
- **Impact**: Could break silently if API response structure changes.
- **Recommendation**: Add proper typing for Notion API responses.

#### 13. Fallback Grapheme Handling

- **File**: `scripts/notion-fetch/markdownTransform.ts`
- **Lines**: 16-32
- **Issue**: `Intl.Segmenter` fallback may not handle complex emoji on older Node.
- **Impact**: Normalization issues on Node.js < 14.
- **Recommendation**: Document minimum Node.js version requirement.

#### 17. Error Granularity in Translation Pipeline

- **File**: `scripts/notion-translate/markdownToNotion.ts`
- **Issue**: Several failure modes throw a generic `EMPTY_TRANSLATED_CONTENT_ERROR`.
- **Impact**: Slower debugging when a specific page fails to sync.
- **Recommendation**: Provide specific error messages including page title and reason (e.g., "all nodes unsupported").

#### 19. Frontmatter Regex in Parity Harness Is Not CRLF-Safe

- **File**: `scripts/locale-parity.test.ts`
- **Issue**: `FRONTMATTER_REGEX` only matches `\n`, not `\r\n`.
- **Impact**: Windows-formatted markdown may retain frontmatter during parity tokenization, producing false mismatches.
- **Recommendation**: Use a CRLF-compatible pattern (e.g., `\r?\n`) consistent with other parser utilities.

---

## Test Coverage Gaps

The following scenarios lack test coverage:

| Scenario                     | File                     | Impact         |
| ---------------------------- | ------------------------ | -------------- |
| Callout with paragraph child | calloutProcessor.test.ts | ✅ Covered     |
| Callout with nested list     | calloutProcessor.test.ts | ✅ Covered     |
| Callout with mixed children  | calloutProcessor.test.ts | ✅ Covered     |
| Missing translation files    | locale-parity.test.ts    | ✅ Covered     |
| Bold text roundtrip          | markdownToNotion.test.ts | ✅ Covered     |
| Link URL preservation        | markdownToNotion.test.ts | ✅ Covered     |
| Large code blocks            | markdownToNotion.test.ts | ✅ Covered     |
| Nested lists                 | markdownToNotion.test.ts | ✅ Covered     |
| Definition lists             | -                        | ❌ Not covered |
| Task lists (checkboxes)      | -                        | ❌ Not covered |
| Footnotes                    | -                        | ❌ Not covered |
| Tables (complex)             | -                        | ❌ Not covered |
| Setext headings              | locale-parity.test.ts    | ❌ Not covered |
| Nested lists in harness      | locale-parity.test.ts    | ❌ Not covered |
| Indented code blocks         | locale-parity.test.ts    | ❌ Not covered |

---

## Architecture Notes

### Roundtrip Limitations

The markdown → Notion → markdown roundtrip is intentionally lossy for certain elements:

1. **Images**: Converted to static text references (by design)
2. **Callouts**: Converted to Docusaurus admonitions (lossy Notion→markdown direction)
3. **Complex tables**: May lose advanced formatting

These limitations are inherent to the Notion API and are documented as acceptable trade-offs.

### Docusaurus i18n Behavior

Based on Docusaurus documentation (see issue #8996):

- Category labels should be translatable via `write-translations` command
- Each locale needs equivalent folder structure including `_category_.json`
- Current implementation creates `_category_.json` for all locales (verified correct)

---

## Future Work

Suggested priority for future improvements:

1. **Phase 1** (P1): Add setext heading, nested list, and indented code detection to harness
2. **Phase 2** (P2): Expand test coverage for edge cases (tables, footnotes, task lists)
3. **Phase 3** (P3): Improve type safety and configuration flexibility

---

_Last updated: 2026-02-19_
_Review cycle: Post-merge validation_
