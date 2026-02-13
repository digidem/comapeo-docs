# Docker Hub Repository Research

## Verification Status

**Docker Hub Repository:** `digidem/comapeo-docs-api` ✅ (Not yet created)

**GitHub Repository:** `digidem/comapeo-docs`

## Discrepancy Note

The PRD document (`.prd/feat/notion-api-service/PRD_DOCKER_IMAGE.md`) references `communityfirst/comapeo-docs-api` as the Docker Hub repository. However:

1. **GitHub Organization**: `digidem` (verified via `gh repo view`)
2. **Docker Hub Organization**: `digidem` (verified to exist on Docker Hub)
3. **CommunityFirst Org**: Does not exist on GitHub (returns `null` via API)

**Conclusion**: The Docker Hub repository should be `digidem/comapeo-docs-api` to match the GitHub organization structure.

## Repository Setup Required

### Create Docker Hub Repository

The repository `digidem/comapeo-docs-api` needs to be created on Docker Hub:

1. Navigate to https://hub.docker.com/
2. Go to the `digidem` organization
3. Click "Create Repository"
4. Configure:
   - **Name**: `comapeo-docs-api`
   - **Visibility**: Public
   - **Description**: CoMapeo Documentation API Server - Notion API integration service
5. Click "Create"

### GitHub Actions Secrets

Add the following secrets to the GitHub repository:

| Secret Name       | Description             | How to Get                         |
| ----------------- | ----------------------- | ---------------------------------- |
| `DOCKER_USERNAME` | Docker Hub username     | Your Docker Hub account username   |
| `DOCKER_PASSWORD` | Docker Hub access token | Create access token (not password) |

#### Creating Docker Hub Access Token

1. Go to https://hub.docker.com/
2. Click your avatar → Account Settings → Security
3. Click "New Access Token"
4. Configure:
   - **Description**: "GitHub Actions - comapeo-docs-api"
   - **Access permissions**: Read, Write, Delete (required for tag overwrites)
5. Copy the token
6. Add as `DOCKER_PASSWORD` secret in GitHub repository settings

## Verification Script

A verification script has been created at `scripts/verify-docker-hub.ts` that checks:

1. Repository exists and is accessible
2. Credentials are valid (if provided)
3. Repository visibility and settings

### Usage

```bash
# Check if repository exists (no credentials required)
bun run scripts/verify-docker-hub.ts

# Verify credentials access
DOCKER_USERNAME=your_username DOCKER_PASSWORD=your_token bun run scripts/verify-docker-hub.ts
```

## Image Naming Convention

- **Full Image Name**: `digidem/comapeo-docs-api:TAG`
- **Base Name**: `comapeo-docs-api`
- **Organization**: `digidem`

### Tag Strategy

- `latest` - Most recent main branch build
- `git-sha` - Immutable commit reference (e.g., `a1b2c3d`)
- `pr-{number}` - Pull request preview builds (e.g., `pr-123`)

## Security Considerations

1. **Fork PR Protection**: Workflow should skip builds from fork PRs
2. **Access Token Scope**: Read, Write, Delete (minimum required for tag overwrites)
3. **Token Rotation**: Rotate tokens every 90 days
4. **No Passwords**: Use access tokens, never account passwords

## Next Steps

1. Create `digidem/comapeo-docs-api` repository on Docker Hub
2. Create Docker Hub access token
3. Add `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets to GitHub
4. Run verification script to confirm access
5. Implement GitHub Actions workflow for building and pushing images
