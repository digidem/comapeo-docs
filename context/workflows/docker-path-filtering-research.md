# Docker Path Filtering Research

## Overview

This document provides comprehensive research on path filtering triggers for Docker Hub deployment GitHub Actions, specifically for the comapeo-docs-api service. It ensures Docker builds only trigger when files actually copied into the image change.

## Research Summary

Path filtering for Docker builds requires careful analysis of:

1. **Dockerfile COPY instructions** - Direct paths copied into the image
2. **.dockerignore patterns** - Files explicitly excluded from build context
3. **Transitive dependencies** - Files imported by copied files
4. **Build-time dependencies** - Files that affect the build process

## Dockerfile COPY Instructions Analysis

Based on `Dockerfile` in the repository root, the following COPY instructions define what gets included in the final image:

```dockerfile
# Lines 16, 52: Dependencies
COPY package.json bun.lockb* ./

# Line 54: All scripts (for job execution)
COPY --chown=bun:bun scripts ./scripts

# Line 56: Docusaurus config (imported by client modules)
COPY --chown=bun:bun docusaurus.config.ts ./docusaurus.config.ts

# Line 57: TypeScript config
COPY --chown=bun:bun tsconfig.json ./

# Line 59: Client modules
COPY --chown=bun:bun src/client ./src/client
```

### Files Copied into Image

