# Vitest Mocking Quick Reference

**For fast lookup during test development**

## TL;DR - The Essential Pattern

```typescript
import { vi, describe, it, expect } from "vitest";

// 1. Mock at module level (required)
vi.mock("./dependency");

describe("Feature", () => {
  // 2. Clear mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should work", async () => {
    // 3. Import dynamically to get types
    const { fn } = await import("./dependency");

    // 4. Wrap with vi.mocked() for typing
    vi.mocked(fn).mockResolvedValue({ success: true });

    // 5. Use with full type safety
    expect(vi.mocked(fn)).toHaveBeenCalled();
  });
});
```

---

## One-Liners by Task

### Mock a module export

```typescript
vi.mock("./module", () => ({
  exported: vi.fn().mockResolvedValue({ data: [] }),
}));
```

### Mock with partial implementation (keep original)

```typescript
vi.mock("./module", async () => ({
  ...(await vi.importActual<typeof import("./module")>("./module")),
  toMock: vi.fn().mockResolvedValue({}),
}));
```

### Mock deeply nested objects

```typescript
const mockedLib = vi.mocked(complexLib, true); // true = deep
mockedLib.a.b.c.method.mockReturnValue("value");
```

### Mock axios GET/POST

```typescript
vi.mocked(axios.get).mockResolvedValue({ data: { id: 1 } });
vi.mocked(axios.post).mockResolvedValue({ data: { id: 2 } });
```

### Mock with different responses (one per call)

```typescript
vi.mocked(fn)
  .mockResolvedValueOnce({ id: 1 })
  .mockResolvedValueOnce({ id: 2 })
  .mockRejectedValueOnce(new Error("Failed"));
```

### Mock with custom logic

```typescript
vi.mocked(fn).mockImplementation(async (url) => {
  if (url.includes("error")) throw new Error("Bad request");
  return { success: true };
});
```

### Mock global fetch

```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ data: [] }),
} as Response);
```

### Mock fs (file system)

```typescript
import fs from "fs/promises";
vi.mock("fs/promises");

vi.mocked(fs.readFile).mockResolvedValue("content" as any);
```

### Mock class constructor

```typescript
vi.mock("./Logger", () => ({
  Logger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    error: vi.fn(),
  })),
}));
```

---

## Common Mistakes & Fixes

| ❌ Wrong                                  | ✅ Correct                                 |
| ----------------------------------------- | ------------------------------------------ |
| `vi.mock()` inside test                   | `vi.mock()` at file top                    |
| `axios.get.mockResolvedValue()`           | `vi.mocked(axios.get).mockResolvedValue()` |
| `fn.mockReturnValue(Promise.resolve())`   | `fn.mockResolvedValue()`                   |
| `const mock = vi.mocked(fn) as any`       | `Partial<Type>` or `typeof import()`       |
| `import { fn } from './module'`           | `const { fn } = await import('./module')`  |
| No `beforeEach(() => vi.clearAllMocks())` | Always clear mocks per test                |

---

## Mock Assertion Methods

```typescript
// Verify calls
expect(vi.mocked(fn)).toHaveBeenCalled();
expect(vi.mocked(fn)).toHaveBeenCalledTimes(2);
expect(vi.mocked(fn)).toHaveBeenCalledWith(arg1, arg2);
expect(vi.mocked(fn)).toHaveBeenNthCalledWith(2, arg1);
expect(vi.mocked(fn)).toHaveBeenLastCalledWith(arg1);

// Check call history
expect(vi.mocked(fn).mock.calls).toHaveLength(1);
expect(vi.mocked(fn).mock.calls[0]).toEqual([arg1, arg2]);

// Check return values
expect(vi.mocked(fn).mock.results).toHaveLength(1);
expect(vi.mocked(fn).mock.results[0].value).toBe("expected");
```

---

## Setup per Library

### Axios

```typescript
vi.mock("axios");

// In test
const mockedAxios = vi.mocked(axios, true); // true for deep mock
mockedAxios.get.mockResolvedValue({ data: { id: 1 } });
```

### Notion SDK

```typescript
vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: { query: vi.fn().mockResolvedValue({ results: [] }) },
    pages: { retrieve: vi.fn().mockResolvedValue({ id: "page" }) },
  })),
}));
```

### File System

