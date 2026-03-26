# Fix: Output Truncation Classified as Non-Retryable Error

## Objective

When the OpenAI API returns a response with `finish_reason: "length"` (output token limit hit), the current code passes the truncated string to `JSON.parse`, which throws and is caught as a critical `schema_invalid` error — permanently killing translation for that page with no retry. The fix intercepts `finish_reason: "length"` before parsing and re-classifies it as a non-critical `token_overflow` error, so the existing overflow retry machinery in `translateChunkWithOverflowFallback` can re-attempt with a smaller chunk automatically.

## Implementation Plan

- [ ] Task 1. **Check `finish_reason` before calling `parseTranslationPayload` in `translateTextSingleCall`**

  In `scripts/notion-translate/translateFrontMatter.ts`, inside `translateTextSingleCall`, after the `response.choices[0]?.message?.content` read (currently around line 762), add a check for `finish_reason` on the same choice object. If it equals `"length"`, throw a `TranslationError` with code `"token_overflow"` and `isCritical: false`. The `token_overflow` code is the correct signal here: the existing handler in `translateChunkWithOverflowFallback` already detects this code and triggers a recursive split-and-retry. No new retry path needs to be written — the fix is purely a re-classification.

  The check must be placed **before** the `if (!content)` guard and the `parseTranslationPayload` call, so that a truncated-but-non-empty response is caught before `JSON.parse` sees it.

  Error message should be descriptive: `"OpenAI output was truncated (finish_reason: length) — chunk too large for model output budget"`.

- [ ] Task 2. **Add two tests in `translateFrontMatter.test.ts` covering the new behaviour**

  **Test A — classification:** Mock `openai.chat.completions.create` to return an HTTP-200 response where `choices[0].finish_reason` is `"length"` and `choices[0].message.content` is a truncated JSON string (e.g. `'{"markdown":"partial content'`). Assert that `translateText` rejects with a `TranslationError` whose `code` is `"token_overflow"` and `isCritical` is `false`. This mirrors the pattern used in the existing `"continues to classify token overflow errors..."` test at line 338.

  **Test B — retry integration:** Mock the first call to return `finish_reason: "length"`, then let subsequent calls succeed (using `installStructuredTranslationMock` or a similar inline mock). Assert that `mockOpenAIChatCompletionCreate` is called more than once and that the final result contains the expected translated content. This mirrors the existing `"retries the fast path with adaptive splitting on token overflow"` test at line 413.

  Both tests go in the existing `describe("notion-translate translateFrontMatter", ...)` block, alongside the other classification and retry tests.

- [ ] Task 3. **Run the test file and typecheck**

  Execute `bunx vitest run scripts/notion-translate/translateFrontMatter.test.ts` and confirm all tests pass, including the two new ones. Then run `bun run typecheck --noEmit` scoped to the changed files to confirm no TypeScript regressions.

## Verification Criteria

- `finish_reason: "length"` responses produce a `TranslationError` with `code: "token_overflow"` and `isCritical: false` — not `schema_invalid`.
- A subsequent retry is triggered automatically (call count > 1) when the first call returns `finish_reason: "length"`, without any changes to the retry orchestration logic.
- All existing tests in `translateFrontMatter.test.ts` continue to pass.
- TypeScript compilation produces no errors.

## Potential Risks and Mitigations

1. **Mock shape divergence**: The existing test mocks omit `finish_reason` (the field is `undefined`). The new check must only fire when `finish_reason === "length"` exactly, not when it is `undefined` or `"stop"`. A strict equality check (`=== "length"`) ensures backward compatibility with all existing mock responses.
   Mitigation: Use strict equality; verify existing tests still pass after the change.

2. **Infinite retry loop if chunk floor is already reached**: If `effectiveChunkLimit` is already at `TRANSLATION_MIN_CHUNK_MAX_CHARS` (8,000 chars) and the model still truncates output, the overflow fallback in `translateChunkWithOverflowFallback` detects that the chunk cannot be halved further and re-throws. This existing guard already handles the edge case correctly — no additional logic needed.
   Mitigation: Confirm by reading `translateChunkWithOverflowFallback` lines 844–858, which already enforce the floor before re-throwing.

## Alternative Approaches

1. **Pass `max_tokens` explicitly in the API call**: Setting a large `max_tokens` (e.g., 32,768) would prevent truncation at the API level rather than handling it after the fact. This is complementary but not a substitute — the `finish_reason` check is still needed for robustness against future model changes or misconfiguration, and adding `max_tokens` to `getModelParams` is a separate, independent concern that would affect all models and require its own testing.

2. **Attempt JSON repair before throwing**: Libraries like `jsonrepair` can reconstruct truncated JSON. This would avoid a retry API call entirely but introduces a dependency, silently accepts partial translations (content after the truncation point is lost), and masks the real problem rather than triggering the retry+completeness-validation path that already exists.