| Path                   | Reason                                            | Dockerfile Line                        |
| ---------------------- | ------------------------------------------------- | -------------------------------------- |
| `Dockerfile`           | Image definition itself                           | N/A (triggers build by definition)     |
| `.dockerignore`        | Controls build context                            | N/A (affects what's available to copy) |
| `package.json`         | Dependency definitions                            | 16, 52                                 |
| `bun.lockb*`           | Lockfile for reproducible builds                  | 16, 52                                 |
| `scripts/**`           | Entire scripts directory copied                   | 54                                     |
| `src/client/**`        | Client modules referenced by docusaurus.config.ts | 59                                     |
| `docusaurus.config.ts` | Imported by client modules                        | 56                                     |
| `tsconfig.json`        | TypeScript configuration                          | 57                                     |

### Files NOT Copied into Image (Excluded by .dockerignore)

| Path                              | Reason                        | .dockerignore Line |
| --------------------------------- | ----------------------------- | ------------------ |
| `docs/**`                         | Generated content from Notion | 26                 |
| `i18n/**`                         | Localized content             | 27                 |
| `static/images/**`                | Image assets                  | 28                 |
| `.github/**`                      | CI/CD files only              | 50                 |
| `context/**`                      | Documentation                 | 63                 |
| `README.md`, `CONTRIBUTING.md`    | Documentation                 | 59-60              |
| Test files (`**/*.test.ts`)       | Development only              | 37-39              |
| Build outputs (`build/`, `dist/`) | Generated during build        | 15-16              |

## Recommended Path Filtering Configuration

### For Push Events (Main Branch)

```yaml
on:
  push:
    branches:
      - main
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "package.json"
      - "bun.lockb*"
      - "scripts/**"
      - "src/client/**"
      - "tsconfig.json"
      - "docusaurus.config.ts"
```

### For Pull Request Events

```yaml
on:
  pull_request:
    branches:
      - main
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "package.json"
      - "bun.lockb*"
      - "scripts/**"
      - "src/client/**"
      - "tsconfig.json"
      - "docusaurus.config.ts"
```

## Path Filtering Best Practices

### 1. Exact Match Principle

Path filters should match **exactly** what the Dockerfile copies. If a file is:

- **Copied into image**: Include in path filter
- **Excluded by .dockerignore**: Exclude from path filter
- **Only affects build context**: Include if it changes what gets copied

### 2. Wildcard Usage

- `**` matches all directories recursively
- `*` matches files in current directory only
- `bun.lockb*` matches `bun.lockb` and any variations

### 3. Scripts Directory Consideration

The entire `scripts/` directory is copied, but `.dockerignore` excludes test files:

- `scripts/test-docker/**`
- `scripts/test-scaffold/**`
- `scripts/**/__tests__/**`

However, we still include `scripts/**` in path filters because:

1. Changes to test files might indicate production script changes
2. Simpler filter reduces maintenance burden
3. Test changes don't affect the final image (excluded by .dockerignore)

### 4. Excluded Paths Documentation

These paths should **NOT** trigger Docker builds:

```yaml
# Excluded from path filters (not copied into image)
paths-ignore:
  - "docs/**"
  - "i18n/**"
  - "static/**"
  - ".github/**"
  - "**.md"
  - "context/**"
  - "assets/**"
  - "test-*.json"
  - "test-*.html"
```

## GitHub Actions Path Filter Behavior

### paths vs paths-ignore

| Configuration  | Behavior                                        |
| -------------- | ----------------------------------------------- |
| `paths` only   | Workflow runs ONLY if matched paths change      |
| `paths-ignore` | Workflow runs UNLESS matched paths change       |
| Both           | `paths-ignore` is evaluated first, then `paths` |

### Recommendation: Use `paths` Only

Using `paths` only (without `paths-ignore`) is clearer and more explicit:

- Easy to verify against Dockerfile COPY instructions
- Prevents accidental builds from unrelated changes
- Clearer intent for reviewers

## Path Filter Validation Test Cases

### Should Trigger Build ✅

| File Change                   | Reason                     |
| ----------------------------- | -------------------------- |
| `Dockerfile`                  | Image definition changed   |
| `.dockerignore`               | Build context changed      |
| `package.json`                | Dependencies changed       |
| `bun.lockb`                   | Lockfile changed           |
| `scripts/api-server/index.ts` | Copied into image          |
| `src/client/index.ts`         | Copied into image          |
| `tsconfig.json`               | TypeScript config changed  |
| `docusaurus.config.ts`        | Imported by client modules |

### Should NOT Trigger Build ❌

| File Change                            | Reason                                    |
| -------------------------------------- | ----------------------------------------- |
| `docs/introduction.md`                 | Not copied (excluded by .dockerignore)    |
| `static/images/logo.png`               | Not copied (excluded by .dockerignore)    |
| `i18n/pt/code.json`                    | Not copied (excluded by .dockerignore)    |
| `.github/workflows/test.yml`           | CI/CD only (excluded by .dockerignore)    |
| `README.md`                            | Documentation (excluded by .dockerignore) |
| `context/workflows/notion-commands.md` | Documentation (excluded by .dockerignore) |
| `scripts/test-docker/test.ts`          | Test file (excluded by .dockerignore)     |

## Transitive Dependencies

### src/client Imports

The `src/client/` modules import from `docusaurus.config.ts`, which is why both are included:

```typescript
// src/client/index.ts may import:
import docusaurusConfig from "../../docusaurus.config.ts";
```

Therefore, changes to either file require a rebuild.

### scripts Directory

The scripts directory is self-contained with no external runtime dependencies on:

- Configuration files (uses env vars)
- Content files (generates from Notion API)
- Test files (excluded from production image)

## Advanced Path Filtering Scenarios

### Scenario 1: Shared Dependencies

If `src/client` imports from outside its directory:

```typescript
import { utility } from "../utils/helper.ts"; // Hypothetical
```

Then `src/utils/**` must also be added to path filters.

**Current Status**: No such imports exist (verified by code analysis).

### Scenario 2: Conditional COPY

If Dockerfile uses build arguments to conditionally copy files:

```dockerfile
ARG INCLUDE_EXTRAS
COPY --chown=bun:bun src/extras${INCLUDE_EXTRAS:+/enabled} ./src/extras
```

Then conditional paths must be included in filters.

**Current Status**: No conditional COPY statements in Dockerfile.

### Scenario 3: Multi-Stage Dependencies

If a later stage depends on an earlier stage's files:

```dockerfile
FROM base AS deps
COPY package.json ./

FROM deps AS runner
COPY --from=deps /app/node_modules ./node_modules
```

Only files in the final `runner` stage matter for path filtering.

**Current Status**: All copied files end up in final `runner` stage.

## Implementation Recommendations

### 1. Primary Workflow: docker-publish.yml

```yaml
name: Docker Publish

on:
  push:
    branches:
      - main
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "package.json"
      - "bun.lockb*"
      - "scripts/**"
      - "src/client/**"
      - "tsconfig.json"
      - "docusaurus.config.ts"
  pull_request:
    branches:
      - main
    paths:
      - "Dockerfile"
      - ".dockerignore"
      - "package.json"
      - "bun.lockb*"
      - "scripts/**"
      - "src/client/**"
      - "tsconfig.json"
      - "docusaurus.config.ts"
  workflow_dispatch:
    inputs:
      tag:
        description: "Docker image tag (default: auto-detected)"
        required: false
        type: string
```

### 2. Manual Override

Always include `workflow_dispatch` to allow manual builds regardless of path changes:

```yaml
workflow_dispatch:
  inputs:
    reason:
      description: "Reason for manual build"
      required: false
      type: string
```

### 3. Testing Path Filters

Add a validation job to verify path filters match Dockerfile:

```yaml
jobs:
  validate-path-filters:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify path filters match Dockerfile
        run: |
          # Extract COPY paths from Dockerfile
          COPY_PATHS=$(grep -E "^COPY" Dockerfile | grep -oE '[a-zA-Z0-9_/\.]+' | tail -1)
          echo "Copied paths: $COPY_PATHS"

          # Compare with workflow paths filter
          # (implement comparison logic)
```

## Common Pitfalls

### Pitfall 1: Missing Transitive Dependencies

**Problem**: Path filter includes `src/client/**` but not `docusaurus.config.ts` which it imports.

**Solution**: Analyze all import statements and include imported files.

### Pitfall 2: Over-Broad Filters

**Problem**: Using `src/**` instead of specific subdirectories.

**Consequence**: Builds trigger on `src/theme/**` changes that aren't copied into image.

**Solution**: Be specific: `src/client/**` not `src/**`.

### Pitfall 3: Ignoring .dockerignore

**Problem**: Path filter includes files that .dockerignore excludes.

**Consequence**: Builds trigger unnecessarily (though doesn't affect image content).

**Solution**: Cross-reference .dockerignore exclusions.

### Pitfall 4: Case Sensitivity

**Problem**: Path filters are case-sensitive on GitHub Actions (Linux runners).

**Example**: `Dockerfile` ✅ vs `dockerfile` ❌

**Solution**: Use exact casing from repository.

## Path Filter Maintenance

### When to Update Path Filters

Update path filters when:

1. Dockerfile COPY instructions change
2. New source files import previously excluded files
3. .dockerignore patterns change
4. Application architecture changes (new dependencies)

### Update Process

1. Review Dockerfile COPY instructions
2. Identify all copied files and directories
3. Check .dockerignore for exclusions
4. Analyze transitive dependencies (imports)
5. Update workflow path filters
6. Add test case for new path
7. Document change in commit message

## Verification Checklist

Before finalizing path filters:

- [ ] All Dockerfile COPY instructions are covered
- [ ] No .dockerignore exclusions are included
- [ ] Transitive dependencies (imports) are covered
- [ ] Wildcard patterns are correct (`**` vs `*`)
- [ ] File casing matches repository exactly
- [ ] Test cases documented for both trigger and non-trigger paths
- [ ] Manual override available via workflow_dispatch

## References

- [GitHub Actions: Workflow triggers for paths](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#triggering-a-workflow-on-changes-to-specific-paths)
- [Dockerfile reference: COPY](https://docs.docker.com/engine/reference/builder/#copy)
- [.dockerignore file](https://docs.docker.com/engine/reference/builder/#dockerignore-file)
- [Docker buildx: Build context](https://docs.docker.com/build/building/context/)

## Appendix: Complete Path Analysis

### File-by-File Analysis

| File                   | In Dockerfile?   | In .dockerignore? | In Path Filter? | Reason                |
| ---------------------- | ---------------- | ----------------- | --------------- | --------------------- |
| `Dockerfile`           | N/A (definition) | Yes (133)         | ✅ Yes          | Image definition      |
| `.dockerignore`        | N/A (context)    | N/A               | ✅ Yes          | Affects build context |
| `package.json`         | ✅ Yes (16, 52)  | No                | ✅ Yes          | Dependencies          |
| `bun.lockb`            | ✅ Yes (16, 52)  | No                | ✅ Yes          | Lockfile              |
| `scripts/api-server/`  | ✅ Yes (54)      | No                | ✅ Yes          | Copied to image       |
| `scripts/test-docker/` | ⚠️ Partial (54)  | ✅ Yes (147)      | ✅ Yes          | Part of scripts/\*\*  |
| `src/client/`          | ✅ Yes (59)      | No                | ✅ Yes          | Copied to image       |
| `src/theme/`           | ❌ No            | No                | ❌ No           | Not copied            |
| `docusaurus.config.ts` | ✅ Yes (56)      | No                | ✅ Yes          | Imported by client    |
| `tsconfig.json`        | ✅ Yes (57)      | No                | ✅ Yes          | TS config             |
| `docs/`                | ❌ No            | ✅ Yes (26)       | ❌ No           | Generated content     |
| `i18n/`                | ❌ No            | ✅ Yes (27)       | ❌ No           | Localized content     |
| `static/images/`       | ❌ No            | ✅ Yes (28)       | ❌ No           | Assets                |
| `.github/`             | ❌ No            | ✅ Yes (50)       | ❌ No           | CI/CD only            |
| `context/`             | ❌ No            | ✅ Yes (63)       | ❌ No           | Documentation         |
| `README.md`            | ❌ No            | ✅ Yes (59)       | ❌ No           | Documentation         |

### Legend

- ✅ **Yes**: Should be included
- ❌ **No**: Should not be included
- ⚠️ **Partial**: Partially included (scripts includes test subdirs, but .dockerignore excludes them from image)

---

**Document Version**: 1.0
**Last Updated**: 2026-02-09
**Status**: Research Complete ✅
