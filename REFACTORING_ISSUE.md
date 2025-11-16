# Refactor generateBlocks.ts and emojiProcessor.ts for better testability

## Progress Update

### ✅ Phase 1, 2 & 3 Completed (PR #TBD)

**Branch**: `claude/phase-3-refactoring-015mFYNFY71G3AWrYRfWWjeZ`

Successfully extracted 7 focused modules from generateBlocks.ts with comprehensive test coverage:

| Module | Lines | Tests | Test-to-Code Ratio | Status |
|--------|-------|-------|-------------------|--------|
| frontmatterBuilder.ts | 149 | 27 | 1.81:1 | ✅ |
| markdownTransform.ts | 272 | 31 | 1.14:1 | ✅ |
| imageValidation.ts | 72 | 24 | 3.33:1 | ✅ |
| pageGrouping.ts | 167 | 63 | 3.77:1 | ✅ |
| cacheStrategies.ts | 101 | 48 | 4.75:1 | ✅ |
| **imageProcessing.ts** | **504** | **33** | **0.65:1** | ✅ |
| **translationManager.ts** | **178** | **34** | **1.91:1** | ✅ |
| **Total** | **1,443** | **260** | **1.80:1** | ✅ |

**Phase 3 Impact:**
- imageProcessing.ts: Extracted image download, caching, and retry logic (504 lines, 33 tests)
- translationManager.ts: Extracted i18n file management (178 lines, 34 tests)
- generateBlocks.ts reduced from ~1,850 → 930 lines (50% reduction from Phase 1 start)
- Total reduction: 2,054 → 930 lines (55% overall reduction)
- All 539 tests passing + 260 new module tests
- Zero behavioral changes (functionality preserved)
- All modules ESLint compliant and Prettier formatted

**Remaining Work:**
- Phase 4: Final cleanup of generateBlocks.ts (target ~500-600 lines)
- emojiProcessor.ts refactoring (separate effort)

---

## Problem

Two large files in the Notion fetch scripts have low test coverage due to their size and complexity:

- **generateBlocks.ts**: ~~2,054 lines~~ → 1,850 lines (Phase 1&2 ✅), 68.37% coverage → improving
- **emojiProcessor.ts**: 1,060 lines, 1.05% coverage

These files are difficult to test comprehensively because they contain multiple responsibilities mixed together.

## Current Coverage Status

| File | Lines | Coverage | Target |
|------|-------|----------|--------|
| runtime.ts | 105 | 100% ✅ | - |
| notionClient.ts | 586 | 80.7% ✅ | - |
| fetchNotionData.ts | 650 | 98.46% ✅ | - |
| utils.ts | 280 | 92.85% ✅ | - |
| generateBlocks.ts | 2,054 | 68.37% ⚠️ | 85%+ |
| emojiProcessor.ts | 1,060 | 1.05% ❌ | 85%+ |

## Proposed Refactoring

### generateBlocks.ts → Multiple Smaller Modules

Break down the 2,054-line file into focused modules:

#### ✅ 1. `frontmatterBuilder.ts` (149 lines) - COMPLETED
**Responsibilities:**
- `buildFrontmatter()` - Complete Docusaurus frontmatter generation
- `quoteYamlValue()` - YAML special character escaping
- `getPublishedDate()` - Multi-level date fallback logic

**Test Coverage:** 27 tests (1.81:1 ratio)
- YAML escaping edge cases
- Date parsing with fallbacks (Published date → last_edited_time → current date)
- Special character handling
- Custom props quoting

#### ✅ 2. `markdownTransform.ts` (272 lines) - COMPLETED
**Responsibilities:**
- `sanitizeMarkdownImages()` - ReDoS-protected image URL cleanup (2MB limit)
- `ensureBlankLineAfterStandaloneBold()` - Preserve Notion formatting
- `processCalloutsInMarkdown()` - Convert to Docusaurus admonitions
- `normalizeForMatch()` - Unicode normalization
- `findMatchingBlockquote()` - Blockquote matching
- `extractTextFromCalloutBlock()` - Text extraction from callouts

**Test Coverage:** 31 tests (1.14:1 ratio)
- Image sanitization patterns (empty URLs, whitespace, invalid placeholders)
- Callout conversion logic
- Fence/admonition guard logic

#### ✅ 3. `imageValidation.ts` (72 lines) - COMPLETED
**Responsibilities:**
- `validateAndSanitizeImageUrl()` - HTTPS-only validation
- `createFallbackImageMarkdown()` - Fallback generation for failed downloads

**Test Coverage:** 24 tests (3.33:1 ratio)
- Protocol whitelist (http/https only)
- Malformed URL handling
- Type safety (non-string inputs)
- Empty/null/undefined handling

