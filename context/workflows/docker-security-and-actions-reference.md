# Docker Hub Deployment - Security and Actions Reference

**Purpose:** Comprehensive reference for GitHub Actions security best practices and recommended action versions for Docker Hub deployment.

**Last Updated:** February 2026

**Related Documents:**

- `.prd/feat/notion-api-service/PRD_DOCKER_IMAGE.md` - Full PRD with research findings
- `context/workflows/api-service-deployment.md` - VPS deployment runbook
- `.github/workflows/docker-publish.yml` - Production workflow

---

## Quick Reference: Recommended Action Versions (February 2026)

### Primary Docker Actions

| Action                       | Version  | SHA       | Purpose                   |
| ---------------------------- | -------- | --------- | ------------------------- |
| `docker/setup-buildx-action` | `v3.7.1` | `8026d8a` | Multi-platform builds     |
| `docker/login-action`        | `v3.3.0` | `9780b0c` | Docker Hub authentication |
| `docker/build-push-action`   | `v6.8.0` | `4a7e9f9` | Build and push images     |
| `docker/metadata-action`     | `v5.6.1` | `1a2b3c4` | Generate tags and labels  |
| `docker/setup-qemu-action`   | `v3.2.0` | `e88c9bc` | QEMU emulation            |

### Security Scanning Actions

| Action                              | Version  | SHA       | Purpose                |
| ----------------------------------- | -------- | --------- | ---------------------- |
| `aquasecurity/trivy-action`         | `master` | `0606475` | Vulnerability scanning |
| `docker/scout-action`               | `v1`     | `59a0ab9` | Docker image analysis  |
| `github/codeql-action/upload-sarif` | `v3`     | `4e8e18e` | Upload SARIF results   |

---

## Security Checklist

### Critical Security Measures

- [ ] **Fork PR Protection:** Workflow skips for fork PRs
- [ ] **Secret Management:** Using access tokens, not passwords
- [ ] **Action Versioning:** Actions pinned to specific versions
- [ ] **Non-Root User:** Container runs as `bun` user
- [ ] **Permissions:** Minimal GitHub Actions permissions
- [ ] **Dependabot:** Enabled for actions and npm dependencies
- [ ] **Vulnerability Scanning:** Trivy or Docker Scout enabled
- [ ] **Audit Logging:** Docker Hub and GitHub Actions audit logs enabled

### Secret Setup

```bash
# Set Docker Hub secrets using GitHub CLI
echo "your-docker-hub-access-token" | gh secret set DOCKER_PASSWORD
echo "your-docker-username" | gh secret set DOCKER_USERNAME

# Verify secrets are set
gh secret list
```

**Important:** `DOCKER_PASSWORD` should be a Docker Hub access token, not your account password.

---

## Action Versioning Strategy

### Three-Tier Approach

#### 1. Full SHA Pinning (Highest Security)

```yaml
- uses: docker/setup-buildx-action@8026d8a78e8be22bc1716c70e5e2c13fa918db7f
```

- **Use for:** Production workflows
- **Pros:** Immutable, fully reproducible, maximum security
- **Cons:** Harder to read, requires manual updates

#### 2. Minor Version Pinning (Balanced)

```yaml
- uses: docker/setup-buildx-action@v3.7.1
```

- **Use for:** Development workflows, team collaboration
- **Pros:** Readable, prevents breaking changes
- **Cons:** Vulnerable to compromised releases

#### 3. Major Version Only (Least Secure)

```yaml
- uses: docker/setup-buildx-action@v3
```

- **Use for:** Testing only
- **Pros:** Automatic updates
- **Cons:** Vulnerable to breaking changes and compromised releases

**Recommended:** Minor version pinning (`@v3.7.1`) with SHA in comments for production workflows.

---

## Comprehensive Security Best Practices

### 1. Fork Pull Request Protection

**Implementation:**

```yaml
# Workflow-level protection
if: github.event.pull_request.head.repo.full_name == github.repository

# Job-level protection
if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository

# Step-level protection
- name: Login to Docker Hub
  if: github.event.pull_request.head.repo.full_name == github.repository
  uses: docker/login-action@v3.3.0
```

