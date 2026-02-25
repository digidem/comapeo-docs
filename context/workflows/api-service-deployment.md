# API Service Deployment Runbook

This runbook guides first-time operators through deploying the CoMapeo Documentation API server to a VPS.

## Deployment Overview

The deployment process involves:

1. **Preparation**: Gather required files and credentials
2. **VPS Setup**: Install Docker and configure the server
3. **Deployment**: Deploy the API service using Docker Compose
4. **Validation**: Verify the deployment is working
5. **GitHub Integration**: (Optional) Connect to GitHub Actions

**Estimated Time**: 30-45 minutes for first-time deployment

## Part 1: Preparation (Local Machine)

### Step 1.1: Clone Repository

Clone this repository to your local machine:

```bash
git clone https://github.com/digidem/comapeo-docs.git
cd comapeo-docs
```

**Verify**: You should see `Dockerfile` and `docker-compose.yml` in the root directory.

### Step 1.2: Generate API Keys

Generate secure API keys for authentication:

```bash
# Generate GitHub Actions key
openssl rand -base64 32 | tee github_actions_key.txt

# Generate deployment key
openssl rand -base64 32 | tee deployment_key.txt

# Generate Notion trigger endpoint key (x-api-key for POST /notion-trigger)
openssl rand -base64 32 | tee notion_trigger_key.txt
```

**Save these values** - you'll need them in the next step.

### Step 1.3: Gather Required Secrets

Collect the following values from your service providers:

| Secret           | Where to Get It     | Format                  |
| ---------------- | ------------------- | ----------------------- |
| `NOTION_API_KEY` | Notion Integration  | Starts with `secret_`   |
| `DATABASE_ID`    | Notion Database URL | 32-character hex string |
| `DATA_SOURCE_ID` | Notion Data Source  | UUID format             |
| `OPENAI_API_KEY` | OpenAI Platform     | Starts with `sk-`       |

**Reference**: See [Notion Setup Guide](../database/overview.md) for help finding these values.

### Step 1.4: Create Environment File

Create a `.env.production` file in the repository root:

```bash
cat > .env.production << 'EOF'
# API Configuration
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001

# Notion Configuration (Required)
NOTION_API_KEY=your_notion_api_key
DATABASE_ID=your_database_id
DATA_SOURCE_ID=your_data_source_id

# OpenAI Configuration (Required)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Documentation Configuration
DEFAULT_DOCS_PAGE=introduction

# API Authentication (Required)
API_KEY_GITHUB_ACTIONS=paste_github_actions_key_here
API_KEY_DEPLOYMENT=paste_deployment_key_here

# Notion trigger endpoint authentication (Required for POST /notion-trigger)
NOTION_TRIGGER_API_KEY=paste_notion_trigger_key_here
EOF
```

**Edit the file** and replace the placeholder values with your actual secrets.

**Verify**: Run `cat .env.production` to confirm all values are set.

## Part 2: VPS Setup

### Step 2.1: Access Your VPS

SSH into your VPS:

```bash
ssh user@your-vps-ip
```

**Requirements**:

- VPS with at least 512MB RAM and 1 CPU core
- Ubuntu 20.04+ or Debian 11+ recommended
- Root or sudo access

### Step 2.2: Install Docker

