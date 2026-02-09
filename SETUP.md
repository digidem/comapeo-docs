# Comapeo Docs API Service - Setup Guide

**Repository:** `communityfirst/comapeo-docs-api`
**Status:** Repository needs to be created
**Docker Image:** `communityfirst/comapeo-docs-api` (Docker Hub)

## Overview

The Comapeo Docs API Service provides a Docker containerized API for Docusaurus builds. This document covers repository setup, GitHub secrets configuration, and deployment workflows.

---

## Repository Setup

### 1. Create the Repository

**Note:** The `communityfirst` organization does not exist or you don't have access to create repositories under it. You have two options:

#### Option A: Create under your personal account

```bash
# Create repository under your personal account
gh repo create comapeo-docs-api --public --description "Comapeo Documentation API Service - Docker container for Docusaurus builds"
```

#### Option B: Create under the organization (requires proper access)

If you have access to the `communityfirst` organization:

```bash
# First, ensure organization exists and you have admin access
gh repo create communityfirst/comapeo-docs-api --public --description "Comapeo Documentation API Service - Docker container for Docusaurus builds"
```

### 2. Initialize the Repository

Once created, initialize it with the necessary files:

```bash
# Clone the repository
git clone git@github.com:communityfirst/comapeo-docs-api.git
cd comapeo-docs-api

# Copy Dockerfile and related files from comapeo-docs
cp ../comapeo-docs/Dockerfile ./
cp ../comapeo-docs/.dockerignore ./
cp ../comapeo-docs/package.json ./
cp ../comapeo-docs/bun.lockb ./
cp -r ../comapeo-docs/scripts ./scripts
cp -r ../comapeo-docs/src ./src
cp ../comapeo-docs/tsconfig.json ./
cp ../comapeo-docs/docusaurus.config.ts ./

# Create initial commit
git add .
git commit -m "feat: initial commit - Docker container for Docusaurus API service"
git push origin main
```

---

## GitHub Secrets Configuration

### Required Secrets

Configure the following secrets in your repository settings:

**Path:** Repository Settings → Secrets and variables → Actions → New repository secret

#### 1. DOCKER_USERNAME

**Description:** Your Docker Hub username
**Value:** Your Docker Hub username (e.g., `communityfirst` or your personal username)
**Usage:** Authentication for pushing images to Docker Hub

#### 2. DOCKER_PASSWORD

**Description:** Docker Hub Personal Access Token (PAT)
**Value:** Docker Hub access token with Read & Write permissions
**Usage:** Secure authentication (never use your actual Docker Hub password)

### Creating a Docker Hub Access Token

