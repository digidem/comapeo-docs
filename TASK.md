# Stabilise Notion Fetch Test Suite

The recently-added tests for the Notion fetch pipeline are failing for structural reasons. This task documents the fixes required so the suite becomes trustworthy and can replace manual regression testing.

## Current Blockers

- `scripts/notion-fetch/__tests__/runFetchPipeline.test.ts` invokes an undefined symbol `runFetch`. The intended function lives in `runFetchPipeline.ts` as `runFetchPipeline`. The typo causes the test file to throw before assertions run.
- `scripts/notion-fetch/__tests__/downloadImage.test.ts` constructs a `mockAxios` helper but never connects it to the mocked `axios` module used by `generateBlocks`. Consequently, `axios.get` returns `undefined`, the code under test cannot read `response.data`, and the test fails.
- The suite doesn’t verify the placeholder markdown path or toggle-title fallback behaviour after the latest runtime hardening changes; these should be covered to prevent regressions.

## Deliverables

- ✅ `downloadImage.test.ts` reliably covers retry success and failure paths by wiring mocks directly into the `axios` module used by `generateBlocks`. Prefer `vi.mocked(await import("axios")).get.mockImplementation(...)` or `vi.spyOn` after importing `axios`.
- ✅ Replace all stray `runFetch(...)` references with `runFetchPipeline(...)` (imported from `../runFetch`), and ensure the test asserts the intended error propagation.
- ✅ Add targeted assertions verifying:
  - toggle sections without a Notion `Title` property use the page title fallback instead of throwing.
  - pages lacking `Website Block` produce placeholder markdown files with the expected frontmatter and note.
  - retry logic respects backoff without sleeping the test (use fake timers via `vi.useFakeTimers()` and `vi.advanceTimersByTime`).
- ✅ Ensure filesystem writes are intercepted (e.g., mock `fs.writeFileSync`) so tests remain hermetic.
- ✅ All new/updated tests pass with `bunx vitest run scripts/notion-fetch/__tests__ scripts/notion-fetch-all/__tests__`.

## Suggested Implementation Steps

1. **Fix test wiring**
   - Import `axios` inside `downloadImage.test.ts` and hook `vi.mocked(axios).get` to fail/succeed as needed. Remove unused `createMockAxios` return values if they remain disconnected.
   - Replace `runFetch` typo with `runFetchPipeline` in `runFetchPipeline.test.ts`. Confirm all branches call the correct function.

2. **Expand coverage for new runtime behaviour**
   - Within `generateBlocks` tests (either existing file or new `generateBlocks.behaviour.test.ts`), build mock Notion pages using the fixtures. Stub `n2m.pageToMarkdown`/`toMarkdownString` to produce markdown with/without images.
   - Mock `fs.writeFileSync` to capture written content. Assert placeholder markdown includes comment and admonition, and toggle without Title logs a warning but completes.
   - Enable fake timers around image retry tests to avoid real delays.

3. **Housekeeping**
   - Update any helper functions in `scripts/test-utils` needed to support the new expectations (e.g., expose a helper to flush fake timers or to capture `fs.writeFileSync` arguments).
   - Document the new test command in `README.md` if missing, and ensure lefthook/CI runs it if desired.

## Definition of Done

- Test files run without throwing, cover the regression scenarios above, and cleanly reset mocks after each test.
- No manual sleeps/backoffs in tests; all timing handled via fake timers.
- Developers can run `bunx vitest run scripts/notion-fetch/__tests__ scripts/notion-fetch-all/__tests__` and get a green suite.
- The task list is updated or removed once merged.