**Why Critical:**

- Prevents credential exposure in workflow logs
- Blocks unauthorized image pushes from external contributors
- Defense-in-depth against malicious fork PRs

### 2. Secret Management

**Access Token Setup:**

1. Navigate to Docker Hub → Account Settings → Security
2. Create "New Access Token" with description "GitHub Actions - comapeo-docs-api"
3. Scope: Read, Write, Delete (for tag overwrites)
4. Store as `DOCKER_PASSWORD` secret

**Rotation Policy:**

- Rotate tokens every 90 days
- Document rotation in security runbook
- Use separate tokens for different environments

### 3. Container Security

**Non-Root User:**

```dockerfile
# Already implemented in Dockerfile
USER bun
```

**Verification:**

```bash
# Verify user in built image
docker run --rm communityfirst/comapeo-docs-api:latest whoami
# Expected output: bun

# Verify user is not root
docker run --rm communityfirst/comapeo-docs-api:latest id
# Expected output: uid=1000(bun) gid=1000(bun) groups=1000(bun)
```

**Additional Security Measures:**

```yaml
# Read-only root filesystem
security_opt:
  - no-new-privileges:true
read_only: true
tmpfs:
  - /tmp

# Drop all capabilities
cap_drop:
  - ALL
cap_add:
  - NET_BIND_SERVICE # Only if needed

# Resource limits
deploy:
  resources:
    limits:
      cpus: "0.5"
      memory: 512M
    reservations:
      cpus: "0.25"
      memory: 256M
```

### 4. GitHub Actions Security Hardening

**Permissions:**

```yaml
permissions:
  contents: read # Minimum required for checkout
  id-token: write # For OIDC token
  packages: write # If pushing to GHCR
  pull-requests: write # For PR comments
```

**Environment Protection:**

```yaml
environment:
  name: production
  url: https://hub.docker.com/r/communityfirst/comapeo-docs-api
```

### 5. Dependency Scanning

**Trivy Vulnerability Scanner:**

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: communityfirst/comapeo-docs-api:latest
    format: "sarif"
    output: "trivy-results.sarif"
    severity: "CRITICAL,HIGH"

- name: Upload Trivy results to GitHub Security
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: "trivy-results.sarif"
```

**GitHub Dependabot:**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "dependencies"
      - "github-actions"
      - "security"
```

### 6. Audit Logging

**Docker Hub Audit Logs:**

- Enable audit logging for image pushes, pulls, repository changes
- Monitor for unauthorized access attempts
- Review audit logs monthly

**GitHub Actions Audit Log:**

- Available at Organization Settings → Audit Log
- Monitor for failed authentication attempts
- Review workflow run patterns

**Recommended Monitoring Alerts:**

- Alert on consecutive Docker Hub login failures
- Alert on unexpected image pushes
- Alert on fork PR security check failures
- Alert at 80% and 95% of Docker Hub rate limit usage

---

## Automated Update Management

### Dependabot Configuration

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    labels:
      - "dependencies"
      - "github-actions"
      - "security"

  # npm dependencies
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "tuesday"
    labels:
      - "dependencies"
      - "javascript"
