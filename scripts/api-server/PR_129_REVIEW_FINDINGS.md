# PR 129 Review Findings Handoff

## Overview

This document captures the code review findings for PR #129 so a follow-up agent can implement fixes with clear scope and acceptance criteria.

Review date: 2026-02-12  
PR: #129 (`codex/update-docker-api-for-repo-management` -> `feat/notion-api-service`)

## Summary

Overall quality is good, but there are two high-priority reliability issues in the new content repo lock/cancellation path that should be fixed before merge.

## Priority Findings

### P1 - Retry loop masks lock errors as contention

Location: `scripts/api-server/content-repo.ts:284`

Issue:

- `acquireRepoLock()` catches all errors from `open(lockPath, "wx")`.
- It retries for up to 30 minutes even when the error is not lock contention.

Impact:

- Permission/path/fs errors can hang jobs for the full lock timeout.
- Operational failures are delayed and harder to diagnose.

Expected fix:

- Only retry on `EEXIST`.
- Rethrow non-contention errors immediately with context.

Suggested implementation notes:

- Narrow the catch type to `NodeJS.ErrnoException`.
- Branch on `error.code`.

Acceptance criteria:

- Non-`EEXIST` lock errors fail fast.
- `EEXIST` still retries until timeout.
- Error message includes lock path and original failure detail.

---

### P1 - Cancellation does not interrupt lock wait

Location: `scripts/api-server/content-repo.ts:321`

Issue:

- `shouldAbort` is checked only after lock acquisition and in later steps.
- Cancellation during lock contention is not honored promptly.

Impact:

- Cancelled jobs may still wait up to 30 minutes.
- Can consume worker capacity under lock contention.

Expected fix:

- Check `shouldAbort` inside lock acquisition loop.
- Abort immediately when cancellation is detected.

Suggested implementation notes:

- Extend `acquireRepoLock()` to accept optional `shouldAbort`.
- Call `assertNotAborted()` each loop iteration before sleeping/retrying.

Acceptance criteria:

- Cancelling a job blocked on lock returns quickly with cancellation error.
- No lock file is leaked when cancellation happens mid-wait.

---

### P2 - Script path resolution depends on startup cwd

Location: `scripts/api-server/job-executor.ts:292`

Issue:

- For content-managed jobs, script path is rewritten with `resolve(process.cwd(), processArgs[0])`.
- This assumes process startup cwd is always project root.

Impact:

- Jobs may fail if service starts from a different working directory.

Expected fix:

- Resolve script paths against a stable, explicit project root/module root.
- Avoid depending on runtime launch cwd.

Acceptance criteria:

- Content-managed job execution is independent of process startup cwd.

---

### P2 - Missing direct tests for new content-repo flow

Location: `scripts/api-server/content-repo.ts` (new module)

Issue:

- High-complexity git/lock/cancel behavior has little direct test coverage.
- Existing passing tests do not validate lock contention and lock error branches directly.

Expected test additions:

- Lock retry on `EEXIST`.
- Fast-fail for non-`EEXIST` errors.
- Cancellation while waiting for lock.
- Init/race behavior around `initializeContentRepo()`.

Acceptance criteria:

- New tests cover the above branches and pass consistently.

## Recommended Execution Plan

1. Implement P1 fixes in `content-repo.ts`.
2. Add focused tests for lock/cancel/error behavior.
3. Address P2 path-resolution robustness in `job-executor.ts`.
4. Re-run targeted test suites.

## Suggested Validation Commands

```bash
bunx vitest run scripts/api-server/job-executor-timeout.test.ts
bunx vitest run scripts/api-server/*content*test.ts
bunx vitest run scripts/api-server/*.test.ts -t "lock|cancel|content repo"
```

If adding new tests in different files, run those files directly as well.

## Notes from Current Verification

The following targeted suites were run successfully during review:

```bash
bunx vitest run \
  scripts/api-server/job-executor-timeout.test.ts \
  scripts/ci-validation/docker-publish-workflow.test.ts \
  scripts/docker-publish-workflow.test.ts \
  scripts/api-server/api-notion-fetch-workflow.test.ts \
  scripts/api-server/github-actions-secret-handling.test.ts
```

Result: 5 test files passed, 176 tests passed.
