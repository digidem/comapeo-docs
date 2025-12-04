# Vitest Testing Documentation Index

Complete reference for testing patterns and best practices in comapeo-docs.

## Quick Start

**New to testing?** Start here: `vitest-mocking-quick-reference.md`
**Want deep dive?** Read: `vitest-mocking-best-practices.md`
**Need specifics?** See: `RESEARCH-SUMMARY.md`

---

## Documents in This Directory

### 1. `vitest-mocking-quick-reference.md` (7.7 KB)

**Best for:** Quick lookup during test development

- One-liners for common tasks
- Copy-paste test templates
- Troubleshooting common errors
- Rules checklist
- Real examples from comapeo-docs

**Use when:** You're writing a test and need to remember syntax

### 2. `vitest-mocking-best-practices.md` (22 KB)

**Best for:** Learning Vitest mocking comprehensively

- Core concepts explained
- Detailed patterns with reasoning
- Library-specific examples (axios, Notion, fetch, fs)
- Anti-patterns to avoid
- Real examples from codebase
- References to official documentation

**Use when:** You need to understand WHY something works, or learning Vitest

### 3. `RESEARCH-SUMMARY.md` (2 KB)

**Best for:** Understanding research methodology and findings

- What was researched
- Key findings summary
- Authority sources consulted
- Status of existing codebase
- Next steps for teams

**Use when:** Onboarding to the project, or justifying patterns to new team members

### 4. `vitest-mocking-architecture.md` (archived)

**Not yet created** - Future document for advanced architecture patterns

---

## Core Patterns Reference

### The Essential 5-Step Pattern

```typescript
vi.mock("./dependency"); // 1. Mock at module level
beforeEach(() => vi.clearAllMocks()); // 2. Clear before each test
const { fn } = await import("./dep"); // 3. Dynamic import
vi.mocked(fn).mockResolvedValue({}); // 4. Type-safe mock
expect(vi.mocked(fn)).toHaveBeenCalled(); // 5. Assert with types
```

### Key Rules

1. ✅ Always use `vi.mocked()` when accessing mock methods
2. ✅ Never use `as any` - use `Partial<T>` or `typeof` patterns
3. ✅ Clear mocks in `beforeEach()` for test isolation
4. ✅ Place `vi.mock()` calls at module top level (will be hoisted)
5. ✅ Use `mockResolvedValue()` for promises, not `mockReturnValue()`

---

## Library-Specific Examples

### Axios HTTP Client

Location: `vitest-mocking-best-practices.md` → "Mocking Specific Libraries" → "Axios HTTP Client"

```typescript
vi.mock("axios");
vi.mocked(axios.get).mockResolvedValue({ data: { id: 1 } });
```

### Notion SDK

Location: `vitest-mocking-best-practices.md` → "Mocking Specific Libraries" → "Notion SDK"

```typescript
vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: { query: vi.fn().mockResolvedValue({ results: [] }) },
  })),
}));
```

### Global Fetch

Location: `vitest-mocking-best-practices.md` → "Mocking Specific Libraries" → "Global Fetch API"

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [] }),
} as Response);
```

### File System (fs/promises)

Location: `vitest-mocking-best-practices.md` → "Mocking Specific Libraries" → "File System Operations"

```typescript
vi.mock("fs/promises");
vi.mocked(fs.readFile).mockResolvedValue("content" as any);
```

---

## TypeScript Casting Guide

### Pattern by Scenario

| When You Have                | Use This               | Example                                                  |
| ---------------------------- | ---------------------- | -------------------------------------------------------- |
| Simple mock function         | Just wrap it           | `vi.mocked(fn)`                                          |
| Only need partial properties | `Partial<T>`           | `mockResolvedValue({} as Partial<User>)`                 |
| Complex partial with types   | `typeof import()`      | `await vi.importActual<typeof import('./mod')>('./mod')` |
| Nested object properties     | `vi.mocked(obj, true)` | `vi.mocked(axios, true).create()...`                     |
| Must cast (avoid!)           | `unknown` then type    | `as unknown as Type` (not `as any`)                      |

Full details: `vitest-mocking-best-practices.md` → "TypeScript Casting Patterns"

---

## Real Examples from comapeo-docs

### Image Processing Tests

**File:** `scripts/notion-fetch/imageReplacer.test.ts`
**Shows:** Promise mocking, multiple mock setup, instance mocking

```typescript
vi.mock("./imageProcessing", () => ({
  processImageWithFallbacks: vi.fn((url: string) => {
    if (url.includes("fail")) {
      return Promise.resolve({ success: false });
    }
    return Promise.resolve({ success: true, newPath: `/images/...` });
  }),
}));
```

### Notion API Tests

**File:** `scripts/fetchNotionData.test.ts`
**Shows:** Sequential responses, pagination, error handling

```typescript
vi.mocked(enhancedNotion.dataSourcesQuery)
  .mockResolvedValueOnce({ results: [{ id: "page1" }], has_more: true })
  .mockResolvedValueOnce({ results: [{ id: "page2" }], has_more: false });
