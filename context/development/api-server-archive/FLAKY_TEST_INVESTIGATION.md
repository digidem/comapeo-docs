# Flaky Test Investigation Report

## Executive Summary

Investigated flaky tests in `scripts/api-server` by running the full test suite 20 times in parallel batches to detect race conditions and test isolation issues.

## Test Execution Details

- **Total Runs**: 20 (4 batches × 5 parallel runs each)
- **Test Suite**: `bun run test:api-server`
- **Execution Method**: Parallel batch execution to expose race conditions
- **Date**: 2025-02-08

## Flaky Tests Identified

### Most Frequent Failures

1. **should maintain data integrity after concurrent save operations**
   - File: `job-persistence-deterministic.test.ts:617`
   - Frequency: ~12/20 runs (60%)
   - Error: `ENOENT: no such file or directory, open '.jobs-data/jobs.json'`
   - Root Cause: Race condition in concurrent file operations

2. **should maintain chronological order of log entries**
   - File: `job-persistence-deterministic.test.ts:225`
   - Frequency: ~10/20 runs (50%)
   - Error: `AssertionError: expected 3 to be 4`
   - Root Cause: Log entries lost due to concurrent writes

3. **should produce identical logs for identical logging sequences**
   - File: `job-persistence-deterministic.test.ts:258`
   - Frequency: ~8/20 runs (40%)
   - Error: `ENOENT: no such file or directory, open '.jobs-data/jobs.log'`
   - Root Cause: File deleted during concurrent access

4. **should return all logs when limit is higher than actual count**
   - File: `job-persistence.test.ts:377`
   - Frequency: ~5/20 runs (25%)
   - Error: stderr warnings about missing log data
   - Root Cause: Incomplete log writes due to race conditions

5. **should return logs for a specific job**
   - File: `job-persistence.test.ts:319`
   - Frequency: ~3/20 runs (15%)
   - Root Cause: Job data not fully persisted before read

6. **should produce deterministic results for cleanup operations**
   - File: `job-persistence-deterministic.test.ts:182`
   - Frequency: ~3/20 runs (15%)
   - Root Cause: Cleanup interferes with other concurrent tests

7. **should maintain job order when saving multiple jobs**
   - File: `job-persistence-deterministic.test.ts:100`
   - Frequency: ~2/20 runs (10%)
   - Root Cause: Race in concurrent job saves

8. **should append multiple log entries**
   - File: `audit.test.ts:226`
   - Frequency: ~2/20 runs (10%)
   - Error: Audit log file ENOENT errors
   - Root Cause: Shared audit log directory

## Affected Test Files

1. `scripts/api-server/job-persistence-deterministic.test.ts` (Most affected)
2. `scripts/api-server/job-persistence.test.ts`
3. `scripts/api-server/audit.test.ts`

## Root Cause Analysis

### Primary Issues

1. **Shared File System State**
   - Tests share `.jobs-data/` directory
   - Multiple tests write to `jobs.json` and `jobs.log` simultaneously
   - No file locking mechanism

2. **Insufficient Test Isolation**
   - Tests don't use unique temp directories
   - beforeEach/afterEach cleanup not guaranteed to complete
   - Parallel execution interferes with sequential assumptions

3. **Race Conditions in File Operations**
   - `ENOENT` errors when reading files deleted by concurrent tests
   - Incomplete writes due to concurrent access
   - Order-dependent assertions fail under concurrent load

### Stack Trace Examples

#### ENOENT Error (Most Common)

```
Error: ENOENT: no such file or directory, open '/home/luandro/Dev/digidem/comapeo-docs/.jobs-data/jobs.json'
    at Object.writeFileSync (node:fs:2397:20)
    at saveJobs (scripts/api-server/job-persistence.ts:101:3)
```

#### Assertion Failure

```
AssertionError: expected { id: 'concurrent-job-3', …(3) } to deeply equal { id: 'concurrent-job-3', …(3) }
→ expected undefined to deeply equal { id: 'concurrent-job-0', …(3) }
```

## Recommendations

### Immediate Fixes (High Priority)

1. **Add Test Isolation**

   ```typescript
   // In test setup
   const testDir = `/tmp/test-${Math.random()}/.jobs-data/`;
   // Use unique directory per test file
   ```

2. **Implement File Locking**

   ```typescript
   import lockfile from "proper-lockfile";
   // Acquire lock before file operations
   ```

3. **Sequential Execution for Persistence Tests**
   ```typescript
   describe.configure({ mode: "serial" });
   // Force serial execution for file-dependent tests
   ```

### Long-term Solutions (Medium Priority)

4. **Use In-Memory Storage for Tests**
   - Mock fs module for persistence tests
   - Use memfs or similar library

5. **Add Retry Logic with Exponential Backoff**

   ```typescript
   const retry = async (fn, retries = 3) => {
     for (let i = 0; i < retries; i++) {
       try { return await fn(); }
       catch (e) { if (i === retries - 1) throw; }
       await new Promise(r => setTimeout(r, 2 ** i * 100));
     }
   };
   ```

6. **Improve Cleanup**
   ```typescript
   afterEach(async () => {
     await cleanupTestDirectory();
     // Ensure complete cleanup before next test
   });
   ```

## Test Behavior Notes

- **Individual Test Files**: All pass consistently when run in isolation (10/10 runs)
- **Sequential Full Suite**: Usually passes (1 failure in first run)
- **Parallel Full Suite**: Consistent failures (20/20 runs with failures)
- **Conclusion**: Tests are not designed for parallel execution

## Additional Observations

1. Tests pass reliably when run individually or in sequential mode
2. Flakiness only appears under concurrent execution
3. The test design assumes sequential execution but doesn't enforce it
4. Vitest's parallel execution exposes the race conditions

## Priority Actions

1. **Critical**: Fix test isolation to prevent CI failures
2. **High**: Add `describe.configure({ mode: 'serial' })` to persistence tests
3. **Medium**: Implement proper temp directory management
4. **Low**: Consider migrating to in-memory test storage

## Verification

To verify fixes:

```bash
# Run tests multiple times
for i in {1..20}; do
  bun run test:api-server || echo "Run $i failed"
done

# Run with parallel execution (should expose race conditions)
bunx vitest run --no-coverage --threads scripts/api-server/
```
