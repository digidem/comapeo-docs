# Published Date Property Migration

This document describes the migration from the boolean `Published` checkbox to a `Published date` field in Notion for better publication date tracking.

## Changes Made

### 1. Constants Update (`scripts/constants.ts`)
- Added `PUBLISHED_DATE` property: "Published date"
- Added `PUBLISHED_CHECKBOX` property: "Published" (for backward compatibility)

### 2. Notion Status Script (`scripts/notion-status/index.ts`)
- Added `setPublishedDate` option to `UpdateStatusOptions` interface
- Updated `updateNotionPageStatus` function to set the Published date field when moving to "Published" status
- Modified "publish" workflow to set both checkbox (legacy) and date field
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
2. The existing "Published" checkbox can remain for backward compatibility

### For Deployment
1. Deploy these code changes
2. Existing pages will continue to work (using fallback dates)
3. New pages published through the workflow will get proper published dates
4. The "Published" checkbox will still be set for backward compatibility

### Future Cleanup (Optional)
After all pages have been republished with proper dates:
1. Remove `setPublishedCheckbox` from the publish workflow
2. Remove the `PUBLISHED_CHECKBOX` constant
3. Update any remaining references to use the date field

## Backward Compatibility

- ✅ Existing pages without Published date will use `last_edited_time` or current date
- ✅ The Published checkbox is still set during the publish workflow
- ✅ All existing functionality continues to work
- ✅ Scripts gracefully handle missing Published date properties

## Testing

The changes have been designed to be backward compatible and non-breaking. You can test by:

1. Running the publish workflow: `bun run notionStatus:publish`
2. Checking that both Published checkbox and Published date are set
3. Verifying frontmatter generation uses the correct date

## Expected Notion Configuration

Once ready, your Notion database should have:
- `Published date` property (type: Date) - primary field for publication dates
- `Published` property (type: Checkbox) - optional, for legacy compatibility

## Rollback Procedure (if needed)

If you need to revert these changes:

1. **Code Rollback**:
   ```bash
   git revert <commit-hash>  # Revert the published date commit
   git push origin main
   ```

2. **Workflow Adjustment**:
   - The workflows will automatically revert to using only the checkbox
   - No manual configuration changes needed

3. **Notion Database**:
   - The "Published date" field can remain in Notion (it will be unused)
   - The "Published" checkbox continues to work as before
   - **No data loss occurs** as checkbox values are preserved

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

- [ ] ✅ **Publish workflow works**: `bun run notionStatus:publish` sets both checkbox and date
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
