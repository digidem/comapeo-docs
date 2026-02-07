---
agent: best-practices-researcher
timestamp: 2025-12-04T00:00:00
session_id: 2025-12-04-best-practices-researcher-vitest-mocking
next_agents: [issue-spec-generator, implementation-planner, code-reviewer]
---

# Agent Context: Best Practices Researcher - Vitest Mocking with TypeScript

## 🎯 Mission Summary

**Research Request:** Best practices for properly typing mocked functions in Vitest with TypeScript
**Scope:**
- Correct syntax for `vi.mocked(import(...))` usage
- Module mocking with `vi.mock()` while maintaining types
- Mocking axios, promises, and library functions
- Proper TypeScript casting patterns

## 🔍 Key Findings

### Industry Best Practices

#### 1. Using `vi.mocked()` for Type-Safe Mocks

**Core Pattern:**
```typescript
import { vi, describe, it, expect } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('API Service', () => {
  it('should fetch data', async () => {
    // Proper typing with vi.mocked
    vi.mocked(axios.get).mockResolvedValue({ data: { id: 1 } });

    // Now axios.get has proper mock types
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith('/api/users');
  });
});
```

**Key Insight:** TypeScript doesn't automatically know that imported modules are mocked, so you MUST use `vi.mocked()` to wrap mocked references and get proper type inference for mock assertions.

**Authoritative Source:** Vitest Official Documentation - "Since TypeScript doesn't know that mocked functions are mock functions, you need to use the `vi.mocked` type helper to have the right type inferred and be able to use mock functions."

#### 2. Module Mocking with Type Safety

**Pattern with Module-Level Mocking:**
```typescript
// ✅ CORRECT: Using vi.mock with proper module path
vi.mock('./notionClient', () => ({
  enhancedNotion: {
    blocksChildrenList: vi.fn().mockResolvedValue({
      results: [],
      has_more: false,
      next_cursor: null,
    }),
  },
}));

// ✅ Then access in tests with vi.mocked
describe('Notion API', () => {
  it('should call API', async () => {
    const { enhancedNotion } = await import('./notionClient');
    expect(vi.mocked(enhancedNotion.blocksChildrenList)).toHaveBeenCalled();
  });
});
```

**Critical Rule:** `vi.mock()` calls are **hoisted to the top of the file** and execute before all imports. This is non-negotiable for module mocking.

#### 3. Type-Safe `importActual` Pattern (Partial Mocking)

**For Selective Module Mocking:**
```typescript
import type * as UserModule from './userService';

vi.mock('./userService', async () => {
  // Use typeof to get proper typing from the original module
  const actualModule = await vi.importActual<typeof UserModule>('./userService');

  return {
    ...actualModule,
    fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test' }),
  };
});
```

**Why This Matters:** Without `typeof UserModule`, TypeScript will type `importActual` as `ESModuleExports`, losing all type information for properties you want to access.

**Implementation Rule:** Always use dynamic `import()` syntax in mock calls for IDE support and automatic type validation.

#### 4. Mocking Axios Specifically

**Basic Axios Mock:**
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mock axios.get with proper types', async () => {
    // Option 1: Direct mockResolvedValue
    const mockResponse = { data: { users: [] } };
    vi.mocked(axios.get).mockResolvedValue(mockResponse);

    // Option 2: Using mockImplementation for complex behavior
    vi.mocked(axios.get).mockImplementation(async (url) => ({
      data: url.includes('users') ? { users: [] } : { posts: [] },
    }));

    const result = await axios.get('/api/users');
    expect(result.data).toEqual({ users: [] });
    expect(vi.mocked(axios.get)).toHaveBeenCalledWith('/api/users');
  });

  it('should mock axios.post with deep: true for nested properties', async () => {
    const mockedAxios = vi.mocked(axios, true); // deep: true for nested mocks
    mockedAxios.create().mockResolvedValue({ data: {} });
  });
});
```

**Key Point:** For axios.create() or deeply nested methods, pass `true` as second argument to `vi.mocked()`: `vi.mocked(axios, true)`

#### 5. Handling Promise-Based Functions

**Mocking Async Functions:**
```typescript
// ✅ CORRECT: Using mockResolvedValue for promises
vi.mock('./dataFetcher', () => ({
  fetchData: vi.fn().mockResolvedValue({ status: 'success' }),
  fetchMultiple: vi.fn()
    .mockResolvedValueOnce({ id: 1 })
    .mockResolvedValueOnce({ id: 2 })
    .mockRejectedValueOnce(new Error('API Error')),
}));

// ✅ CORRECT: Using mockRejectedValue for promise rejections
vi.mock('./errorHandler', () => ({
  validate: vi.fn().mockRejectedValue(new Error('Validation failed')),
}));

