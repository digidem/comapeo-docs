# Test Failure Investigation Guide

## How to Share Test Failures

Please run tests and share the output:

```bash
# Full test run
npm test 2>&1 | tee test-output.txt

# Or specific test files
npm run test:scripts -- scripts/fetchNotionData.test.ts 2>&1
npm run test:scripts -- scripts/notion-fetch/generateBlocks.test.ts 2>&1
```

Then share the error messages showing:
1. Which tests are failing
2. Error messages/stack traces
3. Expected vs actual values

## Likely Failure Scenarios Based on Our Changes

### Scenario 1: Module Mock Issues

**Symptoms**:
```
Error: Cannot find module './notionClient'
TypeError: enhancedNotion.blocksChildrenList is not a function
```

**Cause**: Mock not properly hoisted or module path incorrect

**Fix**: Check that `vi.mock()` is at the top level, before describe blocks

### Scenario 2: Pagination Loop Issues

**Symptoms**:
```
Timeout: Test exceeded 5000ms
InfiniteLoop: Maximum call stack size exceeded
```

**Cause**: Mock missing `has_more: false`, causing infinite pagination loop

**Current Status**: ✅ Should be fixed - we added `has_more: false` in commit 5f0b6fb

**Verify**: Check that all `blocksChildrenList` mocks include:
```typescript
{
  results: [...],
  has_more: false,
  next_cursor: null
}
```

### Scenario 3: Missing Mock Properties

**Symptoms**:
```
TypeError: Cannot read property 'results' of undefined
TypeError: Cannot read property 'has_more' of undefined
```

**Cause**: Mock response missing required properties

**Files to Check**:
- `scripts/fetchNotionData.test.ts` - ✅ Fixed in 5f0b6fb
- `scripts/notionClient.test.ts` - Should already have proper mocks
- `scripts/notion-fetch/generateBlocks.test.ts` - Mocks fetchNotionBlocks directly

### Scenario 4: Cache Counter Object vs Primitive

**Symptoms**:
```
TypeError: Cannot read property 'value' of undefined
AssertionError: expected 0 to equal 1
```

**Cause**: Tests expecting counter primitives but code uses counter objects

**Current Status**: ✅ Low risk - no tests found asserting on counter values

**If This Occurs**: Tests are incorrectly asserting on internal implementation details

### Scenario 5: Image Compression Error Types

**Symptoms**:
```
TypeError: PngQualityTooLowError is not a constructor
Error: Cannot find module './imageCompressor'
```

**Cause**: Tests not importing/mocking new error class

**File to Check**: `scripts/notion-fetch/imageCompressor.test.ts`

**Fix**:
```typescript
import { PngQualityTooLowError } from './imageCompressor';

// In test:
it('should handle quality too low errors', () => {
  const error = new PngQualityTooLowError('60-80', 'stderr');
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe(99);
});
```

### Scenario 6: Environment Variable Issues

**Symptoms**:
```
Error: Missing NOTION_API_KEY
Error: DATABASE_ID is not defined
```

**Cause**: installTestNotionEnv not called or not working

**Current Status**: ✅ Should be fine - tests call `installTestNotionEnv()`

**Verify**: Check that `beforeEach` calls `restoreEnv = installTestNotionEnv()`

## Systematic Debugging Steps

### Step 1: Run Tests in Isolation

```bash
# Test each file individually to isolate failures
npm run test:scripts -- scripts/fetchNotionData.test.ts
npm run test:scripts -- scripts/notionClient.test.ts
npm run test:scripts -- scripts/notion-fetch/generateBlocks.test.ts
npm run test:scripts -- scripts/notion-fetch/exportDatabase.test.ts
npm run test:scripts -- scripts/notion-fetch/imageCompressor.test.ts
```

### Step 2: Check Mock Setup

For each failing test file, verify:

1. **Mock location**: `vi.mock()` calls before `describe` blocks
2. **Mock completeness**: All required properties included
3. **Mock types**: Match actual module exports

### Step 3: Compare Against Working Tests

Look at `scripts/notionClient.test.ts` which should be passing:

```typescript
// This test already has proper has_more handling:
const blocksData = { results: [], has_more: false };
mockClient.blocks.children.list.mockResolvedValue(blocksData);
```

### Step 4: Add Debug Logging

If tests are timing out, add logging:

