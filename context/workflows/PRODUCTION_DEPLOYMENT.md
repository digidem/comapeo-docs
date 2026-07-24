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

1. **Open Actions** → "Deploy to Production"
2. Click **Run workflow**
3. Leave **Content SHA** blank to use current content branch HEAD, or paste a specific SHA
4. Click **Run workflow** → the workflow deploys the content and promotes `content-lock.sha` to `main` via an auto-merged PR (a direct push is no longer possible — `main` requires the `test` status check, which the promotion PR satisfies before merging)

### Option 2: CLI

```bash
# Trigger via GitHub CLI (uses current content HEAD)
gh workflow run deploy-production.yml

# Trigger with a specific SHA
gh workflow run deploy-production.yml -f content_sha=<sha>
```

`content-lock.sha` is promoted automatically as part of the deploy — but via a short-lived **auto-merged PR** (`content-lock-promotion` branch), not a direct push: `main` is protected by a ruleset that requires the `test` status check, which a direct push cannot satisfy. The PR runs `test`, then auto-merges (with `[skip ci]` so it doesn't re-trigger this deploy), so the lock lands a minute or so after the Cloudflare deploy completes rather than instantly.

## Deployment Flow

When `deploy-production.yml` runs:

1. **[`workflow_dispatch` only] Promote content lock SHA**:
   - Resolves SHA (from input or current `origin/content` HEAD)
   - Validates format and existence
   - If different from current lock: force-pushes the new `content-lock.sha` to a single `content-lock-promotion` branch (in a clean worktree off latest `main`) and opens/reuses an **auto-merged PR** for it. The PR runs `test` and auto-merges (squash, `[skip ci]` subject) once green. A direct push is not used — `main`'s required-`test` ruleset would reject it.

2. **Resolve locked SHA**:
   - Read `content-lock.sha` from `main` (just updated if `workflow_dispatch`)
   - Validate format and existence
   - Error if empty or invalid
   - Warning if not ancestor of current content branch (rebased case)

3. **Checkout locked content**:
   - `git checkout <locked-sha> -- docs/ i18n/ static/images/`
   - All existing validation (markdown count, image checks) unchanged

3. **Deploy with locked SHA**:
4. **Deploy**:
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
Remediation: re-trigger this workflow via workflow_dispatch to update the lock.
```
**Fix**: Re-trigger `deploy-production.yml` via `workflow_dispatch` — it will resolve and lock a new SHA

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
- **Generating the content that gets promoted here**: [`digidem/comapeo-content-pipeline`'s `DEPLOYMENT.md`](https://github.com/digidem/comapeo-content-pipeline/blob/main/DEPLOYMENT.md) — the full path from a Notion edit through to a `content_sha` ready for the CLI trigger above, including two footguns (an unanchored `assets/` `.gitignore` rule that silently drops per-section image folders, and `content` branch tip diverging from the locked live SHA).
