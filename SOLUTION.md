# Solution: Fix Build Failures on Main Branch

## Quick Fix (Immediate Action)

The build failures on main branch are caused by unquoted special characters in YAML frontmatter on the `content` branch. Here's how to fix it:

### Step 1: Checkout the content branch

```bash
git fetch origin content:content
git checkout content
```

### Step 2: Run the fix script

```bash
# Option A: Use the automated script (recommended)
bun scripts/fix-yaml-frontmatter.ts docs/

# Option B: Regenerate all content from Notion (slower but comprehensive)
bun run notion:fetch:all
```

### Step 3: Review and commit changes

```bash
git diff
git add -A
git commit -m "fix(content): quote YAML frontmatter values with special characters"
```

### Step 4: Push to content branch

```bash
git push origin content
```

### Step 5: Verify the fix

```bash
git checkout main
git pull
bun run build
# Should succeed without errors
```

## What Was Fixed

### Files Modified (10 total)

All files had their `title`, `sidebar_label`, and `pagination_label` fields quoted to handle special characters (`:` and `&`):

1. `docs/troubleshooting/troubleshooting-data-privacy--security.md`
   - Before: `title: Troubleshooting: Data Privacy & Security`
   - After: `title: "Troubleshooting: Data Privacy & Security"`

2. `docs/encryption--security.md`
   - Before: `title: Encryption & Security`
   - After: `title: "Encryption & Security"`
   - Also fixed nested `sidebar_custom_props.title` field

3. `docs/understanding-comapeos-core-concepts-and-functions.md`
   - Before: `title: Understanding CoMapeo's Core Concepts & Functions`
   - After: `title: "Understanding CoMapeo's Core Concepts & Functions"`

4. `docs/getting-started-essentials/installing-comapeo--onboarding.md`
   - Before: `title: Installing CoMapeo & Onboarding`
   - After: `title: "Installing CoMapeo & Onboarding"`

5. `docs/managing-data-privacy--security/adjusting-data-sharing--privacy.md`
   - Before: `title: Adjusting Data Sharing & Privacy`
   - After: `title: "Adjusting Data Sharing & Privacy"`

6. `docs/sharing-a-single-observation--metadata.md`
   - Before: `title: Sharing a Single Observation & Metadata`
   - After: `title: "Sharing a Single Observation & Metadata"`

7. `docs/troubleshooting/troubleshooting-setup--customization.md`
   - Before: `title: Troubleshooting: Setup & Customization`
   - After: `title: "Troubleshooting: Setup & Customization"`

8. `docs/troubleshooting/troubleshooting-mapping-with-collaborators.md`
   - Before: `title: Troubleshooting: Mapping with Collaborators`
   - After: `title: "Troubleshooting: Mapping with Collaborators"`

9. `docs/troubleshooting/troubleshooting-observations--tracks.md`
   - Before: `title: Troubleshooting: Observations & Tracks`
   - After: `title: "Troubleshooting: Observations & Tracks"`

10. `docs/troubleshooting/troubleshooting-moving-observations--tracks-outside-of-comapeo.md`
    - Before: `title: Troubleshooting: Moving Observations & Tracks outside of CoMapeo`
    - After: `title: "Troubleshooting: Moving Observations & Tracks outside of CoMapeo"`

## Why This Happened

1. **PR #75 fixed the generation script** but didn't update existing files
2. **PRs regenerate content** from Notion using the fixed script (success ✅)
3. **Main branch uses the content branch** which has old files (failure ❌)

## Prevention

### Already Implemented (PR #75)

The `scripts/notion-fetch/generateBlocks.ts` now has a `quoteYamlValue()` function that automatically quotes special characters in all generated frontmatter. This prevents new files from having this issue.

### Additional Recommendations

1. **Add CI validation**: Create a pre-commit or CI check to validate YAML frontmatter
2. **Document the requirement**: Add to CLAUDE.md that all YAML values with special characters must be quoted
3. **Regular audits**: Run `scripts/fix-yaml-frontmatter.ts` periodically on the content branch

## Using the Fix Script

The `scripts/fix-yaml-frontmatter.ts` script can be used anytime to validate and fix YAML frontmatter:

```bash
# Fix all markdown files in docs/
bun scripts/fix-yaml-frontmatter.ts docs/

# Fix files in a specific subdirectory
bun scripts/fix-yaml-frontmatter.ts docs/troubleshooting/

# Check without modifying (dry run - not implemented yet)
# Can be added as a feature if needed
```

The script:
- ✅ Scans all `.md` and `.mdx` files recursively
- ✅ Identifies frontmatter fields needing quotes
- ✅ Quotes fields with special characters: `& : [ ] { } , | > * ! % @ \` # -`
- ✅ Preserves already-quoted values
- ✅ Reports summary of changes

## Testing

After applying the fix, verify with:

```bash
# Test that YAML parses correctly
bunx prettier --check docs/**/*.md

# Test that build succeeds
bun run build

# Expected output:
# [SUCCESS] Generated static files in "build"
```

## Need Help?

If issues persist:
1. Check `INVESTIGATION-REPORT.md` for detailed analysis
2. Verify PR #75 changes are merged to main
3. Ensure Notion API credentials are configured (if regenerating content)
4. Check CI logs for specific error messages

## Related Files

- `INVESTIGATION-REPORT.md` - Detailed analysis of the issue
- `scripts/fix-yaml-frontmatter.ts` - Automated fix script
- `scripts/notion-fetch/generateBlocks.ts:998-1016` - Prevention code
- PR #75 - Original fix for generation scripts
