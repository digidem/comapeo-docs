# Docker Hub Authentication Patterns - GitHub Actions

Research document covering Docker Hub authentication patterns using GitHub Actions secrets for the comapeo-docs project.

## Overview

This document outlines the authentication patterns, security best practices, and implementation guidelines for Docker Hub integration with GitHub Actions.

## Authentication Pattern

### Standard Login Action

```yaml
- name: Login to Docker Hub
  uses: docker/login-action@v3.3.0
  with:
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}
```

### With Fork Protection

```yaml
- name: Login to Docker Hub
  if: github.event.pull_request.head.repo.full_name == github.repository || github.event_name != 'pull_request'
  uses: docker/login-action@v3.3.0
  with:
    username: ${{ secrets.DOCKER_USERNAME }}
    password: ${{ secrets.DOCKER_PASSWORD }}
```

## Required Secrets

| Secret Name       | Description             | Type   | Required |
| ----------------- | ----------------------- | ------ | -------- |
| `DOCKER_USERNAME` | Docker Hub username     | string | Yes      |
| `DOCKER_PASSWORD` | Docker Hub access token | string | Yes      |

### Creating Docker Hub Access Token

1. Go to https://hub.docker.com/settings/security
2. Click "New Access Token"
3. Enter a description (e.g., "GitHub Actions - comapeo-docs")
4. Select permissions:
   - **Read** - Required
   - **Write** - Required
   - **Delete** - Recommended for cleanup workflows
5. Click "Generate"
6. Copy the token immediately (it won't be shown again)
7. Add to GitHub repository secrets as `DOCKER_PASSWORD`

## Security Best Practices

### 1. Use Access Tokens, Not Passwords

```yaml
# ❌ BAD - Using account password
password: ${{ secrets.DOCKER_PASSWORD }}  # Actual password

# ✅ GOOD - Using access token
password: ${{ secrets.DOCKER_PASSWORD }}  # Access token
```

### 2. Fork Protection

Prevent unauthorized Docker Hub access from fork PRs:

```yaml
# Workflow-level protection
on:
  pull_request:
    branches: [main]

jobs:
  build:
    if: github.event.pull_request.head.repo.full_name == github.repository || github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3.3.0
        # ...
```

### 3. Version Pinning

Always pin action versions:

```yaml
# ✅ GOOD - Pinned version
uses: docker/login-action@v3.3.0

# ❌ BAD - Moving tag
uses: docker/login-action@v3
```

### 4. Scope Limitations

Create tokens with minimum required permissions:

| Token Scope | When Needed | Description                 |
| ----------- | ----------- | --------------------------- |
| Read        | Always      | Pull images, check registry |
| Write       | Publishing  | Push images                 |
| Delete      | Cleanup     | Remove old tags             |

## Complete Workflow Example

### Basic Docker Publish Workflow

```yaml
name: Docker Image CI

on:
  push:
    branches: [main]
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "docker/**"
  pull_request:
    branches: [main]
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "docker/**"

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3.7.1

      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3.3.0
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: digidem/comapeo-docs-api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Multi-Platform Build Workflow

```yaml
name: Docker Multi-Platform Build

on:
  push:
    branches: [main]
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "docker/**"

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3.7.1

      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3.3.0
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: ${{ github.event_name != 'pull_request' }}
          tags: |
            digidem/comapeo-docs-api:latest
            digidem/comapeo-docs-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Verify image
        if: github.event_name != 'pull_request'
        run: |
          docker run --rm digidem/comapeo-docs-api:latest --version
```

## Authentication Patterns by Use Case

### 1. CI Build Only (No Push)

```yaml
steps:
  - name: Build image
    uses: docker/build-push-action@v6
    with:
      context: .
      push: false
      tags: digidem/comapeo-docs-api:test
```

### 2. Build and Push to Main Branch

```yaml
steps:
  - name: Login to Docker Hub
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    uses: docker/login-action@v3.3.0
    with:
      username: ${{ secrets.DOCKER_USERNAME }}
      password: ${{ secrets.DOCKER_PASSWORD }}

  - name: Build and push
    uses: docker/build-push-action@v6
    with:
      context: .
      push: ${{ github.ref == 'refs/heads/main' && github.event_name == 'push' }}
      tags: digidem/comapeo-docs-api:latest
```

### 3. Tagged Releases

```yaml
steps:
  - name: Login to Docker Hub
    if: startsWith(github.ref, 'refs/tags/')
    uses: docker/login-action@v3.3.0
    with:
      username: ${{ secrets.DOCKER_USERNAME }}
      password: ${{ secrets.DOCKER_PASSWORD }}

  - name: Build and push
    uses: docker/build-push-action@v6
    with:
      context: .
      push: ${{ startsWith(github.ref, 'refs/tags/') }}
      tags: |
        digidem/comapeo-docs-api:latest
        digidem/comapeo-docs-api:${{ github.ref_name }}
```

### 4. PR Preview Builds

```yaml
steps:
  - name: Login to Docker Hub
    if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository
    uses: docker/login-action@v3.3.0
    with:
      username: ${{ secrets.DOCKER_USERNAME }}
      password: ${{ secrets.DOCKER_PASSWORD }}

  - name: Build and push
    uses: docker/build-push-action@v6
    with:
      context: .
      push: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository }}
      tags: digidem/comapeo-docs-api:pr-${{ github.event.number }}
