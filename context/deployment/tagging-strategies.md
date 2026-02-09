# Deployment Tagging Strategies

This document outlines the recommended tagging strategies for different deployment environments in the Comapeo Documentation project.

## Overview

The project uses multiple deployment targets:

- **Production**: `https://docs.comapeo.app` (Cloudflare Pages, main branch)
- **Staging**: `https://stg.docs.comapeo.app` (Cloudflare Pages, content branch)
- **PR Previews**: `https://pr-{number}.comapeo-docs.pages.dev` (Cloudflare Pages, PR branches)
- **GitHub Pages**: `https://digidem.github.io/comapeo-docs/` (GitHub Pages, main branch)

## Current Implementation

### Production Deployments

**Trigger**: Manual workflow dispatch or push to `main` branch
**URL**: `https://docs.comapeo.app`
**Build Flags**:

- `IS_PRODUCTION=true` - Enables SEO indexing
- Sitemap generation enabled
- No `noindex` meta tags

**Current Tagging**: No explicit version tagging is used. The production deployment uses the `main` branch directly without version tags.

### PR Preview Deployments

**Trigger**: PR opened, synchronized, reopened, or labeled
**URL Pattern**: `https://pr-{number}.comapeo-docs.pages.dev`
**Build Flags**:

- `IS_PRODUCTION` not set - Generates `noindex` meta tags
- Sitemap generation disabled
- Robots.txt blocks all indexing

**Current Tagging**: Uses `pr-{number}` as the Cloudflare Pages branch identifier

## Recommended Tagging Strategies

### Strategy 1: Semantic Versioning for Production (Recommended)

**Purpose**: Clear version identification for production releases

**Tags**: `v{major}.{minor}.{patch}`

**Examples**:

- `v1.0.0` - First stable release
- `v1.1.0` - Feature release
- `v1.1.1` - Patch release
- `v2.0.0` - Major version change

**Implementation**:

```bash
# Create a version tag for production deployment
git tag -a v1.0.0 -m "Release v1.0.0: Initial stable release"
git push origin v1.0.0

# Deployment workflow should:
# 1. Detect the tag
# 2. Use tag version in build metadata
# 3. Store version in deployed application
```

**Benefits**:

- Clear release history
- Easy rollback to specific versions
- Semantic communication of changes
- Industry standard practice

### Strategy 2: Branch-Based Tagging for Environments

**Purpose**: Environment-specific build tracking

**Tags**: `{environment}-{branch-name}-{commit-sha}`

**Examples**:

- `production-main-a1b2c3d` - Production build from main
- `staging-content-e4f5g6h` - Staging build from content branch
- `preview-feature-xyz-i7j8k9l` - Preview build from feature branch

**Implementation**:

```bash
# In CI/CD workflow
BRANCH_NAME=${GITHUB_REF#refs/heads/}
COMMIT_SHA=${GITHUB_SHA:0:7}
ENVIRONMENT="production"
BUILD_TAG="${ENVIRONMENT}-${BRANCH_NAME}-${COMMIT_SHA}"
```

**Benefits**:

- Full traceability
- Clear environment separation
- Commit-level precision

### Strategy 3: Build Number Tagging

**Purpose**: Sequential build identification

**Tags**: `build-{run-number}` or `{version}+{build-number}`

**Examples**:

- `build-1234` - GitHub Actions run #1234
- `v1.0.0+5678` - Version v1.0.0, build 5678

**Implementation**:

```yaml
# In GitHub Actions
BUILD_TAG: "build-${{ github.run_number }}"
```

**Benefits**:

- Simple sequential numbering
- Easy to reference in CI/CD logs
- Useful for automated rollback

### Strategy 4: Timestamp-Based Tagging

**Purpose**: Time-based build identification

**Tags**: `{date}-{time}` or `v{version}-{date}`

**Examples**:

- `20260209-143022` - February 9, 2026 at 14:30:22 UTC
- `v1.0.0-20260209` - Version v1.0.0 released on Feb 9, 2026

**Implementation**:

```bash
BUILD_TAG=$(date -u +%Y%m%d-%H%M%S)
```

**Benefits**:

- Chronological ordering
- Useful for time-based debugging
- No coordination needed for unique values

## Recommended Strategy for This Project

Based on the current setup and best practices, the following hybrid strategy is recommended:

### Production Releases

**Use Semantic Versioning + Build Metadata**:

```
Format: v{major}.{minor}.{patch}+{build-number}
Example: v1.0.0+1234
```

**Implementation**:

1. Create git tag with semver when releasing to production
2. Include GitHub Actions run number as build metadata
3. Store version in build output for display

**Workflow**:

```yaml
# In deploy-production.yml
- name: Generate version tag
  id: version
  run: |
    if [ "${{ github.event_name }}" == "push" && "${{ github.ref }}" == "refs/heads/main" ]; then
      # Auto-increment version or use existing tag
      VERSION="v1.0.0+${{ github.run_number }}"
    else
      VERSION="v0.0.0+${{ github.run_number }}"
    fi
    echo "version=$VERSION" >> $GITHUB_OUTPUT
    echo "BUILD_VERSION=$VERSION" >> $GITHUB_ENV

- name: Build with version
  env:
    BUILD_VERSION: ${{ env.BUILD_VERSION }}
  run: bun run build
```

### PR Preview Builds

**Use PR Number + Commit SHA**:

```
Format: pr-{pr-number}-{commit-sha}
Example: pr-42-a1b2c3d
```

**Implementation**:

- Already implemented in `deploy-pr-preview.yml`
- Uses `pr-{number}` as branch identifier
- Consider adding commit SHA to build metadata

### Staging/GitHub Pages Builds

**Use Branch + Timestamp**:

```
Format: {branch}-{timestamp}
Example: main-20260209-143022
```

**Implementation**:

```yaml
# In deploy-staging.yml
- name: Generate build tag
  id: tag
  run: |
    BUILD_TAG="main-$(date -u +%Y%m%d-%H%M%S)"
    echo "tag=$BUILD_TAG" >> $GITHUB_OUTPUT
    echo "BUILD_TAG=$BUILD_TAG" >> $GITHUB_ENV
```

## Implementation Checklist

- [ ] Add version metadata to Docusaurus build
- [ ] Implement semantic version tagging for production releases
- [ ] Add build tag display to site footer
- [ ] Store build information in deployment artifact
- [ ] Update deployment workflows with tagging strategy
- [ ] Document release process for maintainers

## Industry Best Practices References

- [GitKraken: Managing Releases with Semantic Versioning and Git Tags](https://www.gitkraken.com/gitkon/semantic-versioning-git-tags)
- [Stackademic: How Git Tags Can Transform Your Release Management](https://blog.stackademic.com/how-git-tags-can-transform-your-release-management-a4977afd9272)
- [Docker Blog: Using Tags and Labels to Manage Docker Image Sprawl](https://www.docker.com/blog/docker-best-practice-using-tags-and-labels-to-manage-docker-image-sprawl/)
- [Azure: Image Tag Best Practices](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-image-tag-version)

## Migration Path

1. **Phase 1**: Add build metadata to existing deployments (no tags)
2. **Phase 2**: Implement PR preview build tags
3. **Phase 3**: Implement semantic versioning for production
4. **Phase 4**: Add version display to deployed sites
