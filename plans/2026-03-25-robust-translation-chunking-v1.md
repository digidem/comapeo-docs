# Robust Translation Chunking & Completion-Budget Hardening

## Objective

Harden markdown translation against output truncation, unsafe chunk sizing, and configuration drift by making completion-budget control explicit, tightening chunk-size derivation, handling frontmatter without breaking chunk 0 budgeting, and adding runtime validation that matches the repo's parity requirements.

This revision intentionally narrows scope to changes that are safe to implement on top of the current translation loop. Speculative mechanisms that would require a larger refactor are deferred.

## Status: Revised Before Implementation

**Already completed in prior work:**
- Proactive chunking lowered from 500K to 120K chars
- Structural completeness validation (heading, code block, table, list, admonition checks)
- Completeness retry with halving chunk limits (up to 4 retries, 8K floor)
- `finish_reason: "length"` detection reclassified as `token_overflow`

**In scope for this revision:**
- Explicit completion-budget configuration and request parameters
- Safer chunk-size derivation backed by small verified defaults plus env overrides
- Frontmatter-aware budgeting that does not break chunk 0
- End-to-end propagation of `TRANSLATION_*` config through CLI, CI, and API job execution
- Stronger validation using targeted translation tests plus parity checks on real EN/PT/ES content

**Deferred from v1:**
- Cross-chunk context injection
- Ratio-based targeted retry of individual chunks

## Evidence Status

There is no standalone saved research document for this plan.

This revision is based on:
- current implementation review in `scripts/notion-translate/translateFrontMatter.ts`
- existing translation parity tracker and research map under `context/development/`
- current runtime/config paths in the API server and GitHub workflows
- current official model docs for the provider defaults this repo relies on

Any mechanism not supported by those sources is treated as exploratory and kept out of the critical path.

## Scope Boundaries

**This plan hardens the markdown translation path only.**

It does **not** claim full translation-parity closure across the entire pipeline. Full parity still depends on the broader backlog tracked in `context/development/translation-improvements-progress.md`, including:
- deterministic parity checker script
- broader `markdownToNotion` hardening
- broader `scripts/notion-fetch/*` locale-consistency work
- regression-gate coverage

---

## Configuration Strategy

### Authoritative Runtime Controls

Use explicit runtime overrides first, then small verified model defaults, then conservative fallback with warning.

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_MODEL` | current repo runtime default | Model selection only |
| `OPENAI_BASE_URL` | unset | Distinguishes OpenAI default API from custom/provider-compatible endpoints |
| `TRANSLATION_MAX_COMPLETION_TOKENS` | model-derived if verified, else conservative fallback | First-class output budget control |
| `TRANSLATION_CONTEXT_LIMIT` | model-derived if verified, else conservative fallback | Optional input-context override |
| `TRANSLATION_CHUNK_MAX_CHARS` | derived | Optional hard ceiling override |
| `TRANSLATION_MIN_CHUNK_CHARS` | `8000` | Retry floor for chunk halving |
| `TRANSLATION_COMPLETENESS_MAX_RETRIES` | `4` | Max completeness retry rounds |
| `TRANSLATION_JSON_ESCAPE_OVERHEAD` | `0.5` | Estimated JSON/escaping overhead |
| `TRANSLATION_CHARS_PER_TOKEN` | `3.5` | Conservative chars-per-token estimate |

### Defaulting Policy

1. `TRANSLATION_MAX_COMPLETION_TOKENS` is the primary control.
2. For the repo's known default models, maintain a **small verified table** in code.
3. For custom/self-hosted/OpenAI-compatible providers, require explicit overrides when the model is not in the verified table.
4. When falling back to a guessed/conservative default, log a warning to stderr so operators know the budget is not authoritative.

### Concrete Conservative Fallbacks

Use these exact values when no verified model default or explicit override exists:

- `conservativeCompletionFallback = 8192`
- `conservativeContextFallback = 128000`

Rationale:
- `8192` is conservative relative to the repo's current OpenAI defaults, but still large enough to avoid absurdly small proactive chunks. With the plan's default `3.5` chars/token and `0.5` escape overhead, it yields about `14,336` safe output chars before the context guardrail applies.
- `128000` matches the repo's current conservative unknown-model context fallback and common modern model context windows, while still being secondary to the output-budget cap for chunk sizing.

Required warning rules:
- If either fallback is used, log the active model name and the fallback values being applied.
- If `OPENAI_BASE_URL` is set and either fallback is used, log a stronger warning that custom/provider-compatible deployments should set `TRANSLATION_MAX_COMPLETION_TOKENS` and `TRANSLATION_CONTEXT_LIMIT` explicitly.
- Do not silently treat fallback-derived limits as verified provider capabilities.

### Minimal Verified Model Defaults

Do not ship a large speculative table.

Keep the built-in defaults limited to models the repo actively documents or defaults to, and annotate each entry as verified. Everything else must rely on explicit overrides.

### Budget Derivation

When `TRANSLATION_CHUNK_MAX_CHARS` is not set explicitly:

```ts
completionCap = env.TRANSLATION_MAX_COMPLETION_TOKENS
  ?? getVerifiedModelCompletionCap(model)
  ?? conservativeCompletionFallback;

