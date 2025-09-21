# Published Date Property Migration

This document describes the migration from the boolean `Published` checkbox to a `Published date` field in Notion.

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