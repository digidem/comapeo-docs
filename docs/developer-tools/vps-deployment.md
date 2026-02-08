---
id: vps-deployment
title: VPS Deployment Guide
sidebar_label: VPS Deployment
sidebar_position: 2
pagination_label: VPS Deployment Guide
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/developer-tools/vps-deployment.md
keywords:
  - deployment
  - vps
  - docker
  - production
tags:
  - developer
  - deployment
  - operations
slug: /developer-tools/vps-deployment
last_update:
  date: 06/02/2025
  author: Awana Digital
---

# VPS Deployment Guide

This guide covers deploying the CoMapeo Documentation API server to a Virtual Private Server (VPS) using Docker.

## Prerequisites

Before deploying, ensure you have:

- A VPS with at least 512MB RAM and 1 CPU core
- Linux OS (Ubuntu 20.04+ or Debian 11+ recommended)
- Root or sudo access
- Docker and Docker Compose installed
- A domain name (optional, but recommended for production)

## Quick Start

### 1. Prepare Environment Variables

Create a `.env.production` file with your configuration:

```bash
# API Configuration
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001

# Notion Configuration (Required)
NOTION_API_KEY=your_notion_api_key_here
DATABASE_ID=your_database_id_here
DATA_SOURCE_ID=your_data_source_id_here

# OpenAI Configuration (Required for translation jobs)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Documentation Configuration
DEFAULT_DOCS_PAGE=introduction

# Image Processing Configuration
ENABLE_RETRY_IMAGE_PROCESSING=true
MAX_IMAGE_RETRIES=3

# API Authentication (Recommended for production)
# Generate a secure key with: openssl rand -base64 32
API_KEY_DEPLOYMENT=your_secure_api_key_here

# Docker Configuration
BUN_VERSION=1
DOCKER_IMAGE_NAME=comapeo-docs-api
DOCKER_IMAGE_TAG=latest
DOCKER_CONTAINER_NAME=comapeo-api-server
DOCKER_VOLUME_NAME=comapeo-job-data
DOCKER_NETWORK=comapeo-network

# Resource Limits
DOCKER_CPU_LIMIT=1
DOCKER_MEMORY_LIMIT=512M
DOCKER_CPU_RESERVATION=0.25
DOCKER_MEMORY_RESERVATION=128M

# Health Check Configuration
HEALTHCHECK_INTERVAL=30s
HEALTHCHECK_TIMEOUT=10s
HEALTHCHECK_START_PERIOD=5s
HEALTHCHECK_RETRIES=3

# Logging Configuration
DOCKER_LOG_DRIVER=json-file
DOCKER_LOG_MAX_SIZE=10m
DOCKER_LOG_MAX_FILE=3

# Restart Policy
DOCKER_RESTART_POLICY=unless-stopped
```

### 2. Copy Files to VPS

Transfer the required files to your VPS:

```bash
# Using SCP
scp Dockerfile docker-compose.yml .env.production user@your-vps-ip:/opt/comapeo-api/

# Or using rsync
rsync -avz Dockerfile docker-compose.yml .env.production user@your-vps-ip:/opt/comapeo-api/
```

### 3. SSH into VPS and Deploy

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Navigate to the deployment directory
cd /opt/comapeo-api

# Build and start the container
docker compose --env-file .env.production up -d --build

# Check logs
docker compose --env-file .env.production logs -f

# Verify health
curl http://localhost:3001/health
```

## Detailed Deployment Steps

### Step 1: VPS Preparation

Update your system and install Docker:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Add your user to docker group (optional)
sudo usermod -aG docker $USER

# Enable Docker service
sudo systemctl enable docker
sudo systemctl start docker
```

### Step 2: Create Deployment Directory

```bash
# Create directory structure
sudo mkdir -p /opt/comapeo-api
sudo chown $USER:$USER /opt/comapeo-api
cd /opt/comapeo-api
```

### Step 3: Configure Firewall

Configure UFW (Uncomplicated Firewall):

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow API port
sudo ufw allow 3001/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 4: Set Up Reverse Proxy (Optional)

For production use, set up Nginx as a reverse proxy:

```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/comapeo-api
```

Nginx configuration:

```nginx
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
```

Enable the site:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/comapeo-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Step 5: SSL/TLS Configuration (Recommended)

Use Certbot for free SSL certificates:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NOTION_API_KEY` | Notion integration API key | `secret_*` |
| `DATABASE_ID` | Notion database ID | `32-character hex` |
| `DATA_SOURCE_ID` | Notion data source ID | `UUID format` |
| `OPENAI_API_KEY` | OpenAI API key for translations | `sk-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_HOST` | Server bind address | `0.0.0.0` |
| `API_PORT` | Server port | `3001` |
| `OPENAI_MODEL` | OpenAI model for translation | `gpt-4o-mini` |
| `DEFAULT_DOCS_PAGE` | Default documentation page | `introduction` |

### API Authentication Variables

| Variable | Description | Format |
|----------|-------------|--------|
| `API_KEY_<name>` | API authentication key | Min 16 characters |

**Examples:**
```bash
API_KEY_DEPLOYMENT=sk-deploy-1234567890abcdef
API_KEY_GITHUB_ACTIONS=sk-github-abcdef1234567890
API_KEY_WEBHOOK=sk-webhook-0123456789abcdef
```

### Docker Configuration Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BUN_VERSION` | Bun runtime version | `1` |
| `DOCKER_IMAGE_NAME` | Docker image name | `comapeo-docs-api` |
| `DOCKER_IMAGE_TAG` | Docker image tag | `latest` |
| `DOCKER_CONTAINER_NAME` | Container name | `comapeo-api-server` |
| `DOCKER_VOLUME_NAME` | Volume name for persistence | `comapeo-job-data` |
| `DOCKER_NETWORK` | Network name | `comapeo-network` |

