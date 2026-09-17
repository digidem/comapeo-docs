# Rollback Procedures

Guide for rolling back production content or application deployments.

## 1. Content Rollback (Production Content Issues)

Production content is locked to an exact commit on the `content` branch via `content-lock.sha` on `main`.

If bad or broken content goes live on production:

### Quick Rollback via Actions UI

1. Open **Actions** → **Deploy to Production**.
2. Click **Run workflow**.
3. In **Content SHA**, input the previous known-good commit SHA from the `content` branch (find recent SHAs in git log or the [commit history of the content branch](https://github.com/digidem/comapeo-docs/commits/content)).
4. Run the workflow. This immediately deploys the good SHA and promotes it to `content-lock.sha` on `main`.

### CLI Rollback

```bash
# 1. Identify previous good content commit
git log origin/content --oneline -n 5

# 2. Trigger production deploy with that SHA
gh workflow run deploy-production.yml -f environment=production -f content_sha=<PREVIOUS_GOOD_SHA>
```

See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md#rollback-revert-to-previous-content) for full details.

---

## 2. Site Code Rollback (Docusaurus / Frontend Regressions)

If a regression was introduced by a code commit to `main`:

```bash
# 1. Create a revert commit on a branch
git checkout -b revert/issue-fix
git revert <BAD_COMMIT_SHA>

# 2. Push and open PR
git push origin HEAD -u
gh pr create --base main --title "revert: rollback <feature> due to regression"

# 3. Merge PR
# Once merged to main, GitHub Actions automatically deploys the updated code to Cloudflare Pages
```

---

## 3. Historical Reference: Notion Fetch Retry Feature (Retired)

The in-repo image processing retry feature and legacy `notion:fetch*` scripts have been retired. Content generation and image processing are now handled upstream in `../comapeo-content-pipeline/`.
