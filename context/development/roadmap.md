# Notion Fetch Roadmap

This document tracks future improvements and next steps for the Notion fetch system.

**Last Updated:** 2025-01-XX (after completing 9 improvement issues + 9 bug fixes)

---

## Immediate (Post-Merge Validation)

- [ ] **Production Validation Run**
  - Run `bun run notion:fetch-all` on the full database
  - Verify parallel processing works correctly with real Notion data
  - Check that all pages generate correctly

- [ ] **Performance Benchmarking**
  - Measure actual speedup (target: 50-70% faster)
  - Document baseline for future comparisons
  - Example: "156 pages: 78min → 28min"

- [ ] **Monitor First Few Runs**
  - Watch for rate limiting (429s from Notion API)
  - Check memory usage during parallel processing
  - Verify cache migration works for existing `.cache/images/`

---

## Short-Term Improvements

### Aggregated Metrics Summary
- [ ] Currently each page logs its own metrics
- [ ] Add end-of-run summary aggregating all page metrics
- [ ] Better visibility into overall performance

**Files:** `generateBlocks.ts`, `imageReplacer.ts`

### Activate Rate Limiting
- [ ] `RateLimitManager` is built but not fully integrated
- [ ] Connect to parallel page processing for automatic throttling
- [ ] Prevents Notion API abuse

**Files:** `rateLimitManager.ts`, `generateBlocks.ts`

### Telemetry Dashboard
- [ ] `TelemetryCollector` generates reports
- [ ] Consider visualizing timeout distributions
- [ ] Helps tune timeout values based on real data

**Files:** `telemetryCollector.ts`

---

## Medium-Term Enhancements

### Incremental Sync
- [ ] Currently fetches all pages every run
- [ ] Use `notionLastEdited` to skip unchanged pages
- [ ] Could reduce runtime by 80%+ for incremental updates

**Implementation Notes:**
- Cache stores `notionLastEdited` already
- Compare with Notion API's `last_edited_time`
- Skip page processing if unchanged

### Preview Deployment Optimization
- [ ] Use incremental sync for PR previews
- [ ] Only regenerate pages that changed
- [ ] Faster CI feedback loop

### Cache Pruning
- [ ] Per-entry cache can grow indefinitely
- [ ] Add cleanup for orphaned entries
- [ ] Implement max age/size limits

**Implementation Notes:**
- Scan `.cache/images/` for entries not in current run
- Remove entries older than 90 days
- Add `bun run cache:prune` command

---

## Long-Term Considerations

### Streaming Progress to CI
- [ ] GitHub Actions could show live progress
- [ ] Better visibility for long-running fetches
- [ ] Use GitHub Actions job summaries

### Webhook-Triggered Sync
- [ ] Notion webhooks trigger sync on content changes
- [ ] Real-time content updates
- [ ] Requires webhook endpoint (Cloudflare Worker?)

### Multi-Database Support
- [ ] Current architecture supports single database
- [ ] Could extend for multiple Notion databases
- [ ] Useful for multi-project documentation

---

## Documentation Tasks

- [ ] Update README with new performance characteristics
- [ ] Document cache migration for existing users
- [ ] Add troubleshooting guide for common issues
- [ ] Create runbook for production Notion sync

---

## Monitoring Checklist

After each major change, verify:
- [ ] No increase in failed pages
- [ ] Memory usage stable
- [ ] No Notion API rate limiting
- [ ] Cache hit rates healthy
- [ ] Build times improved

---

## Completed Work

### Performance Improvements (Jan 2025)
- [x] Issue #1: CI spinner detection
- [x] Issue #2: Smart image skip optimization
- [x] Issue #3: Lazy cache loading
- [x] Issue #4: Parallel page processing
- [x] Issue #5: Error manager
- [x] Issue #6: Adaptive batch sizing
- [x] Issue #7: Cache freshness tracking
- [x] Issue #8: Timeout telemetry
- [x] Issue #9: Progress tracking

### Bug Fixes (Jan 2025)
- [x] Duplicate metric counting in retries
- [x] ProgressTracker leak on empty arrays
- [x] Metrics race condition in parallel processing
- [x] False success reporting in ProgressTracker
- [x] Timeout hangs ProgressTracker
- [x] Double-counting timed-out tasks
- [x] Malformed pages crash with TypeError
- [x] Placeholder page spinner overwritten
- [x] Unguarded onItemComplete callbacks

---

## Architecture Reference

See `NOTION_FETCH_ARCHITECTURE.md` in the project root for:
- Bug fix patterns and lessons learned
- Architecture decisions
- Gotchas and warnings