Install Docker and Docker Compose:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker
```

**Verify**: Run `docker --version` and `docker compose version` to confirm installation.

### Step 2.3: Create Deployment Directory

```bash
# Create directory
sudo mkdir -p /opt/comapeo-api
sudo chown $USER:$USER /opt/comapeo-api
cd /opt/comapeo-api
```

**Verify**: Run `pwd` - you should be in `/opt/comapeo-api`.

### Step 2.4: Configure Firewall

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow API port
sudo ufw allow 3001/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

**Verify**: You should see `Status: active` with rules for ports 22 and 3001.

## Part 3: Deployment

### Step 3.1: Choose Deployment Mode

Choose one of two deployment modes:

**Option A: Standalone Deployment** (Recommended for first-time users)

- Creates a dedicated docker-compose stack for the API service
- Simpler setup and management
- Ideal for dedicated VPS or isolated service

**Option B: Existing Stack Integration** (For production environments)

- Adds API service to an existing docker-compose.yml
- Shared networking and resources with other services
- Ideal when deploying alongside other containers (e.g., web server, database)

### Step 3.2A: Standalone Deployment

From your **local machine**, upload the required files:

```bash
# Upload deployment files
scp Dockerfile docker-compose.yml .env.production user@your-vps-ip:/opt/comapeo-api/
```

**Verify**: SSH into your VPS and run `ls -la /opt/comapeo-api` - you should see all three files.

Then proceed to **Step 3.3: Build and Start the Service**.

### Step 3.2B: Existing Stack Integration

If you already have a docker-compose stack running and want to add the API service to it:

#### 3.2B.1: Copy Service Definition

Copy the `api` service from the provided `docker-compose.yml` and add it to your existing `docker-compose.yml` file:

```yaml
# Add this service to your existing docker-compose.yml
services:
  # ... your existing services ...

  api:
    build:
      context: ./path/to/comapeo-docs # Adjust path as needed
      dockerfile: Dockerfile
      target: runner
      args:
        BUN_VERSION: "1"
        NODE_ENV: "production"
    image: comapeo-docs-api:latest
    container_name: comapeo-api-server
    ports:
      - "3001:3001" # Or use "127.0.0.1:3001:3001" to restrict to localhost
    environment:
      NODE_ENV: production
      API_HOST: 0.0.0.0
      API_PORT: 3001
      NOTION_API_KEY: ${NOTION_API_KEY}
      DATABASE_ID: ${DATABASE_ID}
      DATA_SOURCE_ID: ${DATA_SOURCE_ID}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_MODEL: gpt-4o-mini
      DEFAULT_DOCS_PAGE: introduction
      # Add your API authentication keys:
      # API_KEY_GITHUB_ACTIONS: ${API_KEY_GITHUB_ACTIONS}
      # API_KEY_DEPLOYMENT: ${API_KEY_DEPLOYMENT}
    volumes:
      - comapeo-job-data:/tmp
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "bun",
          "--silent",
          "-e",
          "fetch('http://localhost:3001/health').then(r => r.ok ? 0 : 1)",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
    networks:
      - your-existing-network # Use your existing network

# Add this volume to your existing volumes section
volumes:
  # ... your existing volumes ...
  comapeo-job-data:
    driver: local

# The service should use your existing network
networks:
  your-existing-network:
    external: true # If using an external network
    # OR remove 'external: true' and define the network here