1. **Navigate to Docker Hub Security Settings**
   - Go to [Docker Hub](https://hub.docker.com/)
   - Click on your username → Account Settings → Security

2. **Create New Access Token**
   - Click "New Access Token"
   - Description: `github-actions-comapeo-docs-api`
   - Access permissions: **Read & Write**
   - Click "Generate"

3. **Copy the Token**
   - ⚠️ **IMPORTANT:** Copy the token immediately - it won't be shown again
   - Store it in GitHub Secrets as `DOCKER_PASSWORD`

4. **Best Practices**
   - Rotate tokens every 90 days
   - Use descriptive token names
   - Grant only necessary permissions (Read & Write for CI/CD)
   - Never commit tokens to repository
   - Enable GitHub secret scanning

---

## Path Filtering Rules

The GitHub Actions workflow should only trigger when files affecting the Docker build change. These paths match the `COPY` commands in the Dockerfile:

### Dockerfile COPY Analysis

From the current Dockerfile, the following paths are copied:

| Dockerfile Line | Copied Path            | GitHub Actions Path Filter |
| --------------- | ---------------------- | -------------------------- |
| 16              | `package.json`         | `package.json`             |
| 16              | `bun.lockb*`           | `bun.lockb*`               |
| 52              | `package.json`         | `package.json`             |
| 52              | `bun.lockb*`           | `bun.lockb*`               |
| 54              | `scripts/`             | `scripts/**`               |
| 56              | `docusaurus.config.ts` | `docusaurus.config.ts`     |
| 57              | `tsconfig.json`        | `tsconfig.json`            |
| 59              | `src/client/`          | `src/client/**`            |

### GitHub Actions Workflow Configuration

```yaml
name: Docker Build and Push

on:
  push:
    branches: [main]
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "package.json"
      - "bun.lockb*"
      - "scripts/**"
      - "tsconfig.json"
      - "docusaurus.config.ts"
      - "src/client/**"
  pull_request:
    branches: [main]
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "package.json"
      - "bun.lockb*"
      - "scripts/**"
      - "tsconfig.json"
      - "docusaurus.config.ts"
      - "src/client/**"

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  REGISTRY: docker.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=sha,prefix=,enable=${{ github.ref == 'refs/heads/main' }}
            type=raw,value=pr-${{ github.event.number }},enable=${{ github.event_name == 'pull_request' }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Path Filter Explanation

- **`Dockerfile`**: Changes to the Docker build configuration
- **`.dockerignore`**: Changes to Docker build exclusions
- **`package.json`**: Changes to dependencies or project metadata
- **`bun.lockb*`**: Changes to dependency lock files (supports multiple lock files)
- **`scripts/**`\*\*: Changes to any scripts in the scripts directory
- **`tsconfig.json`**: TypeScript configuration changes
- **`docusaurus.config.ts`**: Docusaurus configuration changes
- **`src/client/**`\*\*: Changes to client modules imported by Docusaurus config

**Note:** Files NOT in this list (like documentation, markdown files, etc.) will NOT trigger Docker rebuilds.

---

## Additional Files to Include

### .dockerignore

Create a `.dockerignore` file to exclude unnecessary files from the Docker build context:

```dockerignore
# Dependencies will be installed in the container
node_modules

# Development and testing files
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
vitest.config.ts
eslint.config.mjs
.prettierrc.json

# Documentation and content (generated from Notion)
docs/
static/
i18n/

# Development files
.env*
.env.local
.env.*.local

# Git files
.git
.gitignore
.gitattributes

# CI/CD files
.github/

# Editor files
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
Thumbs.db

# Build artifacts
dist/
build/
*.log

# Context and documentation (not needed in container)
context/
*.md
```

---

## Security Considerations

### Token Management

1. **Never commit secrets** to the repository
2. **Use GitHub Secrets** for all sensitive data
3. **Rotate tokens** regularly (recommended: every 90 days)
4. **Enable secret scanning** in repository settings
5. **Use read-only tokens** when possible (not applicable here since we push images)

### Build Security

1. **Pin action versions** to prevent supply chain attacks
2. **Use specific image tags** (not `latest`) for base images
3. **Scan images** for vulnerabilities (consider adding Trivy or Docker Scout)
4. **Sign images** with Docker Content Trust for production deployments

### Minimal Attack Surface

The Dockerfile follows security best practices:

- **Multi-stage build**: Reduces final image size and attack surface
- **Non-root user**: Runs as `bun` user (not root)
- **Minimal dependencies**: Only installs necessary system packages
- **Frozen lockfile**: Ensures reproducible builds with `--frozen-lockfile`
- **No dev dependencies**: Skips development tools in production image

---

## Deployment Workflow

### 1. Development Changes

1. Make changes to files in the repository
2. Create a pull request
3. GitHub Actions builds and tests (does not push)
4. Review and merge to main

### 2. Production Deployment

1. Merge PR to `main` branch
2. GitHub Actions automatically:
   - Builds multi-platform Docker image (amd64, arm64)
   - Pushes to Docker Hub with tags: `latest`, `sha-<commit>`
3. Deploy using docker-compose or your orchestration platform

### 3. Pull Request Testing

PR builds create images tagged as `pr-<number>` for testing:

```bash
# Pull and test PR build
docker pull communityfirst/comapeo-docs-api:pr-42
docker run -p 3001:3001 communityfirst/comapeo-docs-api:pr-42
```

---

## Troubleshooting

### Build Not Triggering

- Verify file changes match path filters
- Check workflow file syntax
- Ensure GitHub Actions is enabled for the repository

### Authentication Failures

- Verify `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are set
- Ensure Docker Hub token has Read & Write permissions
- Check token hasn't expired (rotate if >90 days old)

### Build Failures

- Check Dockerfile COPY paths match actual repository structure
- Verify all dependencies are in package.json
- Check for syntax errors in configuration files

---

## Related Documentation

- [Multi-Platform GitHub Actions Docker Build Research](RESEARCH.md)
- [Docker Hub: Access Tokens](https://docs.docker.com/security/for-developers/access-tokens/)
- [GitHub Actions: Docker Build Push](https://github.com/docker/build-push-action)

---

**Last Updated:** 2026-02-09
**Maintained By:** DevOps Team