contextLimit = env.TRANSLATION_CONTEXT_LIMIT
  ?? getVerifiedModelContextLimit(model)
  ?? conservativeContextFallback;

charsPerToken  = env.TRANSLATION_CHARS_PER_TOKEN ?? 3.5;
escapeOverhead = env.TRANSLATION_JSON_ESCAPE_OVERHEAD ?? 0.5;

safeOutputChars = Math.floor(
  completionCap * charsPerToken * (1 - escapeOverhead)
);

inputBudget = Math.floor(contextLimit * charsPerToken / 2);

chunkMaxChars = Math.min(safeOutputChars, inputBudget);
```

This derived limit must then still be capped by any explicit `TRANSLATION_CHUNK_MAX_CHARS` override.

---

## Implementation Plan

### Phase 0: Default-Model Decision & Operator Clarity

- [ ] **0.1** Choose one authoritative runtime default model and document it consistently

  The code currently defaults to `gpt-5-mini`, but repo docs disagree in multiple places. Before relying on model-derived defaults, update all operator-facing references so the default model is unambiguous.

- [ ] **0.2** Add an evidence note to the implementation PR/task summary

  State explicitly that this revision is based on code inspection, current provider docs, and parity requirements, not on a saved standalone research memo.

### Phase 1: Explicit Completion Budget & Provider-Aware Request Params

- [ ] **1.1** Add completion-budget helpers in `scripts/constants.ts`

  Replace the planned large `MODEL_OUTPUT_LIMITS` table with:
  - a small verified completion-cap lookup for the repo's documented/default models
  - a context-limit lookup
  - env-first helpers for `TRANSLATION_MAX_COMPLETION_TOKENS` and `TRANSLATION_CONTEXT_LIMIT`
  - warning-backed conservative fallbacks for unknown/custom models

- [ ] **1.2** Pass explicit completion-budget params in the OpenAI request path

  In `scripts/notion-translate/translateFrontMatter.ts`, update the request builder so the API call sets an explicit output cap:
  - OpenAI default API: `max_completion_tokens`
  - custom/OpenAI-compatible providers: provider-compatible equivalent where supported (`max_tokens` if that is the documented parameter for the target path)

  This must be wired from the same effective completion-budget helper used by chunk-size derivation.

- [ ] **1.3** Rewrite `getMaxChunkChars` around completion cap, not context alone

  The current formula is context-heavy and does not reflect response-size risk. Replace it with the completion-aware derivation above.

- [ ] **1.4** Validate env parsing and fallback behavior

  Parse all numeric env vars with validation:
  - positive integers for token/char/retry limits
  - 0-1 range for `TRANSLATION_JSON_ESCAPE_OVERHEAD`
  - positive float for `TRANSLATION_CHARS_PER_TOKEN`

  Invalid values should warn and fall back safely.

- [ ] **1.5** Add/update tests for completion-budget behavior

  Add focused tests that prove:
  - env overrides win over model defaults
  - unknown/custom models warn and use conservative fallbacks
  - `getMaxChunkChars` is derived from completion budget, not context alone
  - request params include explicit completion-budget controls

### Phase 2: Frontmatter-Aware Budgeting Without Changing Translation Semantics

- [ ] **2.1** Replace destructive stripping with explicit extraction

  Add an `extractYamlFrontmatter()` helper that returns:

  ```ts
  { frontmatter: string; body: string }
  ```

  Do not reuse `stripYamlFrontmatter()` for this purpose, because it discards the data needed for reconstruction.

- [ ] **2.2** Reserve frontmatter budget before body splitting

  Keep frontmatter in the first translation request, but subtract its size from chunk 0's content budget **before** splitting the body.

  Required behavior:
  - body-only content is split using chunk budgets that account for chunk 0 frontmatter overhead
  - chunk 0 is reconstructed as `frontmatter + firstBodyChunk`
  - later chunks remain body-only
  - completeness validation continues to evaluate body content, not frontmatter noise

- [ ] **2.3** Define the oversize-frontmatter edge case explicitly

  If frontmatter alone consumes nearly all of chunk 0's budget:
  - log a warning
  - bypass frontmatter-aware proactive splitting for that document
  - rely on the existing overflow/completeness fallback rather than introducing a second special-case splitter

- [ ] **2.4** Add focused tests for frontmatter-aware budgeting

  Verify:
  - frontmatter appears only in the first API request
  - chunk 0 stays within the intended total request budget
  - the final output retains translated frontmatter and complete body content
  - frontmatter-only validation noise does not trigger false incompleteness

### Phase 3: Runtime Propagation of Translation Tuning

**Supported execution paths for this revision:**
- local CLI translation runs
- GitHub Actions translation workflow
- API-triggered translation jobs launched from this repo

**Out of scope for this revision:**
- deployed API-service runtime translation on Fly/production infrastructure

That deployed runtime can be revisited later, but it should not block this markdown-translation hardening pass.

- [ ] **3.1** Propagate `TRANSLATION_*` vars through API-triggered translation jobs

  Update `api-server/job-executor.ts` so child process env whitelisting includes the new translation-tuning vars.

- [ ] **3.2** Add API env propagation tests

  Update `api-server/job-executor-env.test.ts` to verify the new vars are preserved for child jobs.

- [ ] **3.3** Support translation overrides in GitHub Actions via non-secret workflow config

  Update `.github/workflows/translate-docs.yml` so `TRANSLATION_*` tuning values can be supplied from workflow/repository variables or workflow env. These values are configuration, not secrets.

- [ ] **3.4** Explicitly exclude deployed API-service runtime translation from this plan

  Update docs/scope notes so this revision guarantees `TRANSLATION_*` support for CLI, GitHub Actions, and repo-local API jobs only. Do not expand Fly/deployed runtime secret propagation in this change set.

### Phase 4: Diagnostics Instead of New Chunk-Control Heuristics

- [ ] **4.1** Add per-chunk ratio telemetry only

  Record per-chunk input/output ratios for diagnostics, but do **not** add ratio-based control flow in v1.

  This telemetry can be logged in a debug-friendly structure for failed/incomplete translations and used to inform future research.

- [ ] **4.2** Keep recovery behavior unchanged

  Continue using the existing whole-document completeness retry with smaller chunk limits. Do not add targeted retry of individual chunks in this revision.

- [ ] **4.3** Explicitly defer cross-chunk context injection

  Do not prepend synthetic context to chunks in v1. That would require a cleaner separation between:
  - content to translate
  - context supplied to the model
  - placeholder integrity checks
  - overflow fallback splitting

  That refactor is larger than this plan.

### Phase 5: Validation That Matches the Repo's Parity Contract

- [ ] **5.1** Extend targeted translation tests

  Add/update focused tests in `scripts/notion-translate/translateFrontMatter.test.ts` for:
  - explicit completion-budget request parameters
  - env override precedence and invalid-value fallback
  - frontmatter-aware budgeting
  - no regression in overflow fallback and completeness retry

- [ ] **5.2** Add an executable parity checker path

  The repo already has parity logic in `scripts/locale-parity.test.ts`, but it is trapped inside test-only fixtures. Extract or wrap the parity collector into an executable checker that can run against real repo content.

- [ ] **5.3** Run one targeted parity validation on real content

  Validation must include:
  - one targeted family known to have failed before
  - one sampled family that currently succeeds
  - frontmatter parity enabled if frontmatter handling changes

  Record results in `context/development/translation-improvements-progress.md`.

- [ ] **5.4** Keep success claims narrow

  This plan is complete when markdown translation hardening is validated. Do not claim full pipeline parity closure unless the remaining backlog in `translation-improvements-progress.md` is also addressed.

### Phase 6: Documentation Sweep

- [ ] **6.1** Update `env-file` with an OpenAI/translation section

  `env-file` currently has no OpenAI section. Add one and include commented `TRANSLATION_*` examples in the same operator-facing location as `OPENAI_*`.

- [ ] **6.2** Update operator docs

  Update at least:
  - `SETUP.md`
  - `context/workflows/translation-process.md`
  - `context/api-server/reference.md`

  Update deployment docs as well if API-runtime translation remains in scope.

- [ ] **6.3** Reconcile all default-model references

  After Phase 0's decision, update every operator-facing mention so docs stop disagreeing about the default model.

### Phase 7: Verification Commands

- [ ] **7.1** Run targeted checks on touched files

  Execute only the checks relevant to the files changed by implementation, for example:

  ```bash
  bunx vitest run scripts/notion-translate/translateFrontMatter.test.ts
  bunx vitest run scripts/constants.test.ts
  bunx vitest run api-server/job-executor-env.test.ts
  bunx vitest run scripts/locale-parity.test.ts
  bun run typecheck --noEmit
  bunx eslint <touched-files> --fix
  bunx prettier --write <touched-files>
  ```

---

## Verification Criteria

The revised implementation is acceptable only if all of the following are true:

- Translation requests use an explicit completion-budget parameter appropriate for the active provider path.
- Chunk sizing is derived from effective completion budget plus context guardrails, not from context size alone.
- Unknown/custom models do not silently rely on speculative limits; they warn and use explicit override paths.
- Frontmatter-aware chunking keeps frontmatter in the first request without allowing chunk 0 to exceed the intended budget.
- Existing overflow fallback and completeness retry continue to work.
- `TRANSLATION_*` overrides work in local CLI runs, the GitHub Actions translation workflow, and API-triggered translation jobs launched from this repo.
- Targeted translation tests pass.
- Parity validation is run on real EN/PT/ES content and recorded in `translation-improvements-progress.md`.
- Success claims remain limited to markdown translation hardening unless broader parity backlog items are also completed.

---

## Risks and Mitigations

1. **Provider parameter differences**
   Mitigation: keep request-param handling explicit and provider-aware rather than assuming one universal output-token field.

2. **Model tables become stale**
   Mitigation: keep the built-in table intentionally small, verified, and override-friendly.

3. **Frontmatter changes still create edge-case budget pressure**
   Mitigation: reserve chunk 0 budget before splitting and define a fallback path for oversize frontmatter instead of inventing a second complex splitter.

4. **Parity claims outpace actual pipeline coverage**
   Mitigation: require one real parity run and record it, but keep the scope statement narrow.

---

## Deferred Follow-Ups

These are intentionally **not** part of this implementation:

1. **Cross-chunk context injection**
   Requires a cleaner translation contract so synthetic context is not treated as chunk content by placeholder validation, overflow fallback, or completeness checks.

2. **Ratio-based targeted retry**
   Requires a chunk-manifest model and replace-in-place reassembly logic that does not exist today.

3. **Full pipeline parity closure**
   Still depends on backlog work outside `translateFrontMatter.ts`.

---

## File Change Map

| File | Changes |
|---|---|
| `scripts/constants.ts` | Add effective completion/context budget helpers and env parsing |
| `scripts/constants.test.ts` | Add tests for env overrides, fallbacks, and completion-aware sizing |
| `scripts/notion-translate/translateFrontMatter.ts` | Add explicit completion-budget params, frontmatter-aware budgeting, ratio telemetry only |
| `scripts/notion-translate/translateFrontMatter.test.ts` | Add tests for provider-budget params and frontmatter-aware budgeting |
| `api-server/job-executor.ts` | Propagate `TRANSLATION_*` env vars to child jobs |
| `api-server/job-executor-env.test.ts` | Verify env propagation for translation tuning |
| `scripts/locale-parity.test.ts` or extracted shared module | Reuse parity logic through an executable path |
| `env-file` | Add OpenAI/translation env examples |
| `SETUP.md` | Update translation model/default and `TRANSLATION_*` docs |
| `context/workflows/translation-process.md` | Document translation tuning and validation expectations |
| `context/api-server/reference.md` | Document translation-related child-env/runtime config |

---

## Progress Tracking

| Phase | Task | Status |
|---|---|---|
| **0 — Defaults** | 0.1 Authoritative default model decision | Not Started |
| | 0.2 Evidence note in implementation summary | Not Started |
| **1 — Budget** | 1.1 Completion-budget helpers | Not Started |
| | 1.2 Explicit request completion params | Not Started |
| | 1.3 Rewrite `getMaxChunkChars` | Not Started |
| | 1.4 Env validation | Not Started |
| | 1.5 Budget tests | Not Started |
| **2 — Frontmatter** | 2.1 Extract helper | Not Started |
| | 2.2 Frontmatter-aware budgeting | Not Started |
| | 2.3 Oversize-frontmatter fallback | Not Started |
| | 2.4 Frontmatter tests | Not Started |
| **3 — Runtime** | 3.1 API env propagation | Not Started |
| | 3.2 API env tests | Not Started |
| | 3.3 CI override decision | Not Started |
| | 3.4 API-runtime scope decision | Not Started |
| **4 — Diagnostics** | 4.1 Ratio telemetry | Not Started |
| | 4.2 Keep existing recovery path | Not Started |
| | 4.3 Defer context injection | Not Started |
| **5 — Validation** | 5.1 Targeted translation tests | Not Started |
| | 5.2 Executable parity checker path | Not Started |
| | 5.3 Real parity run + tracker update | Not Started |
| | 5.4 Keep success claims narrow | Not Started |
| **6 — Docs** | 6.1 Update `env-file` | Not Started |
| | 6.2 Update operator docs | Not Started |
| | 6.3 Reconcile default-model references | Not Started |
| **7 — Checks** | 7.1 Targeted verification commands | Not Started |