```

## Troubleshooting

### Common Errors

**Error: `unauthorized: authentication required`**

- Check that `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are set
- Verify the access token has Read & Write permissions
- Ensure the token hasn't expired

**Error: `denied: requested access to the resource is denied`**

- Verify you have push permissions to the target repository
- Check that the repository exists on Docker Hub
- Ensure the username matches the repository namespace

**Error: `no match for platform in manifest`**

- Ensure `docker/setup-qemu-action@v3` is included for multi-platform builds
- Check that the target platforms are supported

### Debugging Steps

```yaml
- name: Debug Docker credentials
  run: |
    echo "Username set: $([ -n "${{ secrets.DOCKER_USERNAME }}" ] && echo "YES" || echo "NO")"
    echo "Password set: $([ -n "${{ secrets.DOCKER_PASSWORD }}" ] && echo "YES" || echo "NO")"

- name: Test Docker login
  run: |
    echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
```

## Repository Configuration

### Current Setup for comapeo-docs

| Item                  | Value                                |
| --------------------- | ------------------------------------ |
| Docker Hub Repository | `digidem/comapeo-docs-api`           |
| Required Secrets      | `DOCKER_USERNAME`, `DOCKER_PASSWORD` |
| Access Token Scope    | Read, Write, Delete                  |
| Platform Targets      | `linux/amd64`, `linux/arm64`         |

### Verification Script

The repository includes a verification script at `scripts/verify-docker-hub.ts`:

```bash
bun run scripts/verify-docker-hub.ts
```

This script validates:

- Docker Hub repository exists
- Credentials are valid
- Repository permissions

## References

- [docker/login-action](https://github.com/docker/login-action) - Official GitHub Action
- [Docker Hub Access Tokens](https://docs.docker.com/security/for-developers/access-tokens/)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [Multi-platform builds](https://docs.docker.com/build/building/multi-platform/)

## Alternative Secret Naming Patterns

Based on community practices, two common naming conventions exist:

| Pattern A (Preferred) | Pattern B (Common)   |
| --------------------- | -------------------- |
| `DOCKER_USERNAME`     | `DOCKERHUB_USERNAME` |
| `DOCKER_PASSWORD`     | `DOCKERHUB_PASSWORD` |

**Note**: This project uses Pattern A (`DOCKER_USERNAME`/`DOCKER_PASSWORD`) for consistency with existing documentation.

### Secret Naming Best Practices

```yaml
# ✅ Consistent naming across workflows
username: ${{ secrets.DOCKER_USERNAME }}
password: ${{ secrets.DOCKER_PASSWORD }}

# ❌ Avoid inconsistent naming
username: ${{ secrets.DOCKERHUB_USER }}
password: ${{ secrets.DOCKER_PWD }}
```

## GitHub Actions Permissions

For workflows that comment on PRs, ensure proper permissions are set:

```yaml
permissions:
  contents: read
  pull-requests: write # Required for PR comments
```

## Implementation Status

- [x] Research completed
- [x] Documentation created
- [ ] GitHub secrets configured
- [ ] Workflow implementation
- [ ] Testing in GitHub Actions
- [ ] Production deployment
