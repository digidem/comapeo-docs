# Production Deployment Workflow

How content reaches production with the content lock approval gate.

## Overview

Production deploys use a **locked content SHA** to ensure only reviewed and approved content goes live. This prevents accidentally publishing unreviewed content when code changes merge to `main`.

```
Notion Content (WIP)
    ↓
content branch (staging/review)
    ↓
[Approval Gate] → content-lock.sha updated on main
    ↓
Production deployment
```

## The Content Lock File

**File**: `content-lock.sha` (tracked on `main`)

**Contains**: A single 40-character Git commit SHA pointing to an approved content revision

**Purpose**: Pin an exact content commit for production. Production deploys check out this exact SHA, not the current content branch HEAD.

### Why This Matters

- **Before**: Any push to `main` would deploy whatever was in `content` branch HEAD, potentially publishing WIP or incomplete content
- **After**: Only approved content commits (pinned via PR to `main`) reach production

## Workflow: Promote Content to Production

### Option 1: GitHub UI (Recommended)

1. **Open Actions** → "Promote Content to Production"
2. **Run workflow** — leave SHA blank to use current content branch HEAD
3. Review the automatically-created PR:
   - Check content SHA
   - Verify pre-merge checklist is complete
   - Add any additional review comments
4. **Merge PR to main** → triggers production deploy with locked SHA

### Option 2: CLI

```bash
# Promote current content branch HEAD
git rev-parse origin/content > content-lock.sha
git add content-lock.sha
git commit -m "chore(content): promote content to production"
git push origin HEAD -u
gh pr create --base main
```

Then review and merge the PR.

## Deployment Flow

When `deploy-production.yml` runs:

1. **Resolve locked SHA**:
   - Read `content-lock.sha` from `main`
   - Validate format and existence
   - Error if empty or invalid
   - Warning if not ancestor of current content branch (rebased case)

2. **Checkout locked content**:
   - `git checkout <locked-sha> -- docs/ i18n/ static/images/`
   - All existing validation (markdown count, image checks) unchanged

3. **Deploy with locked SHA**:
   - Build Docusaurus
   - Deploy to Cloudflare Pages
   - Update Notion status (production flow only)
   - Report SHA in summary + Slack notification

## Rollback: Revert to Previous Content

If production content needs to be rolled back:

1. **Find previous approved SHA**:
   ```bash
   git log --oneline content-lock.sha | head -5
   ```

2. **Update lock file**:
   ```bash
   git checkout <old-sha>:content-lock.sha > content-lock.sha
   git add content-lock.sha
   git commit -m "chore(content): rollback content to SHA <short>"
   git push origin HEAD -u
   gh pr create --base main --title "Rollback content to ..."
   ```

3. **Merge PR** → automatic redeploy with rolled-back content

## Content Branch Workflow

### Staging Deploys

Staging (`deploy-staging.yml`) **always** uses current `content` branch HEAD:
- No lock file involvement
- Uses `paths: [docs/**, i18n/**, ...]` trigger
- Fast feedback for content review

### Production Deploys

Production (`deploy-production.yml`) **always** uses locked SHA:
- Must update lock file to promote content
- Requires PR to `main` (approval gate)
- Includes SHA validation and error reporting

## Backward Compatibility

First time `content-lock.sha` is added to a repo:
- If missing: falls back to `origin/content` HEAD with **warning**
- If empty: **error** (developer must fix)
- After first merge: lock file is present and required

## Error Cases

### Empty lock file
```
::error::content-lock.sha is empty. Update content-lock.sha with a valid 40-char content SHA.
```
**Fix**: `git rev-parse origin/content > content-lock.sha` and commit

### Invalid SHA format
```
::error::content-lock.sha contains an invalid SHA: 'xxx'. Expected 40-character lowercase hex.
```
**Fix**: Use `git rev-parse origin/content` and commit the output

### SHA not in repository (force-push)
```
::error::SHA <sha> does not exist in repository. This may happen after force-push.
Remediation: run 'promote-content' workflow or update content-lock.sha.
```
**Fix**: Either push a new commit to content branch or promote a different SHA

### SHA not ancestor of content HEAD (rebase)
```
::warning::Locked SHA <sha> is not an ancestor of origin/content HEAD. Content branch may have been rebased.
```
**Action**: Review if rebasing was intentional. If needed, promote a new SHA post-rebase.

## CI/CD Integration

- **PR preview deploys** (`deploy-pr-preview.yml`): Use `content` branch HEAD (no lock)
- **Staging deploys** (`deploy-staging.yml`): Use `content` branch HEAD (no lock)
- **Production deploys** (`deploy-production.yml`): Use locked SHA (requires approval PR)

## Related Documentation

- Content lifecycle: `context/workflows/content-lifecycle.md`
- Notion sync: `scripts/notion-workflow-guide.md`
- Rollback procedures: `context/workflows/ROLLBACK.md`
