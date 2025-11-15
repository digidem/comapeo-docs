# Refactor generateBlocks.ts and emojiProcessor.ts for better testability

## Problem

Two large files in the Notion fetch scripts have low test coverage due to their size and complexity:

- **generateBlocks.ts**: 2,054 lines, 68.37% coverage
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

#### 1. `imageCache.ts` (~150 lines)
**Responsibilities:**
- Image cache management (ImageCache class)
- Cache validation and cleanup
- Cache statistics

**Benefits:**
- Easy to test cache hit/miss scenarios
- Easy to test LRU eviction logic
- Easy to test cleanup operations

#### 2. `imageProcessing.ts` (~300 lines)
**Responsibilities:**
- `validateAndSanitizeImageUrl()`
- `processImageWithFallbacks()`
- `downloadAndProcessImageWithCache()`
- `createFallbackImageMarkdown()`
- Image failure logging

**Benefits:**
- Isolated image URL validation testing
- Controlled retry scenario testing
- Fallback path testing

#### 3. `markdownTransform.ts` (~400 lines)
**Responsibilities:**
- `sanitizeMarkdownImages()`
- `ensureBlankLineAfterStandaloneBold()`
- `processCalloutsInMarkdown()`
- `normalizeForMatch()`
- `findMatchingBlockquote()`

**Benefits:**
- Pure function testing (input → output)
- Easy regex pattern testing
- Edge case handling

#### 4. `pageGrouping.ts` (~200 lines)
**Responsibilities:**
- `groupPagesByLang()`
- `createStandalonePageGroup()`
- `resolvePageTitle()`
- `resolvePageLocale()`
- `getElementTypeProperty()`

**Benefits:**
- Straightforward page property resolution tests
- Locale mapping tests
- Grouping logic verification

#### 5. `frontmatterBuilder.ts` (~150 lines)
**Responsibilities:**
- `buildFrontmatter()`
- `quoteYamlValue()`
- `getPublishedDate()`

**Benefits:**
- YAML escaping tests
- Date parsing fallback tests
- Frontmatter format validation

#### 6. `translationManager.ts` (~100 lines)
**Responsibilities:**
- `setTranslationString()`
- Translation file I/O
- i18n path management

**Benefits:**
- Translation file creation/update tests
- Error recovery tests
- Path resolution tests

#### 7. `cacheStrategies.ts` (~200 lines)
**Responsibilities:**
- `LRUCache` class
- `validateCacheSize()`
- `loadWithCache()` generic cache loader
- Prefetch cache management

**Benefits:**
- LRU algorithm verification
- Cache size validation tests
- Generic cache loader tests

#### 8. `generateBlocks.ts` (~500 lines remaining)
**Responsibilities:**
- Main orchestration logic
- Section/toggle/page/heading handling
- Progress tracking
- Spinner management

**Benefits:**
- Focused on business logic
- Dependencies injected/mockable
- Much easier to comprehend and maintain

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

**Phase 1: Extract Pure Functions** (Low Risk)
- Start with utility functions that have no side effects
- Move to separate files with comprehensive tests
- Examples: `quoteYamlValue`, `normalizeForMatch`, `ensureBlankLineAfterStandaloneBold`

**Phase 2: Extract Classes** (Medium Risk)
- Move self-contained classes to their own modules
- Examples: `LRUCache`, `ImageCache`

**Phase 3: Extract Complex Logic** (Higher Risk)
- Break down image processing pipeline
- Extract markdown transformation logic
- Requires careful dependency injection

**Phase 4: Reduce Main File** (Final Step)
- Main files become thin orchestration layers
- All heavy lifting delegated to focused modules

## Testing Goals After Refactoring

Each extracted module should achieve:
- **85%+ line coverage**
- **90%+ function coverage**
- **Comprehensive edge case testing**

## Estimated Effort

- **Phase 1**: 2-3 hours (extract ~10 pure functions)
- **Phase 2**: 3-4 hours (extract ~3 classes with tests)
- **Phase 3**: 5-6 hours (extract complex processing logic)
- **Phase 4**: 2-3 hours (refactor main orchestration)

**Total**: ~12-16 hours of focused work

## Success Criteria

- [ ] All modules under 400 lines
- [ ] Each module has 85%+ coverage
- [ ] All existing tests still pass
- [ ] No behavioral changes (refactoring only)
- [ ] Overall project coverage improves by 10%+

## Related Work

This refactoring builds on recent test coverage improvements:
- runtime.ts: 77% → 100% ✅
- notionClient.ts: 76.6% → 80.7% ✅
- fetchNotionData.ts: maintained at 98.46% ✅

## References

- Current test files: `scripts/notion-fetch/generateBlocks.test.ts`, `scripts/notion-fetch/emojiProcessor.test.ts`
- Branch: `claude/analyze-notion-fetch-all-01RYyatE5KEXqzMczu11r4gS`

---

**Labels**: refactoring, technical-debt, testing
