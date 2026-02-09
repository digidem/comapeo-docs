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

#### API Service Secrets (Required for API-based Workflows)

| Secret Name              | Value                                              | Used By Workflows    |
| ------------------------ | -------------------------------------------------- | -------------------- |
| `API_ENDPOINT`           | `https://your-domain.com` (or omit for local mode) | Notion Fetch via API |
| `API_KEY_GITHUB_ACTIONS` | Value from Step 1.2                                | Notion Fetch via API |

**Note:** The `API_ENDPOINT` secret should point to your deployed API service URL (e.g., `https://api.example.com`). If omitted, the workflow will run in "local mode" and start the API server locally for testing.

#### Translation Secrets (Required for Translation Workflows)

| Secret Name      | Value               | Used By Workflows       |
| ---------------- | ------------------- | ----------------------- |
| `OPENAI_API_KEY` | Your OpenAI API key | Translate, Notion Fetch |
| `OPENAI_MODEL`   | OpenAI model name   | Translate (optional)    |

**Default for `OPENAI_MODEL`:** `gpt-4o-mini`

#### Cloudflare Pages Secrets (Required for Deployments)

| Secret Name             | Value                      | Used By Workflows                    |
| ----------------------- | -------------------------- | ------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | Your Cloudflare API token  | Deploy PR Preview, Deploy Production |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Deploy PR Preview, Deploy Production |

**Note:** Without `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, PR preview deployments and production deployments to Cloudflare Pages will not work.

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

| Workflow               | Required Secrets                                                                              | Optional Secrets                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Notion Fetch via API   | `API_KEY_GITHUB_ACTIONS`, `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`, `OPENAI_API_KEY` | `API_ENDPOINT`, `SLACK_WEBHOOK_URL`                                  |
| Sync Notion Docs       | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`                                             | `SLACK_WEBHOOK_URL`                                                  |
| Translate Notion Docs  | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`, `OPENAI_API_KEY`                           | `OPENAI_MODEL`, `SLACK_WEBHOOK_URL`                                  |
| Docker Publish         | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`                                                       | `SLACK_WEBHOOK_URL`                                                  |
| Deploy PR Preview      | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`                                             | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SLACK_WEBHOOK_URL` |
| Deploy to Production   | `NOTION_API_KEY`, `DATABASE_ID`, `DATA_SOURCE_ID`                                             | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SLACK_WEBHOOK_URL` |
| Deploy to GitHub Pages | None (uses GitHub Pages infrastructure)                                                       | `SLACK_WEBHOOK_URL`                                                  |

### Step 5.2: Available GitHub Workflows

This repository includes several GitHub Actions workflows for different purposes. Workflows have different trigger types:

- **Manual (workflow_dispatch)**: Run manually from Actions tab with custom inputs
- **Automatic (push/pull_request)**: Triggered by Git events
- **Scheduled (cron)**: Runs on a schedule (e.g., daily at 2 AM UTC)
- **Repository Dispatch**: Triggered via GitHub API or other workflows

#### 1. Notion Fetch via API (`.github/workflows/api-notion-fetch.yml`)

Fetches content from Notion via the deployed API service. This workflow requires the API service to be deployed and accessible.

**Triggers:**

- Manual: Run from Actions tab
- Scheduled: Daily at 2 AM UTC (automatically)
- Repository Dispatch: Via GitHub API event `notion-fetch-request`

**Job Types:**

- `notion:fetch-all` - Fetch all pages from Notion
- `notion:fetch` - Fetch single page from Notion
- `notion:translate` - Translate content to multiple languages
- `notion:status-translation` - Update Notion status to "Auto Translation Generated"
- `notion:status-draft` - Update Notion status to "Draft published"
- `notion:status-publish` - Update Notion status to "Published"
- `notion:status-publish-production` - Update Notion status to "Published" (production)

**How to Run:**

1. Go to **Actions** tab in your repository
2. Select **Notion Fetch via API** workflow
3. Click **Run workflow**
4. Choose a branch, select `job_type`, and optionally set `max_pages` (for `notion:fetch-all`)
5. Click **Run workflow**

**Required Secrets:**

- `API_ENDPOINT` (or omit to use local mode for testing)
- `API_KEY_GITHUB_ACTIONS`
- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`
- `OPENAI_API_KEY`

**Optional Secrets:**

- `SLACK_WEBHOOK_URL` - For Slack notifications

#### 2. Sync Notion Docs (`.github/workflows/sync-docs.yml`)

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

#### 3. Translate Notion Docs (`.github/workflows/translate-docs.yml`)

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

#### 4. Deploy PR Preview (`.github/workflows/deploy-pr-preview.yml`)

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

#### 5. Docker Publish (`.github/workflows/docker-publish.yml`)

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
- `.dockerignore`
- `package.json`
- `bun.lockb*`
- `scripts/**`
- `tsconfig.json`
- `docusaurus.config.ts`
- `src/client/**`

#### 6. Deploy to Production (`.github/workflows/deploy-production.yml`)

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

#### 7. Deploy to GitHub Pages (`.github/workflows/deploy-staging.yml`)

Deploys documentation to GitHub Pages (staging environment).

**Triggers:** Automatic on push to `main` branch

**Staging URL:** Available via GitHub Pages settings

### Step 5.3: Test GitHub Workflow

After adding secrets, test the API integration:

1. Go to **Actions** tab in your repository
2. Select **Notion Fetch via API** workflow
3. Click **Run workflow**
4. Choose a branch and select `notion:fetch-all` as the `job_type`
5. Set `max_pages` to `5` for testing
6. Click **Run workflow**

**Verify**: The workflow should complete successfully and update GitHub status checks.

### Step 5.4: Verify Workflow Secrets

To verify that all required secrets are properly configured:

1. Check the workflow logs for authentication errors
2. Verify the API health endpoint responds correctly
3. Confirm that Notion API calls succeed
4. Check GitHub status checks on commits

**Common Issues:**

- Missing `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` will cause deployment failures
- Missing `SLACK_WEBHOOK_URL` will cause notification failures (non-critical)
- Incorrect `API_ENDPOINT` will prevent workflow communication with the API service

## Validation Checklist

After completing deployment, verify:

- [ ] Container is running: `docker ps` shows `comapeo-api-server`
- [ ] Health check passes: `curl http://localhost:3001/health` returns `{"status":"ok"}`
- [ ] Logs show no errors: `docker compose logs api`
- [ ] Firewall allows port 3001: `sudo ufw status`
- [ ] (Optional) Nginx proxy works: `curl https://your-domain.com/health`
- [ ] (Optional) GitHub workflow completes successfully
- [ ] (Optional) All required GitHub secrets are configured:
  - [ ] `API_ENDPOINT` (or omitted for local mode)
  - [ ] `API_KEY_GITHUB_ACTIONS`
  - [ ] `NOTION_API_KEY`
  - [ ] `DATABASE_ID`
  - [ ] `DATA_SOURCE_ID`
  - [ ] `OPENAI_API_KEY`
  - [ ] `CLOUDFLARE_API_TOKEN` (for Cloudflare Pages deployments)
  - [ ] `CLOUDFLARE_ACCOUNT_ID` (for Cloudflare Pages deployments)
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