// In tests:
describe('Async Operations', () => {
  it('should handle successful promises', async () => {
    const { fetchData } = await import('./dataFetcher');
    const result = await fetchData();
    expect(result).toEqual({ status: 'success' });
  });

  it('should handle rejected promises', async () => {
    const { validate } = await import('./errorHandler');
    await expect(validate()).rejects.toThrow('Validation failed');
  });
});
```

**Best Practices:**
- Use `mockResolvedValue()` for successful promises
- Use `mockResolvedValueOnce()` for sequential different responses
- Use `mockRejectedValue()` for error scenarios
- Use `mockRejectedValueOnce()` for selective error handling

#### 6. Casting Incompatible Types - The Right Way

**❌ AVOID - Old Pattern (Don't Use):**
```typescript
// This loses type safety
const mockedFn = vi.mocked(someFunction) as any;
const result = mockedFn.mockReturnValue('wrong-type');
```

**✅ CORRECT - Using `partial` Option:**
```typescript
// When you only need partial type compatibility
vi.mock('./service', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1 } as Partial<User>),
}));
```

**✅ CORRECT - For Complex Type Mismatches:**
```typescript
import type { ComplexType } from './types';

vi.mock('./complex', async () => {
  const actual = await vi.importActual<typeof import('./complex')>('./complex');

  return {
    ...actual,
    complexFunction: vi.fn().mockResolvedValue({} as ComplexType),
  };
});
```

**Key Rule:** Avoid `as any` casting. Use:
1. `Partial<T>` when you only need some properties
2. `typeof import()` pattern for proper type inference
3. Casting to `unknown` only as last resort, but prefer the above

#### 7. Best Practices for Library Function Mocking

**HTTP Libraries (axios, fetch):**
```typescript
// ✅ Mock at module level in setup or test file
vi.mock('axios');

// ✅ Mock global fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ id: 1 }),
} as Response);
```

**Database Clients:**
```typescript
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    databases: {
      query: vi.fn().mockResolvedValue({ results: [] }),
    },
  })),
}));
```

**File System Operations:**
```typescript
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
```

### Project-Specific Patterns Found

#### Current Patterns in Codebase

The project already follows many best practices in `/home/luandro/Dev/digidem/comapeo-docs/scripts/notion-fetch/imageReplacer.test.ts`:

✅ **Correct Patterns Being Used:**
1. Using `vi.mock()` at top level with factory functions
2. Using `vi.fn()` to create individual mock functions
3. Using `mockResolvedValue()` for promises
4. Properly structured class mocking with constructor functions
5. Using `beforeEach(() => vi.clearAllMocks())` for test isolation

✅ **Type-Safe Mock Access:**
```typescript
// From imageReplacer.test.ts - using dynamic imports
const { sanitizeMarkdownImages } = await import("./markdownTransform");
expect(sanitizeMarkdownImages).toHaveBeenCalled(); // Works with vi.mocked
```

✅ **Promise Mocking Pattern:**
```typescript
// Correct use of mockResolvedValue
processImageWithFallbacks: vi.fn((url: string) => {
  if (url.includes("fail")) {
    return Promise.resolve({ success: false, error: "Download failed" });
  }
  return Promise.resolve({ success: true, newPath: `/images/...` });
})
```

## 📊 Analysis Results

### Consensus Patterns Across Sources

**Authoritative Sources Alignment:**
1. ✅ Vitest Official Docs + Stack Overflow + LogRocket all agree on `vi.mocked()` pattern
2. ✅ All sources recommend avoiding `as any` in favor of type-aware patterns
3. ✅ All recommend `vi.clearAllMocks()` in `beforeEach` for test isolation
4. ✅ All recommend dynamic imports for better IDE support with `importActual`

### Divergent Opinions

**When to use `vi.spyOn()` vs `vi.mock()`:**
- **`vi.mock()`:** Better for unit tests where you want complete isolation
- **`vi.spyOn()`:** Better for integration tests where you want to spy on existing behavior
- **Note:** The project uses `vi.mock()` exclusively, which is correct for their test strategy

## 🚧 Risks & Trade-offs

| Pattern | Pros | Cons | Recommendation |
|---------|------|------|-----------------|
| `vi.mocked()` wrapping | Type-safe, IDE support, mock assertions | Requires discipline | **ALWAYS USE** |
| `vi.mock()` module level | Complete isolation, hoisting understood | Complex for partial mocks | **DEFAULT for unit tests** |
| `importActual` partial | Only mock what you need, preserve original | Requires typeof pattern | **For selective mocking** |
| `as any` casting | Quick fix when types conflict | Loses type safety, hides bugs | **NEVER USE - use Partial<T> instead** |
| `mockResolvedValue()` | Clear async behavior, chainable | Can't use mockImplementation simultaneously | **STANDARD for promises** |

## 🔗 Artifacts & References

### Sources Consulted

**Official Documentation:**
- Vitest Official Mocking Guide: https://vitest.dev/guide/mocking
- Vitest API Reference (vi.mocked): https://vitest.dev/api/vi
- Vitest Modules Mocking: https://vitest.dev/guide/mocking/modules

**Community Best Practices:**
- LogRocket Advanced Guide: https://blog.logrocket.com/advanced-guide-vitest-testing-mocking/
- DEV Community (vi.fn vs vi.spyOn): https://dev.to/mayashavin/two-shades-of-mocking-a-function-in-vitest-41im
- Stack Overflow TypeScript Mocking: https://stackoverflow.com/questions/76273947/how-type-mocks-with-vitest

## 📝 Recommendations

### Immediate Actions

1. **Document the `vi.mocked()` pattern** in project guidelines for consistency
2. **Create test template** showing correct vi.mock() + vi.mocked() usage
3. **Establish typing rules:** Never use `as any`, prefer `Partial<T>` or `typeof import()`

### Implementation Guidance for Tests

**Template for Module Mocking:**
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

// 1. Mock at module level (hoisted before imports)
vi.mock('./dependency', () => ({
  exportedFunction: vi.fn().mockResolvedValue({}),
}));

describe('Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // 2. Import and access with vi.mocked for types
    const { exportedFunction } = await import('./dependency');
    const typed = vi.mocked(exportedFunction);

    // 3. Use mock methods with full type checking
    typed.mockResolvedValueOnce({ success: true });

    // 4. Assert with confidence
    expect(typed).toHaveBeenCalledWith(expectedArgs);
  });
});
```

