# PRD - Docker Hub Deployment GitHub Action

## Research & Discovery

- [ ] Research GitHub Actions Docker build and push best practices for multi-platform images
- [ ] Research Docker Hub authentication patterns using GitHub Actions secrets
- [ ] Research tagging strategies for main branch vs PR preview builds
- [ ] Research path filtering triggers for Dockerfile and related files
- [ ] Research Docker Hub rate limits and caching strategies
- [ ] Document findings including recommended actions versions and security considerations

### Review: Research Summary

- [ ] Review research findings and confirm approach with existing repo workflow patterns
- [ ] Verify Docker Hub repository naming and access permissions
- [ ] Confirm oven/bun base image supports multi-platform builds (amd64, arm64)

## Specification

- [ ] Create workflow specification document defining trigger conditions, tag naming, and platform support
- [ ] Define path filtering rules matching Dockerfile COPY dependencies:
  - `Dockerfile` - The image definition itself
  - `.dockerignore` - Controls build context inclusion (affects resulting image)
  - `package.json`, `bun.lockb*` - Dependency definitions
  - `scripts/**` - Entire scripts directory is copied
  - `src/client/**` - Client modules referenced by docusaurus.config.ts
  - `tsconfig.json` - TypeScript configuration
  - `docusaurus.config.ts` - Imported by client modules
  - EXCLUDE: `docs/**`, `static/**`, `i18n/**`, `.github/**`, `**.md` (not copied into image)
- [ ] Specify multi-platform build targets (linux/amd64, linux/arm64)
- [ ] Define secret requirements (DOCKER_USERNAME, DOCKER_PASSWORD)
- [ ] Document build cache strategy (registry cache type for multi-platform)
- [ ] Define concurrency strategy (cancel-in-progress: true for PRs, queue for main)
- [ ] Add workflow_dispatch trigger for manual builds with tag input

### Review: Specification

