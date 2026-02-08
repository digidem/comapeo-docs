## FLAKY TEST INVESTIGATION REPORT

### UNIQUE FAILING TESTS:

### FAILURE FREQUENCY (20 runs):

### DETAILED STACK TRACES:

#### Most Frequent: should maintain data integrity after concurrent save operations
[31m   → ENOENT: no such file or directory, open '/home/luandro/Dev/digidem/comapeo-docs/.jobs-data/jobs.json'[39m
[31m   → expected { id: 'concurrent-job-3', …(3) } to deeply equal { id: 'concurrent-job-3', …(3) }[39m
[31m   → expected undefined to deeply equal { id: 'concurrent-job-0', …(3) }[39m
[31m[1mError[22m: ENOENT: no such file or directory, open '/home/luandro/Dev/digidem/comapeo-docs/.jobs-data/jobs.json'[39m
[31m[1mSerialized Error:[22m[39m [90m{ errno: -2, code: 'ENOENT', syscall: 'open', path: '/home/luandro/Dev/digidem/comapeo-docs/.jobs-data/jobs.json' }[39m
[31m[1mAssertionError[22m: expected { id: 'concurrent-job-3', …(3) } to deeply equal { id: 'concurrent-job-3', …(3) }[39m
[31m[1mAssertionError[22m: expected undefined to deeply equal { id: 'concurrent-job-0', …(3) }[39m

#### Second: should maintain chronological order of log entries
[31m   → expected 3 to be 4 // Object.is equality[39m
[31m   → expected 2 to be 4 // Object.is equality[39m
[31m   → expected 3 to be 4 // Object.is equality[39m
[31m   → expected +0 to be 3 // Object.is equality[39m
[31m[1mAssertionError[22m: expected 3 to be 4 // Object.is equality[39m
[31m[1mAssertionError[22m: expected 2 to be 4 // Object.is equality[39m
[31m[1mAssertionError[22m: expected +0 to be 3 // Object.is equality[39m

#### Third: should return all logs when limit is higher
[90mstderr[2m | scripts/api-server/job-persistence.test.ts[2m:377:5[22m[2m[2m > [22m[2mjob-persistence[2m > [22m[2mgetRecentLogs[2m > [22m[2mshould return all logs when limit is higher than actual count
[22m[39m[Job test-job-1] Job 1 warning 
[90mstderr[2m | scripts/api-server/job-persistence.test.ts[2m:377:5[22m[2m[2m > [22m[2mjob-persistence[2m > [22m[2mgetRecentLogs[2m > [22m[2mshould return all logs when limit is higher than actual count
[22m[39m[Job test-job-1] Job 1 warning 
[90mstderr[2m | scripts/api-server/job-persistence.test.ts[2m:377:5[22m[2m[2m > [22m[2mjob-persistence[2m > [22m[2mgetRecentLogs[2m > [22m[2mshould return all logs when limit is higher than actual count
[22m[39m[Job test-job-1] Job 1 warning 
[90mstderr[2m | scripts/api-server/job-persistence.test.ts[2m:383:5[22m[2m[2m > [22m[2mjob-persistence[2m > [22m[2mgetRecentLogs[2m > [22m[2mshould return logs from all jobs
[22m[39m[Job test-job-1] Job 1 warning 
[90mstderr[2m | scripts/api-server/job-persistence.test.ts[2m:383:5[22m[2m[2m > [22m[2mjob-persistence[2m > [22m[2mgetRecentLogs[2m > [22m[2mshould return logs from all jobs
[22m[39m[Job test-job-1] Job 1 warning 

### ROOT CAUSE:
- **File I/O Race Conditions**: Tests share  directory
- **Concurrent Access**: Multiple test processes accessing same files
- **ENOENT Errors**: Files deleted by one test while another reads
- **Test Isolation**: No proper cleanup between parallel runs

### RECOMMENDATIONS:
1. Add proper test isolation with unique temp directories per test
2. Implement file locking for concurrent access
3. Add retry logic with exponential backoff for file operations
4. Consider using in-memory storage for tests instead of file system
5. Add proper beforeEach/afterEach cleanup