### Pitfalls to Avoid

1. **❌ Accessing mocked modules without dynamic import** - Loses types
2. **❌ Using `as any` instead of `Partial<T>`** - Hides real type issues
3. **❌ Forgetting `vi.clearAllMocks()` in beforeEach** - Causes test pollution
4. **❌ Using string paths in vi.mock() without dynamic import syntax** - Loses IDE support
5. **❌ Mixing mockImplementation and mockResolvedValue** - Only use one per mock

### Project-Specific Guidance

**For comapeo-docs scripts:**
- Current test patterns are correct and should be maintained
- When mocking Notion API calls, continue using the factory function pattern
- For S3/image processing, continue using Promise.resolve/reject pattern
- Consider adding `vi.mocked()` wrapper when accessing mock properties in assertions

## 🎁 Handoff Notes

### For Issue Spec Generator

- Include requirement: "All mocked functions must use `vi.mocked()` wrapper in assertions"
- Include requirement: "No `as any` casting - use `Partial<T>` or `typeof` patterns"
- Include requirement: "`beforeEach(() => vi.clearAllMocks())` in every describe block"

### For Implementation Planner

- Plan for updating existing tests to wrap mocks with `vi.mocked()` if not already done
- Sequence: 1) Module-level mocks setup, 2) Test bodies with `vi.mocked()` wrappers, 3) Assertions with typed mock properties
- Consider creating shared test utilities for common mock patterns (axios, Notion, fetch)

### For Code Reviewers

- Check 1: All `vi.mock()` calls are at module level (top of file)
- Check 2: All mock property access uses `vi.mocked()` wrapper
- Check 3: No `as any` casting in mock setup (should use `Partial<T>` or `typeof`)
- Check 4: Tests have `beforeEach(() => vi.clearAllMocks())`
- Check 5: Promise mocks use `mockResolvedValue()` not `mockReturnValue()`

## 📚 Knowledge Base

### TypeScript Mocking Patterns

**Pattern 1: Basic Module Mock with Types**
```typescript
vi.mock('./module', () => ({
  fn: vi.fn().mockResolvedValue({ success: true }),
}));
```

**Pattern 2: Partial Module Mock (Keep Original)**
```typescript
vi.mock('./module', async () => {
  const actual = await vi.importActual<typeof import('./module')>('./module');
  return { ...actual, override: vi.fn() };
});
```

**Pattern 3: Deep Module Mock (Nested Objects)**
```typescript
const mockedLib = vi.mocked(complexLib, true); // deep: true
mockedLib.nested.deep.method.mockReturnValue('value');
```

**Pattern 4: Promise Chain Mocking**
```typescript
vi.mocked(asyncFn)
  .mockResolvedValueOnce(response1)
  .mockResolvedValueOnce(response2)
  .mockRejectedValueOnce(new Error('Failed'));
```

### Common Library Mocking

**Axios:**
```typescript
vi.mock('axios');
vi.mocked(axios.get).mockResolvedValue({ data: {} });
```

**Fetch:**
```typescript
global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({})));
```

**Notion Client:**
```typescript
vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({ databases: { query: vi.fn() } })),
}));
```

### Anti-Patterns to Avoid

1. ❌ Calling `vi.mock()` inside test blocks (must be hoisted)
2. ❌ Mixing `mockReturnValue()` with async functions (use `mockResolvedValue()`)
3. ❌ Forgetting to clear mocks between tests
4. ❌ Using `import` instead of dynamic `import()` in mock factories
5. ❌ Casting with `as any` - always prefer type-aware patterns