### Resource Limit Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_CPU_LIMIT` | Maximum CPU cores | `1` |
| `DOCKER_MEMORY_LIMIT` | Maximum memory | `512M` |
| `DOCKER_CPU_RESERVATION` | Reserved CPU cores | `0.25` |
| `DOCKER_MEMORY_RESERVATION` | Reserved memory | `128M` |

### Health Check Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HEALTHCHECK_INTERVAL` | Time between health checks | `30s` |
| `HEALTHCHECK_TIMEOUT` | Health check timeout | `10s` |
| `HEALTHCHECK_START_PERIOD` | Grace period before checks start | `5s` |
| `HEALTHCHECK_RETRIES` | Consecutive failures before unhealthy | `3` |

### Logging Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOCKER_LOG_DRIVER` | Logging driver | `json-file` |
| `DOCKER_LOG_MAX_SIZE` | Max log file size | `10m` |
| `DOCKER_LOG_MAX_FILE` | Max number of log files | `3` |

## Container Management

### Start the Service

```bash
docker compose --env-file .env.production up -d
```

### Stop the Service

```bash
docker compose --env-file .env.production down
```

### Restart the Service

```bash
docker compose --env-file .env.production restart
```

### View Logs

```bash
# Follow logs in real-time
docker compose --env-file .env.production logs -f

# View last 100 lines
docker compose --env-file .env.production logs --tail=100

# View logs for specific service
docker compose --env-file .env.production logs -f api
```

### Update the Service

```bash
# Pull latest changes (if using git)
git pull origin main

# Rebuild and restart
docker compose --env-file .env.production up -d --build

# Remove old images
docker image prune -f
```

## Monitoring and Maintenance

### Health Checks

Check the API health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-02-06T12:00:00.000Z",
  "uptime": 1234.567,
  "auth": {
    "enabled": true,
    "keysConfigured": 1
  }
}
```

### Resource Monitoring

Monitor container resource usage:

```bash
# View resource usage
docker stats comapeo-api-server

# View disk usage
docker system df

# View volume details
docker volume inspect comapeo-job-data
```

### Log Management

View and manage logs:

```bash
# View container logs
docker logs comapeo-api-server

# Rotate logs (if they get too large)
docker compose --env-file .env.production down
docker volume prune
docker compose --env-file .env.production up -d
```

## Troubleshooting

### Container Won't Start

```bash
# Check container status
docker ps -a

# View detailed logs
docker logs comapeo-api-server

# Check for port conflicts
sudo netstat -tlnp | grep 3001

# Verify environment variables
docker compose --env-file .env.production config
```

### Health Check Failing

```bash
# Test health endpoint manually
curl http://localhost:3001/health

# Check container is running
docker ps | grep comapeo-api-server

# Verify health check configuration
docker inspect comapeo-api-server | grep -A 10 Health
```

### Permission Issues

```bash
# Check file permissions
ls -la /opt/comapeo-api

# Fix ownership if needed
sudo chown -R $USER:$USER /opt/comapeo-api

# Check Docker permissions
groups $USER  # Should include 'docker'
```

### Out of Memory

```bash
# Check memory usage
free -h

# Adjust memory limits in .env.production
DOCKER_MEMORY_LIMIT=1G
DOCKER_MEMORY_RESERVATION=256M

# Recreate container with new limits
docker compose --env-file .env.production down
docker compose --env-file .env.production up -d
```

## Security Best Practices

1. **Use Strong API Keys**: Generate keys with at least 32 characters using `openssl rand -base64 32`

2. **Enable Authentication**: Always set `API_KEY_*` variables in production

3. **Use HTTPS**: Set up SSL/TLS with Nginx and Certbot

4. **Restrict Firewall Access**: Only allow necessary ports

5. **Regular Updates**: Keep Docker and system packages updated

6. **Monitor Logs**: Regularly check for suspicious activity

7. **Backup Data**: Backup the Docker volume regularly:

```bash
# Backup job data
docker run --rm -v comapeo-job-data:/data -v $(pwd):/backup alpine tar czf /backup/comapeo-job-data-backup.tar.gz /data
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Firewall rules configured
- [ ] SSL/TLS certificates installed
- [ ] API authentication keys set
- [ ] Resource limits configured
- [ ] Health checks passing
- [ ] Log rotation configured
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Documentation updated

## Additional Resources

- [GitHub Setup Guide](./github-setup.md) - Configure GitHub repository, secrets, and workflows
- [API Reference](./api-reference.mdx)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)