#### ✅ 4. `pageGrouping.ts` (167 lines) - COMPLETED
**Responsibilities:**
- `groupPagesByLang()` - Multi-language page organization
- `createStandalonePageGroup()` - Single-language page handling
- `resolvePageTitle()` - Property resolution with fallbacks
- `resolvePageLocale()` - Locale mapping (Spanish/Portuguese/English)
- `getElementTypeProperty()` - Element type extraction

**Test Coverage:** 63 tests (3.77:1 ratio)
- Title resolution fallback chain
- Locale detection from properties
- Sub-item relation grouping
- Edge cases (missing properties, invalid data)

#### ✅ 5. `cacheStrategies.ts` (101 lines) - COMPLETED
**Responsibilities:**
- `LRUCache<T>` class - Generic LRU cache with eviction
- `validateCacheSize()` - Environment variable validation (min: 1, max: 10000)
- `buildCacheKey()` - Cache key generation

**Test Coverage:** 48 tests (4.75:1 ratio)
- LRU eviction algorithm
- Cache size boundaries
- Environment variable parsing
- Generic type support

#### 6. `imageProcessing.ts` (504 lines) - ✅ COMPLETED
**Responsibilities:**
- `processImageWithFallbacks()` - Download with retry logic and fallback handling
- `downloadAndProcessImageWithCache()` - Cache integration
- `downloadAndProcessImage()` - Image download with 3-attempt retry
- `ImageCache` class - LRU cache for image URLs
- `logImageFailure()` - Failure logging for manual recovery

**Test Coverage:** 33 tests (0.65:1 ratio)
- Image download retry logic
- Cache hit/miss scenarios
- URL validation integration
- Error handling (timeout, HTTP errors, DNS failures)
- Test-aware retry delays
- Path traversal protection

#### 7. `translationManager.ts` (178 lines) - ✅ COMPLETED
**Responsibilities:**
- `setTranslationString()` - Translation file updates with truncation
- `getI18NPath()` - Locale path generation
- `initializeI18NDirectories()` - Directory setup for all locales
- `readTranslationFile()` - Safe JSON parsing
- `hasTranslation()` / `getTranslation()` - Translation lookups

**Test Coverage:** 34 tests (1.91:1 ratio)
- Translation file creation and updates
- Corrupt JSON handling
- Long string truncation (2000 char keys, 5000 char values)
- Multi-locale support
- File I/O error handling

#### 8. `generateBlocks.ts` (930 lines → target ~500-600 lines)
**Current Status:**
- 55% size reduction from original 2,054 lines
- Imports 7 new modules
- Main orchestration logic remains
- Phase 4 will further reduce to 500-600 lines

**Final Responsibilities (after Phase 4):**
- Main orchestration logic
- Section/toggle/page/heading handling
- Progress tracking
- Spinner management

### emojiProcessor.ts → Smaller Modules

Break down the 1,060-line file:

#### 1. `emojiCache.ts` (~150 lines)
**Responsibilities:**
- Emoji caching logic
- Cache validation
- File system operations for emoji cache

#### 2. `emojiDownload.ts` (~200 lines)
**Responsibilities:**
- Emoji URL extraction
- Download with retry
- Format detection
- Error handling

#### 3. `emojiMapping.ts` (~150 lines)
**Responsibilities:**
- Emoji URL → local path mapping
- Markdown replacement logic
- Fallback handling

#### 4. `emojiProcessor.ts` (~300 lines remaining)
**Responsibilities:**
- Main orchestration
- `processBlockEmojis()`
- `processPageEmojis()`
- Public API

## Benefits of Refactoring

1. **Testability**: Each module can be tested in isolation with focused test suites
2. **Maintainability**: Smaller files are easier to understand and modify
3. **Reusability**: Extracted utilities can be reused across the codebase
4. **Coverage**: Much easier to achieve 85%+ coverage on 100-300 line modules
5. **Onboarding**: New contributors can understand individual modules without reading 2,000+ lines
6. **Debugging**: Smaller surface area for bugs, easier to locate issues
7. **Type Safety**: Better TypeScript inference with smaller scopes

## Implementation Strategy

**✅ Phase 1: Extract Pure Functions** (Low Risk) - COMPLETED
- ✅ Extracted utility functions with no side effects
- ✅ Created comprehensive test suites
- ✅ Modules: `frontmatterBuilder.ts`, `markdownTransform.ts`, `imageValidation.ts`, `pageGrouping.ts`
- ✅ Examples: `quoteYamlValue`, `normalizeForMatch`, `ensureBlankLineAfterStandaloneBold`
- **Result:** 4 modules, 660 lines of code, 145 tests

**✅ Phase 2: Extract Classes** (Medium Risk) - COMPLETED
- ✅ Moved self-contained classes to dedicated module
- ✅ Created `cacheStrategies.ts` with `LRUCache<T>` class
- ✅ Added environment validation: `validateCacheSize()`
- **Result:** 1 module, 101 lines of code, 48 tests