```typescript
vi.mock("./notionClient", () => {
  const mock = vi.fn().mockImplementation((params) => {
    console.log('[TEST] blocksChildrenList called with:', params);
    return Promise.resolve({
      results: [],
      has_more: false,
      next_cursor: null
    });
  });

  return {
    enhancedNotion: {
      blocksChildrenList: mock,
      // ...
    }
  };
});
```

## Quick Fixes by File

### scripts/fetchNotionData.test.ts

**Status**: ✅ Should be fixed (commit 5f0b6fb)

**If still failing**, verify mock is properly structured:

```typescript
// Top of file, before describe
vi.mock("./notionClient", () => ({
  enhancedNotion: {
    blocksChildrenList: vi.fn().mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    }),
    dataSourcesQuery: vi.fn().mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    }),
  },
  DATABASE_ID: "test-db-id",
  DATA_SOURCE_ID: "test-data-source-id",
  n2m: {
    pageToMarkdown: vi.fn().mockResolvedValue([]),
    toMarkdownString: vi.fn().mockReturnValue({ parent: "" }),
  },
}));
```

### scripts/notion-fetch/exportDatabase.test.ts

**Status**: ✅ Should be fixed (commit e7f6cd4)

**Verification**: Check that mocks use `dataSourcesQuery` not `databasesQuery`

### scripts/notion-fetch/generateBlocks.test.ts

**Status**: ✅ Should be passing

**Reason**: Mocks `fetchNotionBlocks` directly, bypassing implementation

**If failing**: Check that mock returns an array:
```typescript
vi.mock("../fetchNotionData", () => ({
  fetchNotionBlocks: vi.fn().mockResolvedValue([]),
}));
```

### scripts/notion-fetch/imageCompressor.test.ts

**Status**: ⚠️ Needs verification

**Potential Issues**:
1. Not importing `PngQualityTooLowError`
2. Not mocking environment variables
3. Tests expecting PNG compression to always run

**Fixes**:

```typescript
// Add imports
import {
  compressImage,
  PngQualityTooLowError
} from './imageCompressor';

// Mock environment variables in beforeEach
beforeEach(() => {
  process.env.PNGQUANT_QUALITY = '60-80';
  process.env.PNGQUANT_MIN_SIZE_BYTES = '0';
  process.env.PNGQUANT_VERBOSE = 'false';
});

// Add test for new error type
it('should create PngQualityTooLowError', () => {
  const error = new PngQualityTooLowError('60-80', 'quality too low');
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('PngQualityTooLowError');
  expect(error.code).toBe(99);
});
```

## Expected Test Results

### Should Pass (95% Confidence)
- ✅ `scripts/fetchNotionData.test.ts` - Mock added
- ✅ `scripts/notionClient.test.ts` - Already had proper mocks
- ✅ `scripts/notion-fetch/exportDatabase.test.ts` - Fixed in e7f6cd4
- ✅ `scripts/notion-fetch/generateBlocks.test.ts` - Mocks bypass implementation

### Needs Verification (70% Confidence)
- ⚠️ `scripts/notion-fetch/imageCompressor.test.ts`
- ⚠️ Integration tests that might use real implementations

### Should Not Be Affected
- ✅ All tests unrelated to:
  - Notion API calls
  - Block fetching
  - Image compression

## Next Steps

1. **Run tests** and capture output
2. **Share error messages** with file names, line numbers, and stack traces
3. **I'll provide specific fixes** based on actual failures

## Files Modified in This Branch

Review these files for potential test impact:

```
Commit 55c39ae: scripts/fetchNotionData.ts (API migration)
Commit e7f6cd4: scripts/notion-fetch/exportDatabase.test.ts (test fix)
Commit 44ff168: scripts/fetchNotionData.ts (pagination)
Commit bcfd689: scripts/notion-fetch/generateBlocks.ts (cache refactor)
Commit 5f0b6fb: scripts/fetchNotionData.test.ts (mock fix)
Commits 81feb51, 52a656c, 0003331: scripts/notion-fetch/imageCompressor.ts
```

## Rollback Strategy

If tests continue to fail and we can't identify the issue quickly:

```bash
# Check which commit broke tests
git bisect start
git bisect bad HEAD
git bisect good origin/main

# Git will checkout commits to test
npm test

# Mark as good or bad
git bisect good  # or git bisect bad

# Once found, either fix or revert
git revert <commit-hash>
```
