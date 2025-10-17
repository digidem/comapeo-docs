# Cloudflare Pages PR Preview Setup Guide

This document describes the manual Cloudflare Pages configuration required for PR preview deployments.

## Overview

PR preview deployments create unique staging environments for each pull request at:

- **Pattern**: `https://pr-{number}.comapeo-docs.pages.dev`
- **Example**: PR #42 → `https://pr-42.comapeo-docs.pages.dev`

## Prerequisites

- ✅ Cloudflare account with Pages enabled
- ✅ GitHub repository secrets configured:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- ✅ Wrangler dependency installed (already in `package.json`)

## Cloudflare Pages Configuration

### 1. Project Settings

Navigate to: **Cloudflare Dashboard → Pages → comapeo-docs → Settings**

#### Production Branch

- **Production branch**: `main`
- **Production URL**: `https://docs.comapeo.app`

#### Preview Branches

- **Enable branch deployments**: ✅ Enabled
- **Branch pattern**: `pr-*` (matches PR branches)
- **Custom domains**: Not required for preview branches

### 2. Build Configuration

Already configured via GitHub Actions workflows:

- Build command: `bun run build`
- Output directory: `build`
- Node version: 18+

### 3. Environment Variables

Set in Cloudflare Pages dashboard if needed:

- `NODE_VERSION`: `18` (or latest)
- `BUN_VERSION`: `latest`

### 4. DNS Configuration (Optional)

For custom preview domains (advanced):

If you want custom preview domains like `stg.docs.comapeo.app`:

1. **Add Custom Domain** in Cloudflare Pages:
   - Go to: Pages → comapeo-docs → Custom domains
   - Add: `stg.docs.comapeo.app`

2. **Modify DNS Record**:
   - Change CNAME value from: `comapeo-docs.pages.dev`
   - To: `pr-{number}.comapeo-docs.pages.dev`
   - Enable Cloudflare proxy (orange cloud)

**Note**: This requires manual DNS updates per PR and is NOT recommended. The default `*.pages.dev` URLs work automatically.

## GitHub Actions Integration

The workflows are already configured:

### deploy-pr-preview.yml

- **Triggers**: PR opened, synchronized, reopened
- **Branch naming**: `pr-{number}` (e.g., `pr-42`)
- **Deployment**: Uses `wrangler pages deploy` with branch flag
- **Comment**: Posts preview URL to PR

### cleanup-pr-preview.yml

- **Triggers**: PR closed
- **Action**: Comments on cleanup (Cloudflare auto-manages retention)

## Verification

To verify the setup works:

1. **Create a test PR**
2. **Check GitHub Actions**:
   - Go to: Actions → Deploy PR Preview
   - Verify workflow runs successfully
3. **Check PR comment**:
   - Bot should comment with preview URL
4. **Visit preview URL**:
   - `https://pr-{number}.comapeo-docs.pages.dev`
5. **Verify content**:
   - Docs should load from `content` branch
   - Images and i18n should work

## Troubleshooting

### Preview deployment fails

**Check**:

- Cloudflare API token has Pages permissions
- Account ID is correct
- Project name matches: `comapeo-docs`

**Debug**:

```bash
# Test wrangler locally
bunx wrangler pages deploy build --project-name comapeo-docs --branch test-branch
```

### Preview URL not working

**Check**:

- Branch name follows pattern: `pr-{number}`
- Cloudflare Pages branch deployments enabled
- DNS resolves correctly: `dig pr-42.comapeo-docs.pages.dev`

### Content missing

**Check**:

- `content` branch exists and has files
- Workflow checkout step succeeds
- Build logs show content validation passed

### Bot comment not appearing

**Check**:

- `GITHUB_TOKEN` permissions in workflow
- PR is from the main repository (not a fork)
- GitHub Actions bot has write permissions

## Cleanup Policy

Cloudflare Pages automatically manages deployment retention:

- **Active branches**: Kept indefinitely
- **Merged/closed PRs**: Retained for 30 days (configurable)
- **Manual deletion**: Via Cloudflare dashboard or API

## Security Notes

- ⚠️ **Fork PRs**: Previews are disabled for fork PRs (security)
- ✅ **Secrets**: Never exposed in preview deployments
- ✅ **Content**: Only production-safe content deployed

## References

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Branch Deployments](https://developers.cloudflare.com/pages/platform/branch-build-controls/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

## Support

For issues:

1. Check GitHub Actions logs
2. Check Cloudflare Pages deployment logs
3. Open issue in repository
