# GitHub Setup Guide

This guide covers setting up GitHub repository configuration, secrets, and workflows for the CoMapeo Documentation project.

## Prerequisites

Before setting up GitHub, ensure you have:

- A GitHub account with appropriate permissions
- Access to the `digidem/comapeo-docs` repository
- A Cloudflare account with Pages configured
- Notion API credentials
- (Optional) Slack webhook for deployment notifications

## Quick Start

### 1. Fork or Clone Repository

If you're setting up a new repository based on this project:

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/comapeo-docs.git
cd comapeo-docs

# Add upstream remote
git remote add upstream https://github.com/digidem/comapeo-docs.git
```

### 2. Configure GitHub Secrets

Navigate to **Settings → Secrets and variables → Actions** and add the following secrets:

#### Required Secrets

| Secret Name             | Description                               | How to Get                                        |
| ----------------------- | ----------------------------------------- | ------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token for Pages deployment | Cloudflare Dashboard → My Profile → API Tokens    |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID                     | Cloudflare Dashboard → Workers & Pages → Overview |
| `NOTION_API_KEY`        | Notion integration API key                | Notion → Integrations → Create integration        |
| `DATABASE_ID`           | Notion database ID                        | Notion database URL → extract ID                  |
| `DATA_SOURCE_ID`        | Notion data source ID                     | Notion API response or database properties        |

#### Optional Secrets

| Secret Name         | Description                | Purpose                  |
| ------------------- | -------------------------- | ------------------------ |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | Deployment notifications |

### 3. Verify GitHub Actions

After configuring secrets, verify workflows are enabled:

1. Go to **Actions** tab
2. Verify all workflows appear
3. Check that **Deploy to Production** workflow is active

## Detailed Setup Steps

### Step 1: GitHub Repository Configuration

#### Repository Settings

Configure essential repository settings:

```yaml
# General Settings
- Repository name: comapeo-docs
- Description: CoMapeo Documentation with Notion integration
- Visibility: Public

# Features
- Issues: Enabled (for bug tracking)
- Projects: Disabled (unless using GitHub Projects)
- Wiki: Disabled (docs are in the repo)
- Discussions: Optional

# Merge Settings
- Allow merge commits: Disabled
- Allow squashing: Enabled
- Allow rebase merging: Disabled
- Update branch: Enabled
```

#### Branch Protection Rules

Set up branch protection for `main`:

1. Navigate to **Settings → Branches**
2. Click **Add rule**
3. Branch name pattern: `main`
4. Enable:
   - Require a pull request before merging
   - Require approvals (1 approval)
   - Dismiss stale reviews
   - Require status checks to pass
   - Require branches to be up to date
   - Do not allow bypassing settings

### Step 2: Cloudflare Configuration

#### Create Cloudflare Pages Project

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click **Create application**
4. Select **Pages** tab
5. Click **Connect to Git**
6. Authorize GitHub if needed
7. Select `comapeo-docs` repository
8. Configure build settings:

```yaml
Project name: comapeo-docs
Production branch: main
Build command: bun run build
Build output directory: build
```

9. Click **Save and Deploy**

#### Get Cloudflare Credentials

**API Token:**

1. Go to **My Profile → API Tokens**
2. Click **Create Token**
3. Use **Edit Cloudflare Workers** template
4. Configure permissions:
   - Account → Cloudflare Pages → Edit
5. Set **Account Resources** to your account
6. Click **Continue** and create token
7. Copy and save the token

**Account ID:**

1. Go to **Workers & Pages**
2. Click on your Pages project
3. Copy **Account ID** from the right sidebar

### Step 3: Notion Configuration

#### Create Notion Integration

1. Go to [Notion My Integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Configure integration:
   - Name: `comapeo-docs-api`
   - Associated workspace: Select your workspace
   - Type: Internal
4. Click **Submit**
5. Copy the **Internal Integration Token** (this is your `NOTION_API_KEY`)

#### Share Database with Integration

1. Open your Notion documentation database
2. Click **...** (more) in the top-right
3. Select **Add connections**
4. Find and select your `comapeo-docs-api` integration
5. Click **Confirm**

#### Get Database IDs

**Database ID:**

1. Open your Notion database
2. Copy the URL
3. Extract the 32-character ID from the URL:
   ```
   https://www.notion.so/username/[DATABASE_ID]?v=...
                         ^^^^^^^^^^^^^^^^^^^^
   ```

**Data Source ID:**

1. Query your Notion database using the API:
   ```bash
   curl -X POST https://api.notion.com/v1/databases/DATABASE_ID/query \
     -H "Authorization: Bearer NOTION_API_KEY" \
     -H "Notion-Version: 2022-06-28"
   ```
2. Look for `data_source_id` in the response

### Step 4: GitHub Secrets Configuration

#### Adding Secrets via GitHub UI

1. Go to repository **Settings**
2. Navigate to **Secrets and variables → Actions**
3. Click **New repository secret**
4. Add each secret from the tables below

#### Adding Secrets via GitHub CLI

```bash
# Install GitHub CLI if needed
# https://cli.github.com/

# Authenticate
gh auth login

# Add secrets
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set NOTION_API_KEY
gh secret set DATABASE_ID
gh secret set DATA_SOURCE_ID

# Optional
gh secret set SLACK_WEBHOOK_URL
```

#### Secret Validation

Verify all secrets are set:

```bash
# List all secrets (names only)
gh secret list

