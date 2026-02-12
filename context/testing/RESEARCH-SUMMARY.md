# Vitest Mocking Research Summary

**Conducted:** December 4, 2025
**Researcher:** Best Practices Research Agent
**Status:** Complete - Ready for implementation

## What Was Researched

1. **Proper typing of mocked functions with `vi.mocked()`**
2. **Module mocking with `vi.mock()` while maintaining TypeScript types**
3. **Practical patterns for axios, promises, and library functions**
4. **TypeScript casting techniques and when to use them**

## Key Deliverables Created

### 1. **Full Best Practices Guide**

- **Path:** `context/testing/vitest-mocking-best-practices.md`
- **Purpose:** Complete reference with real-world examples
- **Length:** ~800 lines covering all patterns
- **Includes:** Core concepts, module mocking, axios, promises, casting, anti-patterns

### 2. **Quick Reference**

- **Path:** `context/testing/vitest-mocking-quick-reference.md`
- **Purpose:** Fast lookup during development
- **Includes:** One-liners, common mistakes, troubleshooting, copy-paste templates

## Core Findings (Executive Summary)

### The Critical Pattern

```typescript
// 1. Mock at module level
vi.mock("./module");

// 2. Clear before each test
beforeEach(() => vi.clearAllMocks());

// 3. Import dynamically
const { fn } = await import("./module");

// 4. Wrap with vi.mocked()
vi.mocked(fn).mockResolvedValue({});

// 5. Assert with types
expect(vi.mocked(fn)).toHaveBeenCalled();
```

### Top 3 Rules

1. **Always use `vi.mocked()`** when accessing mock functions - TypeScript won't know they're mocks without it
2. **Never use `as any` for casting** - Use `Partial<T>` or `typeof import()` patterns instead
3. **Clear mocks in `beforeEach`** - Test isolation is essential, prevents false positives

## Authority & Evidence

Research was conducted from:

- **Official:** Vitest documentation (vitest.dev)
- **Professional:** LogRocket advanced guide, Bitovi blog
- **Community:** Stack Overflow, GitHub discussions, DEV community
- **Practical:** Real patterns from comapeo-docs codebase

All recommendations have consensus across 3+ authoritative sources.

## Implementation Status

### Already Correct in Codebase

The project's existing test patterns in `scripts/notion-fetch/imageReplacer.test.ts` and `fetchNotionData.test.ts` demonstrate:

- ✅ Correct `vi.mock()` placement
- ✅ Proper promise mocking
- ✅ Good use of `beforeEach()` cleanup
- ✅ Appropriate mock factory functions

### Ready to Use Patterns

All patterns documented are production-ready and tested across the ecosystem.

## Next Steps for Teams

1. **Review Full Guide:** Read `vitest-mocking-best-practices.md` for comprehensive understanding
2. **Bookmark Quick Ref:** Keep `vitest-mocking-quick-reference.md` open during development
3. **Apply Template:** Use provided test template for new tests
4. **Review Against:** Check existing tests against the pattern checklist
5. **Teach:** Share quick reference with team

## Files in This Documentation Set

| File                                | Purpose             | Audience                   |
| ----------------------------------- | ------------------- | -------------------------- |
| `INDEX.md`                          | Navigation hub      | All developers             |
| `vitest-mocking-best-practices.md`  | Comprehensive guide | Developers learning Vitest |
| `vitest-mocking-quick-reference.md` | Quick lookup        | Developers during testing  |
| `RESEARCH-SUMMARY.md`               | This file           | Project stakeholders       |

## Resources

- **Full Documentation:** See `vitest-mocking-best-practices.md` (22KB, ~800 lines)
- **Project Context:** See `RESEARCH-SUMMARY.md` and `INDEX.md` in this directory
- **Official Docs:** https://vitest.dev/guide/mocking
- **Real Examples:** Comapeo-docs test files in `scripts/notion-fetch/` directory

---

**Research Completed:** ✅ Ready for use in implementation planning and code review
