# Vitest Mocking Best Practices with TypeScript

Comprehensive guide for properly typing and mocking functions in Vitest, with practical examples for axios, promises, and library functions.

**Last Updated:** December 4, 2025
**Audience:** TypeScript/Vitest developers
**Status:** Authoritative reference

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [vi.mocked() for Type Safety](#vimocked-for-type-safety)
3. [Module Mocking Patterns](#module-mocking-patterns)
4. [Mocking Specific Libraries](#mocking-specific-libraries)
5. [Promise and Async Mocking](#promise-and-async-mocking)
6. [TypeScript Casting Patterns](#typescript-casting-patterns)
7. [Anti-Patterns and Pitfalls](#anti-patterns-and-pitfalls)
8. [Project Examples](#project-examples)

---

## Core Concepts

### Why `vi.mocked()` is Required

TypeScript doesn't automatically understand that imported modules are mocked. Without `vi.mocked()`, you lose type information and can't access mock properties.

```typescript
// ❌ WRONG: TypeScript doesn't know this is a mock
import axios from "axios";
vi.mock("axios");

axios.get.mockResolvedValue({}); // Error: Property 'mockResolvedValue' doesn't exist on type 'AxiosStatic'

// ✅ CORRECT: vi.mocked tells TypeScript it's a mock
vi.mocked(axios.get).mockResolvedValue({}); // Works! Type-safe!
```

### The Hoisting Rule

All `vi.mock()` calls are **hoisted to the top of the file** and execute before imports. This is non-negotiable:

```typescript
// ✅ CORRECT: vi.mock at module level
vi.mock("axios");

describe("tests", () => {
  // This works because vi.mock was hoisted
  it("test", () => {
    vi.mocked(axios.get).mockResolvedValue({});
  });
});

// ❌ WRONG: vi.mock inside describe/it blocks
describe("tests", () => {
  it("test", () => {
    vi.mock("axios"); // This won't work as expected - hoisted anyway!
  });
});
```

---

## vi.mocked() for Type Safety

### Basic Usage

```typescript
import { vi, describe, it, expect } from "vitest";
import axios from "axios";

vi.mock("axios");

describe("API Client", () => {
  it("should fetch users", async () => {
    // Wrap the mock function with vi.mocked() for typing
    const mockedGet = vi.mocked(axios.get);

    // Now you have full mock method access
    mockedGet.mockResolvedValue({ data: { users: [] } });

    // Make the call
    const result = await axios.get("/users");

    // Assert with type-safe mock properties
    expect(mockedGet).toHaveBeenCalledWith("/users");
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ users: [] });
  });
});
```

### Deep Mocking with `vi.mocked(module, true)`

When mocking nested properties or methods, use the second parameter `true`:

```typescript
import axios from "axios";

vi.mock("axios");

describe("Axios instance creation", () => {
  it("should mock axios.create()", () => {
    // Pass true for deep mocking
    const mockedAxios = vi.mocked(axios, true);

    // Now you can access nested methods
    mockedAxios.create().mockReturnValue({ get: vi.fn() });

    const instance = axios.create();
    expect(instance.get).toBeDefined();
  });
});
```

### Import and Access Pattern

Dynamic imports preserve type information:

```typescript
import { vi, describe, it, expect } from "vitest";

vi.mock("./services/user");

describe("User Service", () => {
  it("should work with dynamic imports", async () => {
    // Dynamic import ensures vi.mocked gets proper types
    const { getUserById } = await import("./services/user");
    const mocked = vi.mocked(getUserById);

    mocked.mockResolvedValue({ id: 1, name: "Alice" });

    const result = await getUserById(1);
    expect(result.name).toBe("Alice");
  });
});
```

---

## Module Mocking Patterns

### Pattern 1: Complete Module Mock

Replace entire module with custom implementation:

```typescript
vi.mock("./database", () => ({
  query: vi.fn().mockResolvedValue([]),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}));

describe("Database Operations", () => {
  it("should mock all exports", async () => {
    const { query, connect } = await import("./database");

    vi.mocked(query).mockResolvedValue([{ id: 1 }]);

    const result = await query("SELECT *");
    expect(result).toHaveLength(1);
  });
});
```

### Pattern 2: Partial Module Mock (Preserve Original)

Keep original implementation for some exports, mock others:

```typescript
import type * as UserService from "./userService";

vi.mock("./userService", async () => {
  // Import the actual module with proper typing
  const actual = await vi.importActual<typeof UserService>("./userService");

  return {
    ...actual, // Keep all original exports
    fetchUser: vi.fn().mockResolvedValue({ id: 1, name: "Test" }), // Override this
  };
});

describe("Mixed mocking", () => {
  it("should use original functions but mock fetchUser", async () => {
    const { fetchUser, validateEmail } = await import("./userService");

    // fetchUser is mocked
    vi.mocked(fetchUser).mockResolvedValue({ id: 1 });

    // validateEmail is the original implementation
    const isValid = validateEmail("test@example.com");
    expect(typeof isValid).toBe("boolean");
  });
});
```

**Critical:** Use `import type` and `typeof` to get proper TypeScript inference:

```typescript
// ❌ WRONG: Loses type information
const actual = await vi.importActual("./userService");
// actual is typed as ESModuleExports - you lose all type info

// ✅ CORRECT: Preserves type information
import type * as UserService from "./userService";
const actual = await vi.importActual<typeof UserService>("./userService");
// actual has full type information from UserService
```

### Pattern 3: Nested Object Mocking

Mock properties inside objects:

```typescript
vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: {
      query: vi.fn().mockResolvedValue({ results: [] }),
    },
    pages: {
      retrieve: vi.fn().mockResolvedValue({ id: "page-1" }),
    },
  })),
}));

describe("Notion Client", () => {
  it("should mock nested methods", async () => {
    const { Client } = await import("@notionhq/client");
    const client = new Client({ auth: "token" });

    // Access nested mocks
    expect(client.databases.query).toBeDefined();
    expect(client.pages.retrieve).toBeDefined();
  });
});
```

---

## Mocking Specific Libraries

### Axios HTTP Client

**Basic Mocking:**

```typescript
import axios from "axios";

vi.mock("axios");

describe("HTTP Requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mock axios.get", async () => {
    const mockData = { id: 1, title: "Post" };
    vi.mocked(axios.get).mockResolvedValue({ data: mockData });

    const response = await axios.get("/posts/1");

    expect(response.data).toEqual(mockData);
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith("/posts/1");
  });

  it("should mock axios.post", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: 2 } });

    await axios.post("/posts", { title: "New" });

    expect(vi.mocked(axios.post)).toHaveBeenCalledWith("/posts", {
      title: "New",
    });
  });

  it("should mock axios.create()", () => {
    const mockedAxios = vi.mocked(axios, true);
    const instanceMock = {
      get: vi.fn().mockResolvedValue({ data: {} }),
    };

    mockedAxios.create.mockReturnValue(instanceMock as any);

    const instance = axios.create({ baseURL: "https://api.example.com" });
    expect(instance.get).toBe(instanceMock.get);
  });
});
```

**Advanced - Different Responses:**

```typescript
describe("Sequential responses", () => {
  it("should return different data on each call", async () => {
    const mock = vi.mocked(axios.get);

    // First call returns users
    mock.mockResolvedValueOnce({ data: [{ id: 1 }] });
    // Second call returns posts
    mock.mockResolvedValueOnce({ data: [{ id: 10 }] });
    // Third call rejects
    mock.mockRejectedValueOnce(new Error("Server error"));

    expect(await axios.get("/users")).toEqual({ data: [{ id: 1 }] });
    expect(await axios.get("/posts")).toEqual({ data: [{ id: 10 }] });

    await expect(axios.get("/posts")).rejects.toThrow("Server error");
  });
});
```

### Global Fetch API

**Mocking Fetch:**

```typescript
describe("Fetch API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should mock global fetch", async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ users: [] }),
    } as any;

    global.fetch = vi.fn().mockResolvedValue(mockResponse);

    const response = await fetch("/api/users");
    const data = await response.json();

    expect(data).toEqual({ users: [] });
    expect(global.fetch).toHaveBeenCalledWith("/api/users");
  });

  it("should mock fetch errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(fetch("/api/users")).rejects.toThrow("Network error");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
```

### File System Operations

```typescript
import fs from "fs/promises";

vi.mock("fs/promises");

describe("File Operations", () => {
  it("should mock fs.readFile", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("file content" as any);

    const content = await fs.readFile("file.txt", "utf-8");

    expect(content).toBe("file content");
    expect(vi.mocked(fs.readFile)).toHaveBeenCalledWith("file.txt", "utf-8");
  });

  it("should mock fs.writeFile", async () => {
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    await fs.writeFile("file.txt", "content");

    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith("file.txt", "content");
  });
});
```

### Notion SDK

```typescript
import { Client } from "@notionhq/client";

vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: {
      query: vi.fn().mockResolvedValue({ results: [] }),
    },
  })),
}));

describe("Notion Operations", () => {
  it("should query database", async () => {
    const client = new Client({ auth: "token" });

    vi.mocked(client.databases.query).mockResolvedValue({
      results: [{ id: "page-1", properties: {} }],
    } as any);

    const result = await client.databases.query({});

    expect(result.results).toHaveLength(1);
  });
});
```

---

## Promise and Async Mocking

### Basic Promise Mocking

```typescript
describe("Promise Mocking", () => {
  it("should mock resolved promises", async () => {
    vi.mock("./api", () => ({
      fetchData: vi.fn().mockResolvedValue({ success: true }),
    }));

    const { fetchData } = await import("./api");
    const result = await fetchData();

    expect(result).toEqual({ success: true });
  });

  it("should mock rejected promises", async () => {
    vi.mock("./api", () => ({
      fetchData: vi.fn().mockRejectedValue(new Error("API failed")),
    }));

    const { fetchData } = await import("./api");

    await expect(fetchData()).rejects.toThrow("API failed");
  });
});
```

### Sequential Promise Responses

```typescript
describe("Sequential responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle multiple sequential calls", async () => {
    vi.mock("./cache", () => ({
      get: vi
        .fn()
        .mockResolvedValueOnce("first")
        .mockResolvedValueOnce("second")
        .mockResolvedValueOnce("third"),
    }));

    const { get } = await import("./cache");

    expect(await get("key")).toBe("first");
    expect(await get("key")).toBe("second");
    expect(await get("key")).toBe("third");
  });

  it("should mix success and failure", async () => {
    vi.mock("./retry", () => ({
      attempt: vi
        .fn()
        .mockResolvedValueOnce(null) // First attempt fails
        .mockResolvedValueOnce(null) // Second attempt fails
        .mockResolvedValueOnce({ data: "success" }), // Third succeeds
    }));

    const { attempt } = await import("./retry");

    expect(await attempt()).toBeNull();
    expect(await attempt()).toBeNull();
    expect(await attempt()).toEqual({ data: "success" });
  });

  it("should fail after retries", async () => {
    vi.mock("./api", () => ({
      call: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error("Timeout")),
    }));

    const { call } = await import("./api");

    expect(await call()).toBeNull();
    await expect(call()).rejects.toThrow("Timeout");
  });
});
```

### Implementation Functions for Complex Logic

```typescript
describe("Mock implementations", () => {
  it("should use mockImplementation for conditional logic", async () => {
    vi.mock("./conditionalApi", () => ({
      fetch: vi.fn().mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("error")) {
          throw new Error("Bad endpoint");
        }
        if (endpoint.includes("users")) {
          return { data: [{ id: 1 }] };
        }
        return { data: [] };
      }),
    }));

    const { fetch } = await import("./conditionalApi");

    expect(await fetch("/users")).toEqual({ data: [{ id: 1 }] });
    expect(await fetch("/posts")).toEqual({ data: [] });
    await expect(fetch("/error")).rejects.toThrow();
  });

  it("should use mockImplementation with this context", async () => {
    vi.mock("./logger", () => ({
      Logger: vi.fn().mockImplementation(function (this: any) {
        this.logs = [];
        this.log = vi.fn().mockImplementation(function (msg: string) {
          this.logs.push(msg);
        });
      }),
    }));

    const { Logger } = await import("./logger");
    const logger = new Logger();

    logger.log("Test message");
    expect(logger.logs).toEqual(["Test message"]);
  });
});
```

---

## TypeScript Casting Patterns

### The Wrong Way: `as any`

```typescript
// ❌ AVOID: Loses all type safety
const mock = vi.mocked(myFunction) as any;
mock.mockReturnValue("wrong-type-allowed"); // No error, but dangerous!
```

### The Right Way: Using `Partial<T>`

```typescript
import type { User } from "./types";

vi.mock("./api", () => ({
  fetchUser: vi.fn().mockResolvedValue({
    id: 1,
    // Only specify properties you need - Partial allows this
  } as Partial<User>),
}));

describe("Type-safe partial mocking", () => {
  it("should work with Partial<T>", async () => {
    const { fetchUser } = await import("./api");

    // Partial<User> accepts objects with any subset of User properties
    const result = await fetchUser(1);
    expect(result.id).toBe(1);
  });
});
```

### Complex Types: Use `typeof` with `importActual`

```typescript
import type * as ComplexModule from "./complex";

vi.mock("./complex", async () => {
  // Get proper type information from the original module
  const actual = await vi.importActual<typeof ComplexModule>("./complex");

  return {
    ...actual,
    expensiveOperation: vi.fn().mockResolvedValue({
      computed: "result",
    }),
  };
});

describe("Complex type mocking", () => {
  it("should preserve types when mixing real and mocked", async () => {
    const { expensiveOperation, utils } = await import("./complex");

    // expensiveOperation is mocked
    vi.mocked(expensiveOperation).mockResolvedValue({ computed: "test" });

    // utils still has original types (from actual)
    const result = utils.process("data");
    expect(typeof result).toBe("string");
  });
});
```

### Casting When Absolutely Necessary

```typescript
// ✅ If you must cast, use unknown as intermediate step
const strictMock = vi.mocked(strictlyTypedFn) as unknown as MyMockType;

// ✅ Or cast the return value specifically
vi.mocked(fn).mockResolvedValue({} as unknown as ExpectedType);
```

---

## Anti-Patterns and Pitfalls

### ❌ Don't: Use `as any` for Mock Typing

```typescript
// WRONG
const mock = vi.mocked(fn) as any;
mock.mockReturnValue(wrongType); // No errors, type safety lost
```

**Fix:** Use `Partial<T>` or `typeof` pattern instead.

### ❌ Don't: Place vi.mock() Inside Test Blocks

```typescript
// WRONG
describe("tests", () => {
  it("test", () => {
    vi.mock("module"); // Won't work - should be at module level
  });
});
```

**Fix:** Move `vi.mock()` to top of file where it will be hoisted.

### ❌ Don't: Mix mockReturnValue() with Async Functions

```typescript
// WRONG
vi.mock("api", () => ({
  fetchData: vi.fn().mockReturnValue(Promise.resolve({ data: [] })),
}));

// CORRECT
vi.mock("api", () => ({
  fetchData: vi.fn().mockResolvedValue({ data: [] }),
}));
```

### ❌ Don't: Forget to Clear Mocks Between Tests

```typescript
// WRONG
describe("tests", () => {
  it("test 1", () => {
    vi.mocked(fn).mockReturnValue(1);
  });

  it("test 2", () => {
    // Mock from test 1 still applies!
    expect(vi.mocked(fn)).toHaveBeenCalled(); // False positive
  });
});

// CORRECT
describe("tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("test 1", () => {
    vi.mocked(fn).mockReturnValue(1);
  });

  it("test 2", () => {
    // Clean slate for each test
    expect(vi.mocked(fn)).not.toHaveBeenCalled();
  });
});
```

### ❌ Don't: Use import Instead of Dynamic import()

```typescript
// WRONG: Doesn't work well with vi.mock()
import { exported } from "./module";

// CORRECT: Use dynamic import for better type inference
const { exported } = await import("./module");
```

### ❌ Don't: Mock Functions Inside vi.mock() Without vi.fn()

```typescript
// WRONG
vi.mock("api", () => ({
  getData: async () => ({ data: [] }), // Not a mock, just a function
}));

// CORRECT
vi.mock("api", () => ({
  getData: vi.fn().mockResolvedValue({ data: [] }),
}));
```

---

## Project Examples

### From comapeo-docs: Image Processing

Real example from the codebase showing correct patterns:

```typescript
// scripts/notion-fetch/imageReplacer.test.ts

// ✅ Correct: vi.mock at module level
vi.mock("./imageValidation", () => ({
  validateAndSanitizeImageUrl: vi.fn((url: string) => {
    if (url.includes("invalid")) {
      return { isValid: false, error: "Invalid URL" };
    }
    return { isValid: true, sanitizedUrl: url };
  }),
  createFallbackImageMarkdown: vi.fn(
    (full: string, url: string, idx: number) => {
      return `<!-- Failed image ${idx}: ${url} -->`;
    }
  ),
}));

vi.mock("./imageProcessing", () => ({
  processImageWithFallbacks: vi.fn((url: string) => {
    if (url.includes("fail")) {
      return Promise.resolve({ success: false, error: "Download failed" });
    }
    if (url.includes("explode")) {
      return Promise.reject(new Error("boom"));
    }
    return Promise.resolve({
      success: true,
      newPath: `/images/downloaded-${url.split("/").pop()}`,
      savedBytes: 1024,
    });
  }),
  logImageFailure: vi.fn(),
  logProcessingMetrics: vi.fn(),
}));

describe("imageReplacer", () => {
  // ✅ Correct: beforeEach clears all mocks
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ✅ Correct: Test accesses mocks via dynamic import
  it("should replace valid image URLs", async () => {
    const { processAndReplaceImages } = await import("./imageReplacer");
    const result = await processAndReplaceImages(
      "![alt](https://example.com/image.png)",
      "test-file"
    );

    expect(result.markdown).toContain("/images/downloaded-image.png");
    expect(result.stats.successfulImages).toBe(1);
  });

  // ✅ Correct: Using vi.mocked for mock assertions
  it("should call sanitizeMarkdownImages on final result", async () => {
    const { sanitizeMarkdownImages } = await import("./markdownTransform");
    const { processAndReplaceImages } = await import("./imageReplacer");

    await processAndReplaceImages(
      "![alt](https://example.com/image.png)",
      "test-file"
    );

    // ✅ Using vi.mocked wrapper for type safety
    expect(vi.mocked(sanitizeMarkdownImages)).toHaveBeenCalled();
  });
});
```

### Notion API Mocking

Real example from comapeo-docs:

```typescript
// scripts/fetchNotionData.test.ts

// ✅ Correct: Mock entire module with factory function
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
    pagesRetrieve: vi.fn().mockResolvedValue({
      id: "test-page-id",
      properties: {},
    }),
  },
}));

describe("fetchNotionData", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // ✅ Correct: Dynamic import after mock setup
    const module = await import("./fetchNotionData");
    fetchNotionData = module.fetchNotionData;
  });

  // ✅ Correct: Test with sequential mock responses
  it("should handle pagination with multiple pages", async () => {
    // Dynamic import to get mocked module
    const notionModule = await import("./notionClient");
    const enhancedNotion = notionModule.enhancedNotion;

    // ✅ Using vi.mocked for proper typing
    vi.mocked(enhancedNotion.dataSourcesQuery)
      .mockResolvedValueOnce({
        results: [{ id: "page1", properties: {} }],
        has_more: true,
        next_cursor: "cursor-1",
      })
      .mockResolvedValueOnce({
        results: [{ id: "page2", properties: {} }],
        has_more: false,
        next_cursor: null,
      });

    const result = await fetchNotionData({ property: "Status" });

    expect(result).toHaveLength(2);
    expect(vi.mocked(enhancedNotion.dataSourcesQuery)).toHaveBeenCalledTimes(2);
  });
});
```

---

## Summary Checklist

Before writing a test:

- [ ] All `vi.mock()` calls at module level (top of file)
- [ ] `beforeEach(() => vi.clearAllMocks())` in every describe block
- [ ] Use `vi.mocked()` wrapper when accessing mock functions in assertions
- [ ] For promises, use `mockResolvedValue()` not `mockReturnValue()`
- [ ] For partial mocks, use `Partial<T>` instead of `as any`
- [ ] For type inference with `importActual`, use `typeof` pattern
- [ ] Import mocked modules dynamically with `await import()`

---

## References

- **Vitest Official Docs:** https://vitest.dev/guide/mocking
- **Vitest API Reference:** https://vitest.dev/api/vi
- **Module Mocking:** https://vitest.dev/guide/mocking/modules
- **LogRocket Guide:** https://blog.logrocket.com/advanced-guide-vitest-testing-mocking/
