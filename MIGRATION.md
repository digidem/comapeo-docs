# Published Date Property Implementation

This document describes the implementation of a date-only approach for publication tracking in Notion, removing dependency on the boolean `Published` checkbox.

## Changes Made

### 1. Constants Update (`scripts/constants.ts`)

- Added `PUBLISHED_DATE` property: "Published date"
- Removed `PUBLISHED_CHECKBOX` property (checkbox approach discontinued)

### 2. Notion Status Script (`scripts/notion-status/index.ts`)

- Added `setPublishedDate` option to `UpdateStatusOptions` interface
- Updated `updateNotionPageStatus` function to set the Published date field when moving to "Published" status
- Modified "publish" workflow to set only the date field (no checkbox)
- Sets current date in YYYY-MM-DD format when publishing

### 3. Frontmatter Generation (`scripts/notion-fetch/generateBlocks.ts`)

- Added `getPublishedDate()` helper function that:
  - Prioritizes `Published date` field if available
  - Falls back to `last_edited_time` if no published date
  - Final fallback to current date
- Updated frontmatter generation to use the published date for `last_update.date`

## Migration Steps

### For Notion Database Setup

1. Create a new "Published date" property in your Notion database with type "Date"
2. The existing "Published" checkbox can remain but will no longer be used by the system

### For Deployment

1. Deploy these code changes
2. Existing pages will continue to work (using fallback dates)
3. New pages published through the workflow will get proper published dates
4. Only the date field will be set during publishing (no checkbox interaction)

## Backward Compatibility

- ✅ Existing pages without Published date will use `last_edited_time` or current date
- ✅ All existing functionality continues to work
- ✅ Scripts gracefully handle missing Published date properties
- ✅ Published checkbox is ignored but can remain in the database without issues

## Testing

The changes have been designed to be backward compatible and non-breaking. You can test by:

1. Running the publish workflow: `bun run notionStatus:publish`
2. Checking that Published date is set (checkbox will not be modified)
3. Verifying frontmatter generation uses the correct date

## Expected Notion Configuration

Once ready, your Notion database should have:

- `Published date` property (type: Date) - the only field used for publication tracking
- `Published` property (type: Checkbox) - can remain but is not used by the system

## Rollback Procedure (if needed)

If you need to revert these changes:

1. **Code Rollback**:

   ```bash
   git revert <commit-hash>  # Revert the published date commit
   git push origin main
   ```

2. **Workflow Adjustment**:
   - The workflows will revert to their previous behavior
   - Manual configuration changes may be needed to restore checkbox usage

3. **Notion Database**:
   - The "Published date" field can remain in Notion (it will be unused)
   - The "Published" checkbox would need to be re-enabled in code if needed
   - **No data loss occurs** as both fields preserve their values

4. **Frontmatter Behavior**:
   - Will revert to using `new Date().toLocaleDateString("en-US")` for all pages
   - Existing generated files are not automatically updated

## Troubleshooting

### Issue: Frontmatter shows current date instead of published date

- **Cause**: Published date field not set in Notion
- **Solution**:
  1. Re-run publish workflow: `bun run notionStatus:publish`
  2. Or manually set date in Notion database
  3. Re-generate frontmatter: `bun run notion:fetch`

### Issue: "Invalid published date format" warnings in console

- **Cause**: Malformed date in Notion's "Published date" field
- **Solution**:
  1. Check the date format in Notion (should be YYYY-MM-DD)
  2. Update the date to a valid format
  3. The system will automatically fall back to `last_edited_time` if date is invalid

### Issue: Published date not being set during workflow

- **Cause**: Missing "Published date" property in Notion database
- **Solution**:
  1. Create a new property named "Published date" with type "Date" in your Notion database
  2. Re-run the publish workflow

### Issue: Scripts failing after update

- **Cause**: TypeScript compilation errors or missing dependencies
- **Solution**:
  1. Run `bun install` to ensure dependencies are up to date
  2. Check that `PUBLISHED_DATE` constant matches your Notion property name exactly
  3. Verify Notion API permissions include the new property

### Issue: Old pages showing incorrect dates

- **Cause**: Pages published before the date field was implemented
- **Solution**:
  1. These pages will use `last_edited_time` automatically (expected behavior)
  2. To set proper published dates, manually update the "Published date" field in Notion
  3. Or re-run the publish workflow for those pages

## Validation Checklist

After deployment, verify:

- [ ] ✅ **Publish workflow works**: `bun run notionStatus:publish` sets the published date
- [ ] ✅ **Frontmatter generation**: New pages use the published date from Notion
- [ ] ✅ **Fallback behavior**: Pages without published date use `last_edited_time`
- [ ] ✅ **Error handling**: Invalid dates don't break the system
- [ ] ✅ **Backward compatibility**: Existing pages continue to work
- [ ] ✅ **Console output**: No unexpected errors during generation

## Performance Impact

- **Minimal**: Only adds date parsing and formatting logic
- **API calls**: No additional Notion API requests
- **Build time**: Negligible impact on documentation generation
- **Storage**: No significant increase in file sizes
