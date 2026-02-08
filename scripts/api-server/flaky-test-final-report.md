## EXACT FAILING TESTS WITH FREQUENCY:


## AFFECTED TEST FILES:

## KEY STACK TRACES:

### 1. ENOENT Race Condition (Most Common)
```
[22m[39mFailed to write audit log: Error: ENOENT: no such file or directory, open '/home/luandro/Dev/digidem/comapeo-docs/.test-audit-integration/audit-integration.log'
[90m    at Object.writeFileSync (node:fs:2397:20)[39m
[90m    at appendFileSync (node:fs:2479:6)[39m
    at AuditLogger.log [90m(/home/luandro/Dev/digidem/comapeo-docs/[39mscripts/api-server/audit.ts:180:7[90m)[39m
    at AuditLogger.logFailure [90m(/home/luandro/Dev/digidem/comapeo-docs/[39mscripts/api-server/audit.ts:209:10[90m)[39m
    at [90m/home/luandro/Dev/digidem/comapeo-docs/[39mscripts/api-server/audit-logging-integration.test.ts:259:13
--
[31m   → ENOENT: no such file or directory, open '/home/luandro/Dev/digidem/comapeo-docs/.jobs-data/jobs.json'[39m
[31m   → expected { id: 'concurrent-job-3', …(3) } to deeply equal { id: 'concurrent-job-3', …(3) }[39m
[31m   → expected undefined to deeply equal { id: 'concurrent-job-0', …(3) }[39m
```

### 2. Assertion Failures in Concurrent Operations
```
 [31m×[39m scripts/api-server/job-persistence-deterministic.test.ts[2m:617:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from partial operations[2m > [22mshould maintain data integrity after concurrent save operations[32m 54[2mms[22m[39m[33m (retry x2)[39m
[31m   → ENOENT: no such file or directory, open '/home/luandro/Dev/digidem/comapeo-docs/.jobs-data/jobs.json'[39m
[31m   → expected { id: 'concurrent-job-3', …(3) } to deeply equal { id: 'concurrent-job-3', …(3) }[39m
[31m   → expected undefined to deeply equal { id: 'concurrent-job-0', …(3) }[39m
 [32m✓[39m scripts/api-server/job-persistence-deterministic.test.ts[2m:644:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from edge cases[2m > [22mshould handle job with all optional fields populated[32m 2[2mms[22m[39m
 [32m✓[39m scripts/api-server/job-persistence-deterministic.test.ts[2m:672:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from edge cases[2m > [22mshould handle job with minimal fields[32m 1[2mms[22m[39m
 [32m✓[39m scripts/api-server/job-persistence-deterministic.test.ts[2m:690:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from edge cases[2m > [22mshould handle special characters in log messages[32m 11[2mms[22m[39m
 [32m✓[39m scripts/api-server/job-persistence-deterministic.test.ts[2m:715:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from edge cases[2m > [22mshould handle very long log messages[32m 1[2mms[22m[39m
 [32m✓[39m scripts/api-server/job-persistence-deterministic.test.ts[2m:728:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from edge cases[2m > [22mshould handle log with complex data objects[32m 4[2mms[22m[39m
--

[41m[1m FAIL [22m[49m scripts/api-server/job-persistence-deterministic.test.ts[2m:617:5[22m[2m > [22mjob-persistence - recoverable behavior[2m > [22mrecovery from partial operations[2m > [22mshould maintain data integrity after concurrent save operations
[31m[1mAssertionError[22m: expected { id: 'concurrent-job-3', …(3) } to deeply equal { id: 'concurrent-job-3', …(3) }[39m

[32m- Expected[39m
```