```typescript
import fs from "fs/promises";
vi.mock("fs/promises");

vi.mocked(fs.readFile).mockResolvedValue("content" as any);
vi.mocked(fs.writeFile).mockResolvedValue(undefined);
```

### HTTP (Fetch)

```typescript
global.fetch = vi
  .fn()
  .mockResolvedValue(new Response(JSON.stringify({ id: 1 })));
```

---

## Type Casting Guide

| Scenario                  | Solution                                 |
| ------------------------- | ---------------------------------------- |
| Mock is generic function  | `vi.mocked(fn)` (just wrap it)           |
| Only need some properties | `mockResolvedValue({} as Partial<Type>)` |
| Complex partial mocks     | `typeof import('./module')` pattern      |
| Nested property types     | `vi.mocked(obj, true)` (true = deep)     |
| Must cast (last resort)   | `as unknown as Type` (not `as any`)      |

---

## Cleanup & Restoration

```typescript
// Clear call history but keep implementation
beforeEach(() => {
  vi.clearAllMocks();
});

// Full cleanup after tests
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules(); // Clear all mocks completely
});

// Restore specific mock
afterEach(() => {
  vi.mocked(specific).mockReset();
});
```

---

## Test Template (Copy & Paste)

```typescript
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("./dependency", () => ({
  fn: vi.fn().mockResolvedValue({ success: true }),
}));

describe("Feature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should do something", async () => {
    const { fn } = await import("./dependency");

    vi.mocked(fn).mockResolvedValue({ custom: "value" });

    const result = await fn();

    expect(result).toEqual({ custom: "value" });
    expect(vi.mocked(fn)).toHaveBeenCalled();
  });
});
```

---

## When to Use What

| Tool                   | When                           | Example                    |
| ---------------------- | ------------------------------ | -------------------------- |
| `vi.mock()`            | Unit tests, full isolation     | Mock entire API module     |
| `vi.spyOn()`           | Integration tests, track calls | Spy on actual function     |
| `vi.fn()`              | Create standalone mock         | New mock not from module   |
| `mockResolvedValue()`  | Async functions                | API responses              |
| `mockImplementation()` | Complex behavior               | Conditional logic in mock  |
| `importActual`         | Partial mocking                | Keep some original exports |

---

## Key Rules

1. ✅ `vi.mock()` at TOP of file (gets hoisted)
2. ✅ `beforeEach(() => vi.clearAllMocks())` in every describe
3. ✅ Always use `vi.mocked(fn)` when accessing mock properties
4. ✅ Use dynamic `await import()` to get proper types
5. ✅ Use `mockResolvedValue()` for promises, not `mockReturnValue()`
6. ✅ Use `Partial<T>` instead of `as any`
7. ✅ Import mocked modules AFTER vi.mock() calls

---

## Real Examples from comapeo-docs

### Image Processing Mock

```typescript
vi.mock("./imageProcessing", () => ({
  processImageWithFallbacks: vi.fn((url: string) => {
    if (url.includes("fail")) return Promise.resolve({ success: false });
    return Promise.resolve({ success: true, newPath: `/images/...` });
  }),
}));
```

### Notion API Mock

```typescript
vi.mocked(enhancedNotion.dataSourcesQuery)
  .mockResolvedValueOnce({ results: [{ id: "page1" }], has_more: true })
  .mockResolvedValueOnce({ results: [{ id: "page2" }], has_more: false });
```

---

## Troubleshooting

**"Property 'mockResolvedValue' doesn't exist"**
→ Wrap with `vi.mocked(fn)` before accessing mock methods

**"Type 'unknown' is not compatible"**
→ Use `await vi.importActual<typeof import('./module')>('./module')`

**"Mock from previous test is affecting this test"**
→ Add `beforeEach(() => vi.clearAllMocks())`

**"vi.mock() isn't working"**
→ Move it to top of file (must be at module level, not in describe/it)

**"Async mock returning wrong data"**
→ Use `mockResolvedValueOnce()` instead of `mockResolvedValue()` if testing sequential calls

---

## Resources

- Full guide: `vitest-mocking-best-practices.md`
- Research notes: `.claude/agents/context/2025-12-04T00-00-00-best-practices-researcher-CONTEXT.md`
- Official docs: https://vitest.dev/guide/mocking
