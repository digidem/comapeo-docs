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

### Step 3.1: Upload Files to VPS

From your **local machine**, upload the required files:

```bash
# Upload deployment files
scp Dockerfile docker-compose.yml .env.production user@your-vps-ip:/opt/comapeo-api/
```

**Verify**: SSH into your VPS and run `ls -la /opt/comapeo-api` - you should see all three files.

### Step 3.2: Build and Start the Service

On your **VPS**, in `/opt/comapeo-api`:

```bash
# Build and start the container
docker compose --env-file .env.production up -d --build

# Check container status
docker compose --env-file .env.production ps
```

**Expected Output**: The `api` service should show as "Up" with a healthy status.

### Step 3.3: Verify Deployment

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
docker compose --env-file .env.production logs --tail=50 api
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

| Secret Name              | Value                                              |
| ------------------------ | -------------------------------------------------- |
| `API_ENDPOINT`           | `https://your-domain.com` (or omit for local mode) |
| `API_KEY_GITHUB_ACTIONS` | Value from Step 1.2                                |
| `NOTION_API_KEY`         | Your Notion API key                                |
| `DATABASE_ID`            | Your database ID                                   |
| `DATA_SOURCE_ID`         | Your data source ID                                |
| `OPENAI_API_KEY`         | Your OpenAI API key                                |

### Step 5.2: Test GitHub Workflow

1. Go to **Actions** tab in your repository
2. Select **Notion Fetch via API** workflow
3. Click **Run workflow**
4. Choose a branch and `job_type`
5. Click **Run workflow**

**Verify**: The workflow should complete successfully and update GitHub status checks.

## Validation Checklist

After completing deployment, verify:

- [ ] Container is running: `docker ps` shows `comapeo-api-server`
- [ ] Health check passes: `curl http://localhost:3001/health` returns `{"status":"ok"}`
- [ ] Logs show no errors: `docker compose logs api`
- [ ] Firewall allows port 3001: `sudo ufw status`
- [ ] (Optional) Nginx proxy works: `curl https://your-domain.com/health`
- [ ] (Optional) GitHub workflow completes successfully

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
# Follow logs in real-time
docker compose --env-file .env.production logs -f api

# View last 100 lines
docker compose --env-file .env.production logs --tail=100 api
```

### Restart Service

```bash
docker compose --env-file .env.production restart
```

### Update Service

```bash
# Pull latest changes (if using git)
git pull

# Rebuild and restart
docker compose --env-file .env.production up -d --build

# Clean up old images
docker image prune -f
```

### Stop Service

```bash
docker compose --env-file .env.production down
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
