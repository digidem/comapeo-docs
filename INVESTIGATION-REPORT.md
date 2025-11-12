# Investigation Report: Build Failures on Main Branch

## Issue Summary

The `bun run build` command succeeds on PR branches but fails on the main branch with YAML frontmatter parsing errors:

```
YAMLException: incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line
```

## Root Cause Analysis

### The Problem

The build failures are caused by **two separate but related issues**:

1. **Script Issue (Fixed in PR #75)**: The Notion fetch scripts were generating markdown files with unquoted special characters (`:` and `&`) in YAML frontmatter fields
2. **Content Branch Issue (Not Fixed)**: The `content` branch contains pre-existing markdown files with the same unquoted special characters

### Why PRs Succeed But Main Fails

**PR Builds**:
- Preview workflow regenerates content from Notion using the **fixed scripts** (from PR #75)
- New content has properly quoted YAML frontmatter
- Build succeeds ✅

**Main Branch Builds**:
- Uses the existing `content` branch for speed (when not modifying scripts)
- Content branch still has **old files** with unquoted frontmatter
- Build fails ❌

### Technical Details

YAML parsers (gray-matter/js-yaml) treat special characters differently:

```yaml
# ❌ FAILS - colon interpreted as key-value separator
title: Troubleshooting: Data Privacy & Security

# ✅ WORKS - quoted string is treated as a single value
title: "Troubleshooting: Data Privacy & Security"
```

Characters requiring quoting: `& : [ ] { } , | > * ! % @ \` # -`

## Affected Files

10 markdown files in the `content` branch have unquoted special characters:

1. `docs/troubleshooting/troubleshooting-data-privacy--security.md`
2. `docs/encryption--security.md`
3. `docs/understanding-comapeos-core-concepts-and-functions.md`
4. `docs/getting-started-essentials/installing-comapeo--onboarding.md`
5. `docs/managing-data-privacy--security/adjusting-data-sharing--privacy.md`
6. `docs/sharing-a-single-observation--metadata.md`
7. `docs/troubleshooting/troubleshooting-setup--customization.md`
8. `docs/troubleshooting/troubleshooting-mapping-with-collaborators.md`
9. `docs/troubleshooting/troubleshooting-observations--tracks.md`
10. `docs/troubleshooting/troubleshooting-moving-observations--tracks-outside-of-comapeo.md`

Each file has unquoted values in `title`, `sidebar_label`, and `pagination_label` fields.

## Solution

### Option 1: Manual Fix (Immediate)

Manually update the 10 files in the `content` branch to quote all frontmatter values containing special characters.

**Pros**:
- Immediate fix
- Minimal risk

**Cons**:
- Manual process
- Could miss files

### Option 2: Automated Script (Recommended)

Create a script to:
1. Scan all markdown files in `content` branch
2. Parse frontmatter
3. Quote values containing special characters
4. Commit and push changes

**Pros**:
- Comprehensive
- Reusable for future issues
- Catches all affected files

**Cons**:
- Requires more development time

### Option 3: Regenerate Content (Nuclear Option)

Delete the `content` branch and regenerate all content from Notion using the fixed scripts.

**Pros**:
- Guaranteed to fix all issues
- Fresh content

**Cons**:
- Time-consuming (~8 minutes for full regeneration)
- Requires Notion API access
- May introduce other changes

## Recommended Action Plan

1. **Immediate**: Apply the manual fixes to the 10 identified files in the `content` branch
2. **Short-term**: Create an automated script to validate and fix YAML frontmatter
3. **Long-term**: Add CI checks to prevent unquoted special characters in generated content

## Files Changed

A commit has been prepared (but not pushed) to the `content` branch with all necessary fixes:
- 10 files modified
- 31 insertions, 31 deletions
- All titles, sidebar_labels, and pagination_labels properly quoted

## Testing

To verify the fix:
```bash
# Switch to content branch
git checkout content

# Apply the fixes (already committed locally)
git log -1 --stat

# Build the documentation
bun run build

# Expected: Build succeeds without YAML parsing errors
```

## Prevention

PR #75 already prevents this issue going forward by:
1. Adding `quoteYamlValue()` helper function
2. Automatically quoting all frontmatter values with special characters
3. Applying to all generated markdown files

The `content` branch just needs a one-time update to apply these fixes retroactively.

## Related

- PR #75: "fix(docs,ci): YAML frontmatter quoting and sharp module installation"
- Main branch commit: `aeabd1e`
- Session: `011CV44zE2CUY21DYsDn1EWn`