```

Full examples: `vitest-mocking-best-practices.md` → "Project Examples"

---

## Common Mistakes & Fixes

| Problem                                      | Cause                                   | Fix                                                          |
| -------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| "Property 'mockResolvedValue' doesn't exist" | Not wrapping with `vi.mocked()`         | Use `vi.mocked(fn).mockResolvedValue()`                      |
| Mock from previous test affects this test    | Not clearing mocks                      | Add `beforeEach(() => vi.clearAllMocks())`                   |
| `vi.mock()` isn't working                    | Not at module level                     | Move to top of file (will be hoisted)                        |
| Type 'unknown' not compatible                | Using `importActual` without `typeof`   | Use `await vi.importActual<typeof import('./mod')>('./mod')` |
| Mock using wrong data type                   | Using `mockReturnValue()` with promises | Use `mockResolvedValue()` instead                            |

Full troubleshooting: `vitest-mocking-quick-reference.md` → "Troubleshooting"

---

## When to Use Each Document

### Use Quick Reference when you:

- ✅ Are in the middle of writing a test
- ✅ Need to remember syntax or patterns
- ✅ Want copy-paste templates
- ✅ Are troubleshooting an error
- ✅ Need a checklist before committing

### Use Full Guide when you:

- ✅ Are learning Vitest for the first time
- ✅ Need to understand WHY a pattern works
- ✅ Are setting up a new test file
- ✅ Want to understand trade-offs
- ✅ Need to teach others

### Use Research Summary when you:

- ✅ Justifying patterns to stakeholders
- ✅ Onboarding new team members
- ✅ Understanding research methodology
- ✅ Checking authority/sources
- ✅ Reviewing existing code against patterns

---

## Authority & Sources

All recommendations in these documents are based on:

**Official Documentation**

- Vitest Guide: https://vitest.dev/guide/mocking
- Vitest API: https://vitest.dev/api/vi

**Professional Resources**

- LogRocket Advanced Guide
- Bitovi Blog
- Stack Overflow consensus

**Project Reality**

- Real patterns from comapeo-docs codebase
- Working examples from `scripts/notion-fetch/`

---

## File Locations

```
comapeo-docs/
├── context/
│   └── testing/
│       ├── INDEX.md (this file)
│       ├── RESEARCH-SUMMARY.md
│       ├── vitest-mocking-quick-reference.md
│       ├── vitest-mocking-best-practices.md
│       └── vitest-mocking-architecture.md (planned)
└── .claude/
    └── agents/
        └── context/
            └── 2025-12-04T00-00-00-best-practices-researcher-CONTEXT.md
```

---

## Contributing & Updates

These documents are maintained as part of the knowledge base. When updating:

1. Keep quick reference synchronized with full guide
2. Update both places if patterns change
3. Add new examples from real tests
4. Update authority sources if Vitest changes
5. Maintain backward compatibility for older patterns

---

## Status

| Document           | Status      | Last Updated |
| ------------------ | ----------- | ------------ |
| Quick Reference    | ✅ Complete | 2025-12-04   |
| Full Guide         | ✅ Complete | 2025-12-04   |
| Research Summary   | ✅ Complete | 2025-12-04   |
| Architecture Guide | ⏳ Planned  | -            |

---

**Version:** 1.0
**Last Updated:** December 4, 2025
**Maintained by:** Best Practices Research Agent
**Audience:** All developers on comapeo-docs project