- [ ] Review specification for completeness and alignment with existing deploy-pr-preview.yml patterns
- [ ] Verify tag naming scheme matches Cloudflare Pages PR preview pattern (pr-{#})
- [ ] Confirm path filters accurately reflect Dockerfile COPY instructions

## Implementation: Docker Hub Repository

- [ ] Verify Docker Hub repository `communityfirst/comapeo-docs-api` exists
- [ ] If repository doesn't exist, create it in Docker Hub with appropriate visibility
- [ ] Confirm repository access permissions for the DOCKER_USERNAME account

### Review: Docker Hub Repository

- [ ] Verify repository is accessible and can be pushed to
- [ ] Confirm repository settings allow automated builds from GitHub Actions

## Implementation: GitHub Secrets Setup

- [ ] Document required GitHub secrets: DOCKER_USERNAME and DOCKER_PASSWORD
- [ ] Create setup instructions for Docker Hub access token generation (use access tokens, not passwords)
- [ ] Document that DOCKER_PASSWORD should be a Docker Hub access token, not account password
- [ ] Add secrets to GitHub repository Settings → Secrets and variables → Actions

### Review: Secrets Documentation

- [ ] Verify secret setup instructions are clear and complete
- [ ] Confirm secret naming follows security best practices

## Implementation: Workflow File

- [ ] Create `.github/workflows/docker-publish.yml` with multi-platform support
- [ ] Configure triggers:
  - `push` to main branch (with paths filter)
  - `pull_request` targeting main (with paths filter)
  - `workflow_dispatch` for manual builds with optional tag input
- [ ] Add security check: skip fork PRs (`if: github.event.pull_request.head.repo.full_name == github.repository`)
- [ ] Set up Docker Buildx action for multi-platform builds (linux/amd64, linux/arm64)
- [ ] Configure login to Docker Hub using DOCKER_USERNAME and DOCKER_PASSWORD secrets
- [ ] Define tag logic:
  - Main branch: `latest` tag + git commit SHA tag
  - PRs: `pr-{number}` tag (e.g., `pr-123`)
  - Manual: allow custom tag via input
- [ ] Set up registry cache type for multi-platform cache compatibility
- [ ] Configure concurrency groups:
  - PRs: `docker-pr-${{ github.event.pull_request.number }}` with cancel-in-progress
  - Main: `docker-main` without cancel (allow queue)
- [ ] Include PR comment with Docker image tag reference on PR builds (matches deploy-pr-preview.yml style)
- [ ] Add workflow status to job summary with image digest and tags

### Review: Workflow Implementation

- [ ] Review workflow syntax and action versions match repo patterns
- [ ] Verify path filters exactly match Dockerfile COPY instructions
- [ ] Confirm fork PR security check is present and correctly formatted
- [ ] Verify tag naming produces correct outputs for main, PRs, and manual builds
- [ ] Confirm concurrency configuration prevents conflicts while allowing main branch builds

## Testing: Main Branch Build

- [ ] Push a test commit to main that modifies a path-filtered file (e.g., add comment to Dockerfile)
- [ ] Verify GitHub Actions workflow triggers only on path-filtered changes
- [ ] Confirm multi-platform build completes successfully for both amd64 and arm64
- [ ] Verify image pushed to Docker Hub with both `latest` and commit SHA tags
- [ ] Pull image locally: `docker pull communityfirst/comapeo-docs-api:latest`
- [ ] Test API server starts: `docker run --rm -p 3001:3001 communityfirst/comapeo-docs-api:latest` and verify health endpoint responds
- [ ] Verify multi-platform manifest: `docker buildx imagetools inspect communityfirst/comapeo-docs-api:latest`

### Review: Main Branch Test

- [ ] Review build logs for any warnings or errors
- [ ] Verify image size is reasonable (<500MB expected for base + dependencies)
- [ ] Confirm manifest list contains both linux/amd64 and linux/arm64
- [ ] Test that image runs as non-root user (verify no permission errors)

## Testing: PR Preview Build

- [ ] Create a test PR that modifies a path-filtered file (e.g., update a script file)
- [ ] Verify workflow triggers and extracts PR number correctly
- [ ] Confirm image pushed to Docker Hub with `pr-{#}` tag
- [ ] Verify PR comment contains Docker image tag reference with pull instructions
- [ ] Pull PR image: `docker pull communityfirst/comapeo-docs-api:pr-{#}`
- [ ] Test PR image runs identically to latest tag

### Review: PR Preview Test

- [ ] Review PR comment formatting matches existing preview comment style
- [ ] Verify tag naming uses PR number without leading zeros (pr-7 not pr-007)
- [ ] Document that old PR tags are overwritten on PR number reuse (by design)

## Testing: Edge Cases

- [ ] Test that non-path-filtered changes (docs/\*_/_.md, .github/workflows/\*.yml) do NOT trigger build
- [ ] Test workflow_dispatch with custom tag name
- [ ] Verify workflow skips gracefully on unrelated changes
- [ ] Test concurrent PR builds don't conflict (same PR should cancel previous, different PRs run in parallel)
- [ ] Verify workflow fails appropriately on invalid Docker Hub credentials (clear error message)
- [ ] Test that fork PRs are skipped with log message explaining why (security check)
- [ ] Test that only path-filtered files trigger builds (modify README.md - no build; modify Dockerfile - build)

### Review: Edge Case Handling

- [ ] Review workflow behavior for all edge cases
- [ ] Confirm security measures prevent unauthorized builds from forks
- [ ] Verify error messages are clear and actionable

## Testing: Path Filter Validation

- [ ] Modify each path-filtered location individually and verify build triggers:
  - [ ] Dockerfile
  - [ ] .dockerignore
  - [ ] package.json
  - [ ] bun.lockb (lockfile only)
  - [ ] scripts/api-server/index.ts
  - [ ] src/client/index.ts
  - [ ] tsconfig.json
  - [ ] docusaurus.config.ts
- [ ] Modify non-path-filtered locations and verify NO build triggers:
  - [ ] docs/introduction.md
  - [ ] static/images/logo.png
  - [ ] .github/workflows/test.yml
  - [ ] README.md

### Review: Path Filter Validation

- [ ] Confirm path filters are neither too broad nor too narrow
- [ ] Verify all Dockerfile COPY dependencies are covered

## Documentation & Release

- [ ] Add workflow documentation to context/workflows/api-service-deployment.md (Docker Hub section)
- [ ] Document Docker image usage: pull commands, run examples, health check
- [ ] Document PR tag lifecycle (overwritten on PR reuse, no auto-cleanup)
- [ ] Run yamllint or equivalent on workflow YAML
- [ ] Create PR with workflow and documentation changes

### Review: Final

- [ ] Comprehensive review of all changes against specification
- [ ] Verify all tests pass and documentation is complete
- [ ] Confirm Docker Hub deployment is production-ready
- [ ] Verify workflow action versions are pinned to specific SHAs for security