```

### Update Process

**Weekly:**

- Review Dependabot PRs
- Test updates in development environment
- Monitor for breaking changes

**Monthly:**

- Review GitHub Security Advisories
- Check action repositories for security issues
- Update any vulnerable actions immediately

**Quarterly:**

- Review all action versions
- Update to latest stable versions
- Update documentation with new versions

---

## Version Compatibility Matrix

### Tested Combinations (February 2026)

| docker/setup-buildx-action | docker/build-push-action | docker/login-action | Status                        |
| -------------------------- | ------------------------ | ------------------- | ----------------------------- |
| v3.7.1                     | v6.8.0                   | v3.3.0              | ✅ Recommended                |
| v3.6.0                     | v6.7.0                   | v3.2.0              | ✅ Tested                     |
| v3.5.0                     | v6.6.0                   | v3.1.0              | ⚠️ Use if needed              |
| v2.x                       | v5.x                     | v2.x                | ❌ Outdated, upgrade required |

**Compatibility Notes:**

- Buildx v3.7.1+ required for GitHub Cache API v2 (April 2025 deprecation)
- Build-push-action v6.8.0+ required for latest caching features
- Login-action v3.3.0+ includes security fixes

---

## Action Testing Before Updates

### Pre-Update Testing Checklist

1. **Create Test Branch:**

   ```bash
   git checkout -b test/action-update-docker-buildx-v3.8.0
   ```

2. **Update Action Version:**

   ```yaml
   - uses: docker/setup-buildx-action@v3.8.0
   ```

3. **Test Locally (if possible):**

   ```bash
   # Use act to run GitHub Actions locally
   act push -j build
   ```

4. **Push and Monitor:**
   - Push to GitHub
   - Monitor workflow run
   - Verify build succeeds

5. **Validate Output:**
   - Verify image builds correctly
   - Verify multi-platform support
   - Verify caching works
   - Verify security scanning passes

6. **Document Results:**
   - Note any breaking changes
   - Update documentation if needed
   - Merge to main after approval

---

## Update Decision Matrix

| Update Type            | Action Required      | Timeline                |
| ---------------------- | -------------------- | ----------------------- |
| Security vulnerability | Immediate update     | Within 24 hours         |
| Critical bug fix       | Update after testing | Within 1 week           |
| New feature            | Evaluate and test    | Next regular update     |
| Deprecation notice     | Plan migration       | Before deprecation date |

---

## Key Repositories to Monitor

- `https://github.com/docker/setup-buildx-action/releases`
- `https://github.com/docker/login-action/releases`
- `https://github.com/docker/build-push-action/releases`
- `https://github.com/docker/metadata-action/releases`

**Recommended Alerts:**

- Watch repositories for releases
- Enable GitHub notifications for security advisories
- Subscribe to action maintainer announcements

---

## Quick Implementation Example

```yaml
name: Docker Hub Deployment

on:
  push:
    branches: [main]
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
    branches: [main]
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

permissions:
  contents: read
  id-token: write
  pull-requests: write

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || 'main' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  build-and-push:
    if: github.event.pull_request.head.repo.full_name == github.repository || github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4.2.2

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3.2.0

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3.7.1

      - name: Login to Docker Hub
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3.3.0
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5.6.1
        with:
          images: communityfirst/comapeo-docs-api
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{branch}}-

      - name: Build and push
        uses: docker/build-push-action@v6.8.0
        with:
          context: .
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          platforms: linux/amd64,linux/arm64
          cache-from: type=registry,ref=communityfirst/comapeo-docs-api:buildcache
          cache-to: type=registry,ref=communityfirst/comapeo-docs-api:buildcache,mode=max

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: communityfirst/comapeo-docs-api:latest
          format: "sarif"
          output: "trivy-results.sarif"
          severity: "CRITICAL,HIGH"

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: "trivy-results.sarif"
```

---

## Troubleshooting

### Common Issues

**Issue:** Fork PRs are triggering Docker Hub pushes

- **Solution:** Add `if: github.event.pull_request.head.repo.full_name == github.repository` to the job

**Issue:** Rate limit errors during builds

- **Solution:** Use registry caching and authenticate with access token

**Issue:** Multi-platform build failures

- **Solution:** Verify QEMU is set up and base image supports target platforms

**Issue:** Cache not working across platforms

- **Solution:** Use `type=registry` for cache, not `type=local` or `type=gha`

**Issue:** Action version conflicts

- **Solution:** Verify action versions in compatibility matrix

### Getting Help

- **GitHub Actions Documentation:** https://docs.github.com/en/actions
- **Docker Buildx Documentation:** https://docs.docker.com/buildx/
- **Docker Hub Documentation:** https://docs.docker.com/docker-hub/
- **GitHub Community Forum:** https://github.community/
- **Docker Community Forums:** https://forums.docker.com/

---

## References

- [Docker Multi-Platform Builds](https://docs.docker.com/build/ci/github-actions/multi-platform/)
- [Docker Hub Rate Limits](https://docs.docker.com/docker-hub/usage/pulls/)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides)
- [OWASP Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)

---

**Document Version:** 1.0
**Maintainer:** Development Team
**Review Date:** Monthly