# Expected output:
# CLOUDFLARE_ACCOUNT_ID
# CLOUDFLARE_API_TOKEN
# DATA_SOURCE_ID
# DATABASE_ID
# NOTION_API_KEY
# SLACK_WEBHOOK_URL (optional)
```

### Step 5: GitHub Actions Configuration

#### Enable Workflows

Workflows are stored in `.github/workflows/`:

- `deploy-production.yml` - Production deployment to Cloudflare Pages
- `pr-preview.yml` - PR preview deployments

#### Workflow Permissions

Ensure workflows have necessary permissions:

1. Go to **Settings → Actions → General**
2. Under **Workflow permissions**, select:
   - Read and write permissions
3. Allow GitHub Actions to create and approve pull requests

#### Manual Deployment Trigger

To trigger a deployment manually:

1. Go to **Actions** tab
2. Select **Deploy to Production** workflow
3. Click **Run workflow**
4. Select branch: `main`
5. Select environment: `production` or `test`
6. Click **Run workflow**

### Step 6: Slack Notifications (Optional)

#### Create Slack App

1. Go to [Slack API](https://api.slack.com/apps)
2. Click **Create New App**
3. Select **From scratch**
4. Name: `comapeo-docs-deploy`
5. Select workspace
6. Click **Create App**

#### Enable Incoming Webhooks

1. Navigate to **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks**
3. Click **Add New Webhook to Workspace**
4. Select channel for notifications
5. Copy the webhook URL
6. Add as `SLACK_WEBHOOK_URL` secret

#### Test Notification

```bash
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test notification from GitHub Setup"}'
```

## GitHub Actions Workflows

### Deploy to Production

**Trigger:**

- Push to `main` branch (excluding `.md` files and `docs/` directory)
- Manual workflow dispatch
- Repository webhook event

**Process:**

1. Fetches content from `content` branch
2. Validates content exists
3. Installs dependencies with Bun
4. Builds documentation
5. Deploys to Cloudflare Pages
6. Updates Notion status to `Published`
7. Sends Slack notification

**Outputs:**

- Production URL: `https://docs.comapeo.app`
- Deployment summary in GitHub Actions
- Slack notification (if configured)

### PR Preview Deployments

**Trigger:**

- Pull request opened/updated
- Push to PR branch

**Process:**

1. Builds documentation
2. Deploys to Cloudflare Pages preview
3. Comments on PR with preview URL

**Smart Content Strategy:**

- Uses cached content from `content` branch for frontend-only changes
- Regenerates 5 pages when Notion fetch scripts are modified
- PR labels can override: `fetch-10-pages`, `fetch-all-pages`

**Preview URL:**

```
https://pr-{number}.comapeo-docs.pages.dev
```

## Environment Configuration

### Production Environment

The production deployment automatically:

- Sets `IS_PRODUCTION=true`
- Enables search engine indexing
- Updates Notion status
- Deploys to production URL

### Test Environment

For testing deployments:

1. Use **Run workflow** → select `test` environment
2. Provide branch name (default: `test`)
3. Sets `IS_PRODUCTION=false`

- Adds `noindex` meta tag
- Skips Notion status update
- Deploys to preview URL

## Troubleshooting

### Workflow Fails Immediately

```bash
# Check workflow permissions
gh repo view --json actionsPermissions

# Verify secrets are set
gh secret list

# Check recent workflow runs
gh run list --limit 10
```

### Cloudflare Deployment Fails

**Issue:** Authentication error

```bash
# Verify Cloudflare credentials
# Check API token permissions
# Validate account ID matches your account
```

**Issue:** Build fails

```bash
# Run build locally to test
bun run build

# Check build output directory exists
ls -la build/

# Verify build configuration in docusaurus.config.ts
```

### Notion API Errors

**Issue:** Unauthorized

```bash
# Verify NOTION_API_KEY format
# Should start with "secret_"

# Test Notion connection
curl -X POST https://api.notion.com/v1/users/me \
  -H "Authorization: Bearer NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28"
```

**Issue:** Database not found

```bash
# Verify DATABASE_ID format
# Should be 32-character hexadecimal string

# Test database access
curl -X POST https://api.notion.com/v1/databases/DATABASE_ID/query \
  -H "Authorization: Bearer NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28"
```

### Content Validation Errors

**Issue:** No content found

```bash
# Verify content branch exists
git ls-remote --heads origin content

# Check for content files
find docs/ -name "*.md" -o -name "*.mdx"
find i18n/ -name "*.md" -o -name "*.mdx"
```

### Slack Notifications Not Working

```bash
# Test webhook URL
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test notification"}'

# Verify workflow has permission to access secret
gh secret set SLACK_WEBHOOK_URL
```

## Security Best Practices

1. **Never Commit Secrets**: Always use GitHub Secrets for sensitive data
2. **Rotate Keys Regularly**: Update API tokens and secrets periodically
3. **Use Least Privilege**: Grant minimum required permissions
4. **Enable Branch Protection**: Require PR reviews for main branch
5. **Monitor Workflow Runs**: Regularly review Actions logs
6. **Audit Access**: Review who has repository access
7. **Use Environment Protection**: Require approval for production deployments

## Production Checklist

- [ ] Repository settings configured
- [ ] Branch protection rules enabled
- [ ] Cloudflare Pages project created
- [ ] Cloudflare API token configured
- [ ] Cloudflare account ID added
- [ ] Notion integration created
- [ ] Notion database shared with integration
- [ ] Notion API key configured
- [ ] Database ID configured
- [ ] Data source ID configured
- [ ] GitHub Actions enabled
- [ ] Workflow permissions configured
- [ ] Slack webhook configured (optional)
- [ ] Manual deployment tested
- [ ] PR preview deployment tested
- [ ] Production deployment tested

## Additional Resources

- VPS Deployment Guide
- API Reference
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Notion API Documentation](https://developers.notion.com/)