```

#### 3.2B.2: Copy Dockerfile

Copy the `Dockerfile` to a location accessible by your docker-compose build context:

```bash
# On your VPS, assuming your project is in /opt/my-project
mkdir -p /opt/my-project/comapeo-api
cp Dockerfile /opt/my-project/comapeo-api/
```

#### 3.2B.3: Configure Network Integration

**Shared Networking**: The API service will be accessible to other services in your stack via its service name:

```bash
# Other containers can reach the API at:
# http://api:3001/health
# http://api:3001/docs/introduction
```

**External Access with Nginx**: If you have Nginx in your stack, add a location block:

```nginx
# In your Nginx configuration
location /api/ {
    proxy_pass http://api:3001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

#### 3.2B.4: Update Environment File

Add the API service environment variables to your existing `.env` file:

```bash
# Add to your existing .env file
cat >> .env << 'EOF'

# Comapeo API Service
NOTION_API_KEY=your_notion_api_key
DATABASE_ID=your_database_id
DATA_SOURCE_ID=your_data_source_id
OPENAI_API_KEY=your_openai_api_key
API_KEY_GITHUB_ACTIONS=your_github_actions_key
API_KEY_DEPLOYMENT=your_deployment_key
EOF
```

### Step 3.3: Build and Start the Service

**For Standalone Deployment**:

```bash
# In /opt/comapeo-api on your VPS
docker compose --env-file .env.production up -d --build
```

**For Existing Stack Integration**:

```bash
# In your existing project directory on your VPS
docker compose --env-file .env up -d --build api
```

**Check container status**:

```bash
# Standalone
docker compose --env-file .env.production ps

# Existing stack
docker compose --env-file .env ps api
```

**Expected Output**: The `api` service should show as "Up" with a healthy status.

### Step 3.2: Build and Start the Service

On your **VPS**, in `/opt/comapeo-api`:

```bash
# Build and start the container
docker compose --env-file .env.production up -d --build

# Check container status
docker compose --env-file .env.production ps
```

**Expected Output**: The `api` service should show as "Up" with a healthy status.

### Step 3.4: Verify Deployment

```bash
# Test health endpoint
curl -fsS http://localhost:3001/health
```

**Expected Response**:

```json
{
  "status": "ok",
  "timestamp": "2025-02-06T12:00:00.000Z",
  "uptime": 123.456,
  "auth": {
    "enabled": true,
    "keysConfigured": 2
  }
}
```

**If this fails**, check logs:

```bash
# Standalone
docker compose --env-file .env.production logs --tail=50 api

# Existing stack
docker compose --env-file .env logs --tail=50 api
```

## Part 4: Optional Enhancements

### Step 4.1: Set Up Reverse Proxy (Optional)

For production use, set up Nginx as a reverse proxy with HTTPS:

```bash
# Install Nginx
sudo apt install nginx -y

# Create configuration
sudo tee /etc/nginx/sites-available/comapeo-api > /dev/null << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/comapeo-api /etc/nginx/sites-enabled/

# Test and restart
sudo nginx -t
sudo systemctl restart nginx
```

### Step 4.2: Configure SSL/TLS (Optional)

Use Certbot for free SSL certificates:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot --nginx -d your-domain.com
```

## Part 5: GitHub Integration (Optional)

### Step 5.1: Add GitHub Secrets

Navigate to your repository on GitHub and add these secrets:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secrets:

#### Core Secrets (Required for Most Workflows)

| Secret Name      | Value               | Used By Workflows            |
| ---------------- | ------------------- | ---------------------------- |
| `NOTION_API_KEY` | Your Notion API key | All Notion-related workflows |
| `DATABASE_ID`    | Your database ID    | All Notion-related workflows |
| `DATA_SOURCE_ID` | Your data source ID | All Notion-related workflows |

#### API Service Secrets (Required for API validation/runtime calls)

| Secret Name              | Value                               | Used By Workflows/Callers               |
| ------------------------ | ----------------------------------- | --------------------------------------- |
| `API_KEY_GITHUB_ACTIONS` | Value from Step 1.2                 | API Validate workflow, API job callers  |
| `API_ENDPOINT`           | `https://your-api-host.example.com` | Manual VPS smoke commands and operators |
| `NOTION_TRIGGER_API_KEY` | Value from Step 1.2                 | `POST /notion-trigger` (`x-api-key`)    |

**Note:** `API_ENDPOINT` is used by manual smoke checks and operator calls against the deployed API service. The CI `API Validate` workflow runs the API locally and does not require `API_ENDPOINT`.

#### Translation Secrets (Required for Translation Workflows)

| Secret Name      | Value               | Used By Workflows       |
| ---------------- | ------------------- | ----------------------- |
| `OPENAI_API_KEY` | Your OpenAI API key | Translate, API Validate |
| `OPENAI_MODEL`   | OpenAI model name   | Translate (optional)    |

**Default for `OPENAI_MODEL`:** `gpt-4o-mini`

#### Cloudflare Pages Secrets (Required for Deployments)

| Secret Name             | Value                      | Used By Workflows                    |
| ----------------------- | -------------------------- | ------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Your Cloudflare API token  | Deploy PR Preview, Deploy Production |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Deploy PR Preview, Deploy Production |

**Note:** Without `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, PR preview deployments and production deployments to Cloudflare Pages will not work.

#### Fly Deployment Secrets (Required for API auto-deploy workflow)

| Secret Name     | Value                                                 | Used By Workflows         |
| --------------- | ----------------------------------------------------- | ------------------------- |
| `FLY_API_TOKEN` | Fly API token                                         | Deploy API service to Fly |
| `FLY_APP_NAME`  | Fly app name (for example `comapeo-docs-api-trigger`) | Deploy API service to Fly |

**Runtime environment secrets (Fly app):**

The workflow syncs these runtime values to the Fly app before each deploy:
`NOTION_API_KEY`, `DATABASE_ID`/`DATA_SOURCE_ID`, `GITHUB_REPO_URL`, `GITHUB_TOKEN`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `NOTION_TRIGGER_API_KEY`, `API_KEY_GITHUB_ACTIONS`, and `DEFAULT_DOCS_PAGE` (fallback `introduction`).

Example:

```bash
flyctl secrets set \
  NOTION_API_KEY=... \
  DATABASE_ID=... \
  DATA_SOURCE_ID=... \
  GITHUB_REPO_URL=... \
  GITHUB_TOKEN=... \
  GIT_AUTHOR_NAME=... \
  GIT_AUTHOR_EMAIL=... \
  API_KEY_GITHUB_ACTIONS=... \
  NOTION_TRIGGER_API_KEY=... \
  DEFAULT_DOCS_PAGE=introduction \
  --app comapeo-docs-api-trigger
```

#### Docker Hub Secrets (Required for Docker Publish Workflow)

| Secret Name          | Value                    | Used By Workflows |
| -------------------- | ------------------------ | ----------------- |
| `DOCKERHUB_USERNAME` | Your Docker Hub username | Docker Publish    |
| `DOCKERHUB_TOKEN`    | Docker Hub access token  | Docker Publish    |

**Note:** Use a Docker Hub access token (not your Docker Hub password) with repository write permissions.

#### Notification Secrets (Optional)

| Secret Name         | Value                  | Used By Workflows                                 |
| ------------------- | ---------------------- | ------------------------------------------------- |
| `SLACK_WEBHOOK_URL` | Your Slack webhook URL | All workflows (sends notifications on completion) |

**Note:** If omitted, workflows will skip Slack notifications (non-critical).

#### Configuration Secrets (Optional)

| Secret Name         | Value                         | Used By Workflows | Default        |
| ------------------- | ----------------------------- | ----------------- | -------------- |
| `DEFAULT_DOCS_PAGE` | Default documentation page    | API workflows     | `introduction` |
| `OPENAI_MODEL`      | OpenAI model for translations | Translate         | `gpt-4o-mini`  |

### Quick Reference: Secret Requirements by Workflow

| Workflow                  | Required Secrets                                                                                                                                                                                                         | Optional Secrets                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| API Validate              | `API_KEY_GITHUB_ACTIONS`, `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`, `OPENAI_API_KEY`                                                                                                                            | None                                                                 |
| Deploy API Service to Fly | `FLY_API_TOKEN`, `FLY_APP_NAME`, `NOTION_API_KEY`, `GITHUB_REPO_URL`, `GITHUB_TOKEN`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `NOTION_TRIGGER_API_KEY`, `API_KEY_GITHUB_ACTIONS`, and (`DATABASE_ID` or `DATA_SOURCE_ID`) | `DEFAULT_DOCS_PAGE`                                                  |
| Sync Notion Docs          | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`                                                                                                                                                                        | `SLACK_WEBHOOK_URL`                                                  |
| Translate Notion Docs     | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`, `OPENAI_API_KEY`                                                                                                                                                      | `OPENAI_MODEL`, `SLACK_WEBHOOK_URL`                                  |
| Docker Publish            | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`                                                                                                                                                                                  | `SLACK_WEBHOOK_URL`                                                  |
| Deploy PR Preview         | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`                                                                                                                                                                        | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SLACK_WEBHOOK_URL` |
| Deploy to Production      | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`                                                                                                                                                                        | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SLACK_WEBHOOK_URL` |
| Deploy to GitHub Pages    | None (uses GitHub Pages infrastructure)                                                                                                                                                                                  | `SLACK_WEBHOOK_URL`                                                  |

### Step 5.2: Available GitHub Workflows

This repository includes several GitHub Actions workflows for different purposes. Workflows have different trigger types:

- **Manual (workflow_dispatch)**: Run manually from Actions tab with custom inputs
- **Automatic (push/pull_request)**: Triggered by Git events
- **Scheduled (cron)**: Runs on a schedule (e.g., daily at 2 AM UTC)
- **Repository Dispatch**: Triggered via GitHub API or other workflows

#### 1. API Validate (`.github/workflows/api-validate.yml`)

Runs an ephemeral local API process in CI and validates the fetch API contract (`401` envelope, lock behavior, polling, and dry-run terminal shape). This workflow does not act as production runtime orchestration.

**Triggers:**

- Manual: Run from Actions tab
- Automatic: On changes to `.github/workflows/api-validate.yml`

**What It Validates:**

- `POST /jobs` without API key returns `401` with the pre-job envelope.
- Deterministic lock behavior using `CI_FETCH_HOLD_MS=3000`: first request returns `202`, immediate second request returns `409`.
- Poll cycle reaches a terminal state for the accepted dry-run job.
- Terminal dry-run response contains `status`, numeric `pagesProcessed`, `dryRun: true`, and `commitHash: null`.

**Required Secrets:**

- `API_KEY_GITHUB_ACTIONS`
- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`
- `OPENAI_API_KEY`

#### 2. API-native Fetch Jobs (deployed service runtime)

Runtime fetch orchestration now lives in the deployed API service (`POST /jobs` with `type: "fetch-ready"` or `type: "fetch-all"`).

**Job Types:**

- `fetch-ready`: fetches pages with status `Ready to publish` and transitions eligible pages to `Draft published` after push safety checks.
- `fetch-all`: full sync of all pages except `Remove`, including stale generated content deletion, with no Notion status transitions.

**Required guarantees:**

- **Branch safety:** every mutating run syncs `content <- main` before pushing generated content.
- **Status safety (`fetch-ready`):** status transitions occur only after confirming the pushed/no-op state is reflected on `origin/content`.
- **Concurrency guard:** a single in-memory lock rejects concurrent fetch jobs with `409`.

**Known limitation:**

- `fetch-ready` is incremental and does not prune stale generated artifacts. Use `fetch-all` for periodic full cleanup.

**Operational precondition:**

- Treat `origin/content` as single-writer owned by the API service account. Out-of-band pushes during a job are out of contract.

#### 3. Sync Notion Docs (`.github/workflows/sync-docs.yml`)

Syncs Notion content to the `content` branch for use in deployments.

**Triggers:** Manual only

**How to Run:**

1. Go to **Actions** tab in your repository
2. Select **Sync Notion Docs** workflow
3. Click **Run workflow**
4. Choose a branch
5. Click **Run workflow**

**Required Secrets:**

- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`

**Optional Secrets:**

- `SLACK_WEBHOOK_URL` - For Slack notifications

#### 4. Translate Notion Docs (`.github/workflows/translate-docs.yml`)

Translates content to multiple languages and updates Notion status.

**Triggers:** Manual only

**How to Run:**

1. Go to **Actions** tab in your repository
2. Select **Translate Notion Docs** workflow
3. Click **Run workflow**
4. Choose a branch
5. Click **Run workflow**

**Required Secrets:**

- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`
- `OPENAI_API_KEY`

**Optional Secrets:**

- `OPENAI_MODEL` - Model for translations (default: `gpt-4o-mini`)
- `SLACK_WEBHOOK_URL` - For Slack notifications

#### 5. Deploy PR Preview (`.github/workflows/deploy-pr-preview.yml`)

Automatically deploys PR previews to Cloudflare Pages when PRs are opened or updated.

**Triggers:** Automatic on PR events (opened, synchronized, reopened, labeled, unlabeled)

**Note:** Only works for PRs from the main repository (not forks) due to secret access requirements.

**PR Labels for Content Generation:**

Add labels to control how many Notion pages to fetch:

- `fetch-all-pages` - Fetch all pages from Notion (~8min)
- `fetch-10-pages` - Fetch 10 pages from Notion (~2min)
- `fetch-5-pages` - Fetch 5 pages from Notion (~90s)
- (no label) - Uses content branch or defaults to 5 pages if content branch is empty

**Content Strategy:**

- If Notion fetch scripts were modified → Always regenerates content
- If labels are present → Forces regeneration regardless of script changes
- If neither → Uses content from `content` branch (fast, ~30s)

**Preview URL:** `https://pr-{number}.comapeo-docs.pages.dev`

**Required Secrets:**

- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`

**Optional Secrets:**

- `CLOUDFLARE_API_TOKEN` - Required for Cloudflare Pages deployment
- `CLOUDFLARE_ACCOUNT_ID` - Required for Cloudflare Pages deployment
- `SLACK_WEBHOOK_URL` - For Slack notifications

#### 6. Docker Publish (`.github/workflows/docker-publish.yml`)

Builds a multi-platform API image and publishes it to Docker Hub.

**Triggers:**

- Automatic on pushes to `main` when Docker build inputs change
- Automatic on PRs targeting `main` when Docker build inputs change
- Manual via **Run workflow** (`workflow_dispatch`)

**Tag Behavior:**

- `main` pushes publish `latest` and a SHA tag
- PRs publish `pr-{number}` (for example, PR #126 publishes `pr-126`)
- Fork PRs build without push to avoid secret exposure

**Required Secrets:**

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

**Path Filters (must change to trigger automatically):**

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.yaml`
- `.dockerignore`
- `package.json`
- `bun.lockb*`
- `scripts/**`
- `tsconfig.json`
- `docusaurus.config.ts`
- `src/client/**`

#### 7. Deploy to Production (`.github/workflows/deploy-production.yml`)

Deploys documentation to production on Cloudflare Pages.

**Triggers:**

- Manual: Run from Actions tab with environment selection
- Automatic: On push to `main` branch (excluding docs-only changes)
- Repository Dispatch: Via GitHub API event `deploy-production`

**Environment:** Uses GitHub `production` environment (requires environment protection rules and approval)

**How to Run:**

1. Go to **Actions** tab in your repository
2. Select **Deploy to Production** workflow
3. Click **Run workflow**
4. Choose `environment` (production or test)
5. For test deployments, optionally specify a `branch_name`
6. Click **Run workflow**

**Required Secrets:**

- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`

**Optional Secrets:**

- `CLOUDFLARE_API_TOKEN` - Required for Cloudflare Pages deployment
- `CLOUDFLARE_ACCOUNT_ID` - Required for Cloudflare Pages deployment
- `SLACK_WEBHOOK_URL` - For Slack notifications

**Deployment URLs:**

- Production: `https://docs.comapeo.app`
- Test: `https://{branch_name}.comapeo-docs.pages.dev`

#### 8. Deploy to GitHub Pages (`.github/workflows/deploy-staging.yml`)

Deploys documentation to GitHub Pages (staging environment).

**Triggers:** Automatic on push to `main` branch

**Staging URL:** Available via GitHub Pages settings

#### 9. Deploy API Service to Fly (automatic on `main`)

Deploys the API service to Fly whenever code is pushed to `main`.

**Triggers:**

- Automatic on every push to `main`
- Manual via **Run workflow** (`workflow_dispatch`)

**Required Secrets:**

- `FLY_API_TOKEN`
- `FLY_APP_NAME` (or the equivalent app-name input/secret used by the workflow)

**Manual Trigger (workflow_dispatch):**

1. Go to **Actions** tab in your repository
2. Select the Fly API deploy workflow
3. Click **Run workflow**
4. Choose `main` (or the branch allowed by that workflow) and run

**Verification (concise):**

1. Confirm the Fly deploy workflow run is green in GitHub Actions
2. Confirm release in Fly (`flyctl releases --app "$FLY_APP_NAME"`)
3. Smoke test the API: `curl -fsS https://<your-fly-host>/health`

**Troubleshooting (concise):**

- `403`/auth errors in GitHub Actions: invalid or missing `FLY_API_TOKEN`
- App lookup/deploy target errors: invalid `FLY_APP_NAME` or mismatched app/org
- Runtime boot failures after successful deploy: missing runtime secrets in Fly (`flyctl secrets list --app "$FLY_APP_NAME"`)

### Step 5.3: Validate CI + Run VPS Smoke

After adding secrets, validate CI contract checks and then smoke test the deployed service:

1. Go to **Actions** tab in your repository
2. Select **API Validate** workflow
3. Click **Run workflow** and execute on your target branch
4. Confirm the workflow passes all smoke assertions (`401`, `202 -> 409`, and terminal dry-run poll)

Then run a direct smoke test against the deployed API endpoint:

```bash
export API_ENDPOINT="https://your-api-host.example.com"
export API_KEY_GITHUB_ACTIONS="your-api-key"
export NOTION_TRIGGER_API_KEY="your-notion-trigger-key"

# fetch-ready dry run
curl -X POST "${API_ENDPOINT}/jobs" \
  -H "Authorization: Bearer ${API_KEY_GITHUB_ACTIONS}" \
  -H "Content-Type: application/json" \
  -d '{"type":"fetch-ready","options":{"dryRun":true,"maxPages":1}}'

# fetch-all dry run
curl -X POST "${API_ENDPOINT}/jobs" \
  -H "Authorization: Bearer ${API_KEY_GITHUB_ACTIONS}" \
  -H "Content-Type: application/json" \
  -d '{"type":"fetch-all","options":{"dryRun":true,"maxPages":1}}'

# trigger fetch-ready from Notion button/webhook path
curl -X POST "${API_ENDPOINT}/notion-trigger" \
  -H "x-api-key: ${NOTION_TRIGGER_API_KEY}"
```

**Verify**: both requests return `202`, each terminal result includes `dryRun: true` and `commitHash: null`, and no unexpected `UNKNOWN` failures appear.

### Step 5.4: Verify Workflow Secrets

To verify that all required secrets are properly configured:

1. Check the workflow logs for authentication errors
2. Verify the API health endpoint responds correctly
3. Confirm that Notion API calls succeed
4. Check GitHub status checks on commits

**Common Issues:**

- Missing `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` will cause deployment failures
- Missing or invalid `FLY_API_TOKEN` causes Fly workflow auth failures
- Missing or incorrect `FLY_APP_NAME` causes Fly app target/deploy failures
- Missing runtime secrets in Fly causes API startup/runtime failures after deploy
- Missing `SLACK_WEBHOOK_URL` will cause notification failures (non-critical)
- Invalid `API_KEY_GITHUB_ACTIONS` returns `401` on `POST /jobs`
- Missing/invalid Notion credentials causes dry-run fetch jobs to fail before terminal assertions

## Validation Checklist

After completing deployment, verify:

- [ ] Container is running: `docker ps` shows `comapeo-api-server`
- [ ] Health check passes: `curl http://localhost:3001/health` returns `{"status":"ok"}`
- [ ] Logs show no errors: `docker compose logs api`
- [ ] Firewall allows port 3001: `sudo ufw status`
- [ ] (Optional) Nginx proxy works: `curl https://your-domain.com/health`
- [ ] `API Validate` workflow completes successfully
- [ ] VPS dry-run smoke (`fetch-ready` and `fetch-all`) returns terminal `dryRun: true` and `commitHash: null`
- [ ] (Optional) All required GitHub secrets are configured:
  - [ ] `API_KEY_GITHUB_ACTIONS`
  - [ ] `NOTION_API_KEY`
  - [ ] `DATABASE_ID`
  - [ ] `DATA_SOURCE_ID`
  - [ ] `OPENAI_API_KEY`
  - [ ] `CLOUDFLARE_API_TOKEN` (for Cloudflare Pages deployments)
  - [ ] `CLOUDFLARE_ACCOUNT_ID` (for Cloudflare Pages deployments)
  - [ ] `FLY_API_TOKEN` (for Fly API deployments)
  - [ ] `FLY_APP_NAME` (for Fly API deployments)
  - [ ] API runtime secrets mirrored to Fly (`NOTION_API_KEY`, `DATABASE_ID`/`DATA_SOURCE_ID`, `GITHUB_REPO_URL`, `GITHUB_TOKEN`, `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `API_KEY_GITHUB_ACTIONS`, `NOTION_TRIGGER_API_KEY`, `DEFAULT_DOCS_PAGE`)
  - [ ] `SLACK_WEBHOOK_URL` (for Slack notifications)

## Troubleshooting

### Container Won't Start

**Symptoms**: `docker ps` shows the container exited

**Diagnosis**:

```bash
# Check logs
docker compose --env-file .env.production logs api

# Check environment
docker compose --env-file .env.production config
```

**Common Causes**:

- Missing required environment variables
- Invalid API keys
- Port conflicts (another service using port 3001)

### Health Check Failing

**Symptoms**: Container runs but `/health` returns errors

**Diagnosis**:

```bash
# Manual health check
curl -v http://localhost:3001/health

# Check container health
docker inspect comapeo-api-server | grep -A 10 Health
```

**Common Causes**:

- API not fully started yet (wait 30 seconds)
- Missing NOTION_API_KEY or DATABASE_ID
- Insufficient memory (increase `DOCKER_MEMORY_LIMIT`)

### Permission Issues

**Symptoms**: `Permission denied` errors

**Solution**:

```bash
# Fix file ownership
sudo chown -R $USER:$USER /opt/comapeo-api

# Check Docker group membership
groups $USER  # Should include 'docker'

# Add user to docker group if needed
sudo usermod -aG docker $USER
# Then log out and back in
```

### Out of Memory

**Symptoms**: Container keeps restarting

**Diagnosis**:

```bash
# Check memory usage
free -h
docker stats comapeo-api-server
```

**Solution**: Edit `.env.production` and increase limits:

```bash
DOCKER_MEMORY_LIMIT=1G
DOCKER_MEMORY_RESERVATION=256M
```

Then recreate:

```bash
docker compose --env-file .env.production down
docker compose --env-file .env.production up -d
```

## Ongoing Operations

### View Logs

```bash
# Standalone deployment
docker compose --env-file .env.production logs -f api

# Existing stack integration
docker compose --env-file .env logs -f api

# View last 100 lines
docker compose --env-file .env.production logs --tail=100 api
```

### Restart Service

```bash
# Standalone deployment
docker compose --env-file .env.production restart

# Existing stack integration
docker compose --env-file .env restart api
```

### Update Service

```bash
# Pull latest changes (if using git)
git pull

# Rebuild and restart
# Standalone deployment
docker compose --env-file .env.production up -d --build

# Existing stack integration
docker compose --env-file .env up -d --build api

# Clean up old images
docker image prune -f
```

### Stop Service

```bash
# Standalone deployment
docker compose --env-file .env.production down

# Existing stack integration
docker compose --env-file .env stop api
docker compose --env-file .env rm -f api
```

### Backup Data

```bash
# Backup job data volume
docker run --rm -v comapeo-job-data:/data -v $(pwd):/backup alpine tar czf /backup/comapeo-job-data-backup.tar.gz /data
```

## Additional Resources

- [API Reference](../developer-tools/api-reference.mdx)
- [VPS Deployment Guide](../developer-tools/vps-deployment.md)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
