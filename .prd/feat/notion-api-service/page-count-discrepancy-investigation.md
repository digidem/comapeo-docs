# Task 0 Investigation Report: 24-vs-120 Page Count Discrepancy

**Date**: 2026-02-08
**Branch**: `feat/notion-api-service`
**Test command**: `./scripts/test-docker/test-fetch.sh --all --no-cleanup`

---

## Executive Summary

The reported "24 pages instead of 120" is **not a fetch pipeline bug**. The pipeline successfully fetches and processes all available pages. The discrepancy is caused by:

1. **Multilingual output**: The pipeline generates files across 3 directories (`docs/`, `i18n/pt/`, `i18n/es/`), but the test only counts `docs/` (English).
2. **Image permission errors**: EACCES errors on `/app/static/images/` cause retries that slow the job beyond the polling timeout.
3. **Job timeout**: The 600s polling timeout expires before the job finishes, so the test reports whatever partial results exist at that point.

---

## Pipeline Stage Analysis

### Stage 1: Notion API Fetch (`fetchNotionData`)

- **Result**: Data fetched successfully (no pagination issues)
- The function uses `page_size: 100` with cursor-based pagination and duplicate detection

### Stage 2: Sub-page Expansion (`sortAndExpandNotionData`)

- **1 sub-page skipped** due to 10s API timeout: `26b1b081-62d5-8055-9b25-cac2fd8065f6`
- All other sub-pages fetched successfully

### Stage 3: Markdown Generation

- **Total pages processed**: 159 (this is the combined count across all 3 languages)
- **Successfully processed**: 117 of 159 pages (remaining 42 were processing when timeout hit in earlier run, but completed given enough time)
- **Processing time**: 14 minutes 18 seconds
- **Job exit code**: 0 (success)

### Output Breakdown by Language

| Directory  | Files Generated | Purpose                 |
| ---------- | --------------- | ----------------------- |
| `docs/`    | 39-43           | English content         |
| `i18n/pt/` | 37              | Portuguese translations |
| `i18n/es/` | 36              | Spanish translations    |
| **Total**  | **112-116**     | All languages           |

Note: The total unique content pages is ~39-43 (the English count). The 159 "pages processed" includes all three language variants of each page.

### Why the User Saw "24"

The earlier run likely timed out even sooner (the default 120s timeout for non-`--all`, or the job was killed prematurely). With only partial completion, only ~24 English files existed in `docs/` at the time the test reported results.

---

## Bugs Found

### Bug 1: EACCES Permission Denied on Docker Volume Mount (CRITICAL)

**Symptom**: 556 EACCES errors in container logs when writing to `/app/static/images/`.

**Root cause**: The Docker container's `bun` user (UID 1000) cannot write to the volume-mounted `static/images/` directory despite `chmod 777` in the test script. The volume mount may override host permissions, or the Docker storage driver may not honor them.

**Impact**: Every image with a JPEG component triggers 3 retry attempts with 30s+ delays each. This is the primary reason the job takes 14+ minutes instead of ~2-3 minutes.

**Error pattern**:

```
EACCES: permission denied, copyfile '/tmp/img-opt-xxx/orig-file.jpg' -> '/app/static/images/file.jpg'
```

**Recommendation**: Fix by either:

1. Running the container with `--user root` for test scenarios
2. Using `docker run -v $(pwd)/static/images:/app/static/images:z` (SELinux relabel)
3. Creating the dirs inside the container before starting the job

### Bug 2: Missing `jpegtran` Binary in Docker Image

**Symptom**: 137 `jpegtran` ENOENT errors.

**Root cause**: The `jpegtran-bin` npm package has a vendor binary at `/app/node_modules/jpegtran-bin/vendor/jpegtran` that doesn't exist in the Docker image. The `pngquant` symlink was fixed previously, but `jpegtran` was not addressed.

**Error pattern**:

```
ENOENT: no such file or directory, posix_spawn '/app/node_modules/jpegtran-bin/vendor/jpegtran'
```

**Impact**: JPEG optimization falls back to copying the original file, which then hits the EACCES error. Images end up as "informative placeholders" instead of optimized versions.

**Recommendation**: Add a similar symlink fix for `jpegtran` in the Dockerfile, or install `libjpeg-turbo-progs` in the Docker image.

### Bug 3: Test Script Only Counts `docs/` Directory

**Symptom**: Test reports "28 markdown files" when 116 were actually generated.

**Root cause**: `test-fetch.sh` line 216 only counts files in `docs/`:

```bash
DOC_COUNT=$(find docs -name "*.md" 2>/dev/null | wc -l)
```

**Impact**: The reported count is always ~1/3 of actual output (English-only, ignoring pt and es translations).

**Recommendation**: Either count all three directories, or clearly document that the count refers to English pages only. The upcoming count validation (Tasks 1-6) should compare against English-only count since that's what Notion sends as unique pages.

---

## Key Numbers

| Metric                                | Value              |
| ------------------------------------- | ------------------ |
| Total pages processed (all languages) | 159                |
| Unique content pages (English)        | ~43                |
| Portuguese translations               | ~37                |
| Spanish translations                  | ~36                |
| Sub-pages skipped                     | 1 (timeout)        |
| Image EACCES errors                   | 556                |
| jpegtran ENOENT errors                | 137                |
| Total processing time                 | 14m 18s            |
| Job final status                      | completed (exit 0) |

---

## Recommendations for PRD Update

1. **Reframe the problem**: The issue is not "only 24 pages fetched" but rather "no validation exists, and image permission errors cause timeouts that hide the actual results"
2. **Count validation should compare English-only files** in `docs/` against the count-pages result (which returns unique page count, not multiplied by languages)
3. **Add a separate issue** for the Docker image permission and jpegtran bugs
4. **Consider increasing the default polling timeout** for `--all` runs to 900s+ given 14min processing time
