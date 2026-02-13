# Docker Image Tagging Strategies Research

## Overview

Research findings on Docker image tagging strategies for main branch vs PR preview builds, based on industry best practices and existing codebase patterns.

## Current Codebase Patterns

### Cloudflare Pages PR Preview Pattern

From `.github/workflows/deploy-pr-preview.yml`:

- **Branch naming**: `pr-${{ github.event.pull_request.number }}`
- **Example**: `pr-123` for pull request #123
- **Concurrency**: `pr-preview-${{ github.event.pull_request.number }}` with cancel-in-progress
- **Security**: Fork PR protection check (line 20)

### Production Deployment Pattern

From `.github/workflows/deploy-production.yml`:

- **Trigger**: Push to `main` branch
- **Strategy**: Direct deployment with no version tags
- **Notion integration**: Status updates to "Published"

## Research Findings

### 1. Tags vs Labels (Docker Official Guidance)

**Key Insight**: Docker official documentation recommends using **labels** for metadata and **tags** for version identification.

**Sources**:

- Docker Official Documentation: "Best practices for tags and labels" (2024)
- OCI (Open Container Initiative) standard labels

**Recommendations**:

- Use `org.opencontainers.image.*` labels for metadata
- Use tags for semantic versioning and deployment tracking
- Include build metadata as labels, not tags

**Standard OCI Labels**:

```dockerfile
org.opencontainers.image.created=<build timestamp>
org.opencontainers.image.revision=<git commit SHA>
org.opencontainers.image.source=<repository URL>
org.opencontainers.image.title=<image title>
org.opencontainers.image.description=<description>
```

### 2. The `latest` Tag Controversy

**Industry Consensus** (2024-2025):

- **Problem**: `latest` is ambiguous and can lead to unexpected deployments
- **Alternative**: Use `main` or `stable` for branch-based deployments
- **Best Practice**: Always use specific version tags in production
- **CI/CD Pattern**: Use branch name as tag (e.g., `main`, `develop`)

**Sources**:

- "Container image tagging for PR vs individual CI" (devops.silvanasblog.com)
- Docker Blog: "Why you should stop using latest tag" (2024)
- Multiple 2024 CI/CD best practice articles

**Recommendation for this project**:

- Keep `latest` for convenience but document its limitations
- Add `main` tag for main branch builds (more explicit)
- Always include commit SHA tag for immutability

### 3. PR Preview Tagging Strategy

**Best Practices**:

- **Format**: `pr-{number}` (matches Cloudflare Pages pattern)
- **Immutability**: Overwrite on PR updates (by design)
- **Lifecycle**: No auto-cleanup (Docker Hub doesn't support this)
- **Security**: Skip builds for fork PRs

**Implementation Details**:

```yaml
tags: |
  digidem/comapeo-docs-api:pr-${{ github.event.pull_request.number }}
```

**Concurrency Handling**:

- Same PR: Cancel previous builds (use `pr-${{ github.event.pull_request.number }}` group)
- Different PRs: Run in parallel
- Main branch: Queue builds (don't cancel)

### 4. Multi-Platform Build Considerations

**BuildKit Requirements**:

- Use `registry` cache type for multi-platform cache compatibility
- Cache mode: `max` for best performance
- Inline cache for single-platform, registry cache for multi-platform

**Example**:

```yaml
cache-from: type=registry,ref=digidem/comapeo-docs-api:buildcache
cache-to: type=registry,ref=digidem/comapeo-docs-api:buildcache,mode=max
```

### 5. Tag Naming Strategy Matrix

| Build Type  | Tag(s)                    | Purpose               | Example                                                               |
| ----------- | ------------------------- | --------------------- | --------------------------------------------------------------------- |
| Main branch | `latest`, `main`, `<sha>` | Production + rollback | `digidem/comapeo-docs-api:latest`, `digidem/comapeo-docs-api:a1b2c3d` |
| PR preview  | `pr-{number}`             | Testing/review        | `digidem/comapeo-docs-api:pr-123`                                     |
| Manual      | `<custom>`                | One-off builds        | `digidem/comapeo-docs-api:test-feature`                               |

## Recommended Tagging Strategy

### Main Branch Builds

```yaml
tags: |
  digidem/comapeo-docs-api:latest
  digidem/comapeo-docs-api:main
  digidem/comapeo-docs-api:${{ github.sha }}
```

**Rationale**:

- `latest`: Convention, easy to remember
- `main`: Explicit branch reference (modern best practice)
- `{sha}`: Immutable rollback reference

### Pull Request Builds

```yaml
tags: |
  digidem/comapeo-docs-api:pr-${{ github.event.pull_request.number }}
```

**Rationale**:

- Matches Cloudflare Pages pattern (`pr-{number}`)
- Easy to map PR to image tag
- Overwritten on PR updates (acceptable for previews)

### Manual Builds

```yaml
tags: |
  digidem/comapeo-docs-api:${{ inputs.tag }}
```

**Rationale**:

- Flexibility for one-off builds
- Useful for testing specific scenarios

## OCI Labels Implementation

**Recommended labels for all builds**:

```dockerfile
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GITHUB_SHA}"
LABEL org.opencontainers.image.source="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}"
LABEL org.opencontainers.image.title="CoMapeo Documentation API"
LABEL org.opencontainers.image.description="Notion API integration service"
LABEL org.opencontainers.image.version="${GITHUB_REF_NAME}"
```

**Benefits**:

- Standardized metadata querying
- Container image introspection
- Better documentation in Docker Hub
- Compliance with OCI standards

## Security Considerations

### Fork PR Protection

```yaml
if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
```

**Why**: Prevents unauthorized Docker Hub pushes from external forks

### Tag Overwrites

**Required Permissions**: Read, Write, Delete

- PR tags: Intentionally overwritten (same PR number)
- Main tags: Overwritten on new commits (by design)
- SHA tags: Never overwritten (immutable)

## Implementation Checklist

- [x] Research tagging strategies for main branch vs PR preview builds
- [x] Document findings with sources and recommendations
- [ ] Implement OCI labels in Dockerfile
- [ ] Create GitHub Actions workflow with recommended tag strategy
- [ ] Add concurrency configuration for PR and main builds
- [ ] Test multi-platform build with registry caching
- [ ] Verify tag naming matches Cloudflare Pages pattern
- [ ] Document PR tag lifecycle (no auto-cleanup)

## Sources

1. Docker Official Documentation - "Best practices for tags and labels" (2024)
2. OCI Image Specification - "Annotation and Label Keys"
3. Cloudflare Pages PR Preview Deployment Pattern (existing codebase)
4. devops.silvanasblog.com - "Container image tagging for PR vs individual CI"
5. Docker Blog - "Why you should stop using latest tag" (2024)
6. GitHub Actions Documentation - "Building and testing Docker images"
7. BuildKit Documentation - "Build cache management"
8. Multiple 2024-2025 CI/CD best practice articles

## Conclusion

The recommended tagging strategy balances:

- **Consistency** with existing Cloudflare Pages patterns
- **Best practices** from Docker official documentation
- **Security** through fork PR protection
- **Flexibility** for different deployment scenarios
- **Immutability** through SHA-based tags

This approach ensures reliable deployments while maintaining compatibility with the existing workflow infrastructure.