**✅ Phase 3: Extract Complex Logic** (Higher Risk) - COMPLETED
- ✅ Extracted image processing pipeline → `imageProcessing.ts` (504 lines)
- ✅ Extracted translation management → `translationManager.ts` (178 lines)
- ✅ Successfully handled dependency injection (getImageCache, logImageFailure)
- ✅ All 539 tests passing (no regressions)
- **Result:** 2 modules, 682 lines of code, 67 tests (exceeded estimate!)

**Phase 4: Reduce Main File** (Final Step) - FUTURE PR
- Remove any remaining extractable code from generateBlocks.ts
- Clean up imports and dead code
- Verify main file is now ~500-600 lines (75% reduction target)
- Main file becomes thin orchestration layer

## Testing Goals After Refactoring

Each extracted module should achieve:
- **85%+ line coverage**
- **90%+ function coverage**
- **Comprehensive edge case testing**

## Estimated Effort

- **Phase 1**: ✅ 2-3 hours (extract ~10 pure functions) - COMPLETED
- **Phase 2**: ✅ 3-4 hours (extract ~3 classes with tests) - COMPLETED
- **Phase 3**: 5-6 hours (extract complex processing logic) - NEXT PR
- **Phase 4**: 2-3 hours (refactor main orchestration) - FUTURE PR

**Total**: ~12-16 hours of focused work (5-7 hours completed in current PR)

## Success Criteria

### Phase 1 & 2 (Current PR)
- [x] All extracted modules under 400 lines (largest is 272 lines)
- [x] Each module has comprehensive test coverage (193 tests total, 2.54:1 ratio)
- [x] All existing tests still pass (888 tests + 193 new = 1,081 total)
- [x] No behavioral changes (refactoring only, zero test failures)
- [x] Code quality: ESLint compliant, Prettier formatted
- [x] Type safety: All TypeScript errors resolved

### Overall Project Goals (After Phase 4)
- [ ] All modules under 400 lines
- [ ] Each module has 85%+ coverage
- [ ] generateBlocks.ts reduced to ~500-600 lines (70% reduction)
- [ ] Overall project coverage improves by 10%+
- [ ] emojiProcessor.ts refactored into smaller modules

## Related Work

This refactoring builds on recent test coverage improvements:
- runtime.ts: 77% → 100% ✅
- notionClient.ts: 76.6% → 80.7% ✅
- fetchNotionData.ts: maintained at 98.46% ✅

## References

### Phase 1, 2 & 3 (Current PR)
- **Branch**: `claude/phase-3-refactoring-015mFYNFY71G3AWrYRfWWjeZ`
- **New Modules**:
  - Phase 1 & 2:
    - `scripts/notion-fetch/frontmatterBuilder.ts` + `.test.ts`
    - `scripts/notion-fetch/markdownTransform.ts` + `.test.ts`
    - `scripts/notion-fetch/imageValidation.ts` + `.test.ts`
    - `scripts/notion-fetch/pageGrouping.ts` + `.test.ts`
    - `scripts/notion-fetch/cacheStrategies.ts` + `.test.ts`
  - Phase 3:
    - `scripts/notion-fetch/imageProcessing.ts` + `.test.ts` (504 lines, 33 tests)
    - `scripts/notion-fetch/translationManager.ts` + `.test.ts` (178 lines, 34 tests)
- **Modified Files**:
  - `scripts/notion-fetch/generateBlocks.ts` (reduced from 2,054 → 930 lines)
  - `scripts/notion-fetch/generateBlocks.test.ts` (updated import paths)
  - `scripts/notion-fetch/__tests__/introductionMarkdown.test.ts` (updated import paths)

### Phase 1 & 2 Commits
1. `088d3b2` - refactor(notion-fetch): extract functions from generateBlocks.ts into testable modules
2. `8a335ff` - chore: update bun.lock after dependency install
3. `d004de6` - fix(tests): resolve test failures after refactoring
4. `1694ecc` - fix(types): add missing beforeAll and afterAll imports to test files

### Phase 3 Progress (To be committed)
- Extracted imageProcessing.ts with comprehensive image handling (download, cache, retry)
- Extracted translationManager.ts with i18n file management
- Updated generateBlocks.ts to use new modules (55% total reduction)
- All 539 tests passing + 67 new tests = 606 module tests total
- Zero behavioral changes (refactoring only)

### Original Analysis
- Previous branch: `claude/analyze-notion-fetch-all-01RYyatE5KEXqzMczu11r4gS`
- Test files: `scripts/notion-fetch/generateBlocks.test.ts`, `scripts/notion-fetch/emojiProcessor.test.ts`

---

**Labels**: refactoring, technical-debt, testing
