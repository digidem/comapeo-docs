# Rollback Guide: Retry Image Processing Feature

**Last Updated**: 2025-12-05
**Feature**: Retry-based image processing for Notion URL expiration handling
**PR**: #102

## Overview

This document provides step-by-step instructions for rolling back the retry image processing feature if issues occur in production. The feature introduces intelligent retry logic to handle Notion's 1-hour image URL expiration, but can be disabled instantly via environment variable.

## Quick Rollback (Emergency)

If you need to disable the retry feature immediately:

```bash
# Set environment variable to disable retry logic
export ENABLE_RETRY_IMAGE_PROCESSING=false

# Or in .env file
echo "ENABLE_RETRY_IMAGE_PROCESSING=false" >> .env

# Restart the application/process
# The system will fall back to single-pass processing
```

**Effect**: Disables retry loop immediately. Image processing will revert to single-pass behavior (same as pre-PR #102).

**Downtime**: None - change takes effect on next script execution.

## Rollback Scenarios

### Scenario 1: Performance Degradation

**Symptoms**:
- Script execution time increased significantly (>50%)
- High memory usage during page processing
- Timeout errors in CI/CD pipelines

**Rollback Steps**:

1. **Disable retry feature**:
   ```bash
   export ENABLE_RETRY_IMAGE_PROCESSING=false
   ```

2. **Monitor metrics**:
   ```bash
   # Check if retry-metrics.json shows high retry frequency
   cat retry-metrics.json | jq '.metrics.retryFrequency'

   # Expected: Should show 0% after rollback
   ```

3. **Run test execution**:
   ```bash
   bun run notion:fetch-all
   # Time the execution and compare with baseline
   ```

4. **Verify behavior**:
   - Check console output for "Using single-pass processing (retry disabled)" message
   - Confirm no retry attempts are logged
   - Validate execution time returns to pre-PR #102 baseline

### Scenario 2: Incorrect Image Processing

**Symptoms**:
- Images not downloading correctly
- Broken image references in generated markdown
- S3 URL detection false positives/negatives

**Rollback Steps**:

1. **Disable retry feature**:
   ```bash
   export ENABLE_RETRY_IMAGE_PROCESSING=false
   ```

2. **Clear existing generated content**:
   ```bash
   # Switch to content branch and clean
   git worktree add worktrees/content content
   cd worktrees/content
   git rm -rf docs/ i18n/ static/images/
   git commit -m "chore: clear content for regeneration"
   git push origin content
   cd ../..
   ```

3. **Regenerate content with single-pass processing**:
   ```bash
   bun run notion:fetch-all
   ```

4. **Verify image quality**:
   - Check that images download correctly
   - Validate markdown image references
   - Confirm static/images/ contains expected files

### Scenario 3: Retry Logic Bugs

**Symptoms**:
- Infinite retry loops
- Race conditions causing crashes
- Incorrect retry metrics reporting

**Rollback Steps**:

1. **Immediate disable**:
   ```bash
   export ENABLE_RETRY_IMAGE_PROCESSING=false
   ```

2. **Check for stuck processes**:
   ```bash
   # If running in background, kill any hung processes
   ps aux | grep notion-fetch
   kill -9 <PID>
   ```

3. **Inspect retry metrics**:
   ```bash
   cat retry-metrics.json
   # Look for anomalies:
   # - totalRetryAttempts > totalPagesProcessed * MAX_IMAGE_RETRIES
   # - retrySuccessRate < 50%
   # - Configuration mismatch
   ```

4. **Clean state and restart**:
   ```bash
   # Remove potentially corrupted cache
   rm -f image-cache.json
   rm -f retry-metrics.json

   # Restart with retry disabled
   bun run notion:fetch-all
   ```

## Monitoring After Rollback

### Key Metrics to Track

1. **Execution Time**:
   ```bash
   # Time the script execution
   time bun run notion:fetch-all

   # Compare with baseline (pre-PR #102)
   # Expected: Should return to ~8-12 minutes for full fetch
   ```

2. **Image Download Success Rate**:
   ```bash
   # Count images in output
   find static/images -type f -name "*.png" -o -name "*.jpg" | wc -l

   # Compare with expected image count from Notion pages
   ```

3. **Metrics File**:
   ```bash
   # After rollback, verify retry metrics show disabled state
   cat retry-metrics.json | jq '.'
   # Expected output:
   # {
   #   "configuration": {
   #     "retryEnabled": false,
   #     ...
   #   },
   #   "metrics": {
   #     "totalPagesWithRetries": 0,
   #     "retryFrequency": "0%"
   #   }
   # }
   ```

4. **Console Output**:
   - Look for: "ℹ️  Using single-pass processing (retry disabled)"
   - Absence of: "🔄 Retry attempt X/Y" messages
   - No retry-related warnings or errors

## Re-enabling the Feature

If the issue is resolved or was a false alarm:

1. **Remove the environment variable**:
   ```bash
   unset ENABLE_RETRY_IMAGE_PROCESSING
   # Or remove from .env file
   ```

2. **Verify default behavior**:
   ```bash
   # Check that retry is enabled by default
   bun scripts/notion-fetch/generateBlocks.ts
   # Look for retry-related console output
   ```

3. **Monitor initial runs**:
   - Check retry-metrics.json for reasonable values
   - Ensure retrySuccessRate is >80%
   - Confirm execution time is acceptable

4. **Gradual rollout** (if needed):
   ```bash
   # Test on subset of pages first
   bun run notion:fetch -- --limit 10

   # If successful, run full fetch
   bun run notion:fetch-all
   ```

## Environment Variables Reference

| Variable | Default | Description | Valid Values |
|----------|---------|-------------|--------------|
| `ENABLE_RETRY_IMAGE_PROCESSING` | `"true"` | Enable/disable retry logic | `"true"`, `"false"` |
| `MAX_IMAGE_RETRIES` | `"3"` | Maximum retry attempts per page | `"1"` to `"10"` |

**Note**: Values are case-insensitive strings. Any value other than "true" (case-insensitive) disables the feature.

## Common Issues and Solutions

### Issue: Rollback doesn't take effect

**Cause**: Environment variable not set correctly or process not restarted.

**Solution**:
```bash
# Verify environment variable
echo $ENABLE_RETRY_IMAGE_PROCESSING

# Ensure it's set to "false"
export ENABLE_RETRY_IMAGE_PROCESSING=false

# Confirm with fresh shell
env | grep ENABLE_RETRY_IMAGE_PROCESSING
```

### Issue: Images still failing after rollback

**Cause**: Issue is not related to retry logic, but underlying image download mechanism.

**Solution**:
- This indicates the problem existed before PR #102
- Check Notion API connectivity
- Verify image cache (`image-cache.json`) is not corrupted
- Review `imageDownloader.ts` logic

### Issue: Metrics file not updating

**Cause**: File permissions or metrics logging code failure.

**Solution**:
```bash
# Check file permissions
ls -la retry-metrics.json

# If missing, it will be created on next run
# If permission denied:
chmod 644 retry-metrics.json

# Check console output for metrics save errors
bun run notion:fetch-all 2>&1 | grep "Failed to save retry metrics"
```

## Testing the Rollback

To verify the rollback mechanism works correctly:

```bash
# 1. Enable retry (default state)
unset ENABLE_RETRY_IMAGE_PROCESSING
bun run notion:fetch -- --limit 5
# Should see retry messages in console

# 2. Disable retry
export ENABLE_RETRY_IMAGE_PROCESSING=false
bun run notion:fetch -- --limit 5
# Should see "Using single-pass processing (retry disabled)"

# 3. Verify metrics reflect disabled state
cat retry-metrics.json | jq '.configuration.retryEnabled'
# Expected: false
```

## Support and Escalation

If rollback does not resolve the issue:

1. **Capture diagnostics**:
   ```bash
   # Save full console output
   bun run notion:fetch-all > rollback-diagnostics.log 2>&1

   # Include environment configuration
   env | grep -E "(ENABLE_RETRY|MAX_IMAGE)" >> rollback-diagnostics.log

   # Include metrics
   cat retry-metrics.json >> rollback-diagnostics.log
   ```

2. **Create GitHub issue** with:
   - Description of symptoms
   - Steps taken to rollback
   - Contents of `rollback-diagnostics.log`
   - Expected vs actual behavior
   - Reference to this rollback guide

3. **Consider full PR revert** if issue is critical:
   ```bash
   # Revert the entire PR #102
   git revert <PR-merge-commit-SHA>
   git push origin main
   ```

## Changelog

- **2025-12-05**: Initial rollback guide created for PR #102
