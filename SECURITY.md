# Security Policy

## Reporting Security Vulnerabilities

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please email security concerns to: [security@digital-democracy.org](mailto:security@digital-democracy.org)

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to respond to security reports within 48 hours.

## Security Measures

### Secret Scanning with Gitleaks

This repository uses [Gitleaks](https://github.com/gitleaks/gitleaks) to prevent accidental commits of secrets and API keys.

**Protected Secrets:**

- Notion API Keys (`NOTION_API_KEY`)
- OpenAI API Keys (`OPENAI_API_KEY`)
- Cloudflare API Tokens (`CLOUDFLARE_API_TOKEN`)
- Database IDs (`DATA_SOURCE_ID`, `DATABASE_ID`)
- Generic API keys and tokens

**How it works:**

1. Gitleaks runs automatically on every `git commit` via lefthook pre-commit hook
2. Staged files are scanned for secret patterns
3. Commits are blocked if secrets are detected
4. Developers must remove secrets before committing

**Installation:**
See [CONTRIBUTING.md](./CONTRIBUTING.md#installing-gitleaks) for installation instructions.

**Configuration:**

- Main config: `.gitleaks.toml`
- Pre-commit hook: `lefthook.yml`

### GitHub Secrets Management

Sensitive credentials are stored as GitHub Secrets and never committed to the repository:

**Required Secrets:**

- `NOTION_API_KEY` - Notion API integration key
- `DATA_SOURCE_ID` - Notion data source identifier
- `DATABASE_ID` - Notion database identifier (fallback)
- `OPENAI_API_KEY` - OpenAI API key for translations
- `CLOUDFLARE_API_TOKEN` - Cloudflare Pages deployment token
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account identifier

**Optional Secrets:**

- `SLACK_WEBHOOK_URL` - Slack notifications
- `TEST_DATA_SOURCE_ID` - Test database ID
- `TEST_DATABASE_ID` - Test database ID (fallback)
- `TEST_MODE` - Enable test mode

### Environment Variables

Never commit `.env` files with real credentials:

✅ **Safe:**

- `.env.example` - Template with placeholder values
- Environment variables in GitHub Actions workflows using `${{ secrets.* }}`

❌ **Never commit:**

- `.env` - Local environment file with real credentials
- Any file containing actual API keys or tokens
- Screenshots or logs containing secrets

### API Key Rotation

If a secret is exposed:

1. **Immediate Actions:**
   - Rotate the exposed key immediately
   - Update GitHub Secrets with new key
   - Update local `.env` files
   - Test that new key works

2. **For Notion API Keys:**

   ```bash
   # 1. Go to Notion → Settings & Members → Integrations
   # 2. Find your integration
   # 3. Click "Show" then "Regenerate" API key
   # 4. Update GitHub Secret: NOTION_API_KEY
   # 5. Update local .env file
   # 6. Test: bun run notion:fetch
   ```

3. **For OpenAI API Keys:**

   ```bash
   # 1. Go to OpenAI Platform → API Keys
   # 2. Revoke compromised key
   # 3. Create new key
   # 4. Update GitHub Secret: OPENAI_API_KEY
   # 5. Update local .env file
   # 6. Test: bun run notion:translate
   ```

4. **Document Incident:**
   - Create incident report (internal)
   - Track in security log
   - Update team on resolution

### Git History Exposure

If secrets are found in git history:

**Options:**

1. **Recommended: Rotate the secret**
   - Generate new API key/token
   - Update all references
   - Old key becomes invalid

2. **Advanced: Remove from history** (use with caution)
   - Use `git filter-branch` or BFG Repo-Cleaner
   - Requires force-push and team coordination
   - Only do this if repository is public and rotation is not sufficient

3. **Document the incident**
   - Track in security log
   - Notify affected parties
   - Implement prevention measures

### Dependencies Security

- **Automated scanning:** Dependabot enabled for security updates
- **Manual audits:** Regular dependency audits with `bun audit`
- **Update policy:** Security patches applied within 7 days

### Access Control

- **Repository access:** Limited to authorized team members
- **Secrets access:** GitHub Secrets only accessible to maintainers
- **Deployment access:** Production deployments restricted to authorized workflows

## Security Best Practices

### For Developers

1. **Never commit secrets:**
   - Use environment variables
   - Store in `.env` (gitignored)
   - Use GitHub Secrets for CI/CD

2. **Keep dependencies updated:**

   ```bash
   bun update
   bun audit
   ```

3. **Review security advisories:**
   - Check Dependabot alerts
   - Monitor security announcements

4. **Use secure connections:**
   - HTTPS for git operations
   - SSH keys for authentication
   - Enable 2FA on GitHub

5. **Verify gitleaks is running:**
   ```bash
   gitleaks version
   lefthook run pre-commit
   ```

### For Maintainers

1. **Rotate secrets regularly:**
   - Every 90 days (recommended)
   - Immediately after team member departure
   - After suspected exposure

2. **Review access permissions:**
   - Audit GitHub repository access quarterly
   - Review GitHub Secrets access
   - Remove inactive collaborators

3. **Monitor security logs:**
   - Review GitHub Security tab
   - Check Dependabot alerts weekly
   - Monitor deployment logs

4. **Incident response:**
   - Have incident response plan
   - Document all security incidents
   - Conduct post-incident reviews

## Security Incidents

### Incident Response Process

1. **Detection:** Security issue identified
2. **Assessment:** Determine severity and impact
3. **Containment:** Immediate actions to limit damage
4. **Eradication:** Remove vulnerability
5. **Recovery:** Restore normal operations
6. **Lessons Learned:** Post-incident review

### Severity Levels

- **P0 - Critical:** Exposed production secrets, data breach
- **P1 - High:** Exposed test/staging secrets, vulnerability in production
- **P2 - Medium:** Security misconfiguration, outdated dependencies
- **P3 - Low:** Informational, best practice improvements

## Compliance

This project follows:

- OWASP Top 10 security practices
- GitHub security best practices
- Industry standard secret management
- Regular security audits and reviews

## Security Updates

This security policy is reviewed quarterly and updated as needed.

**Last Updated:** 2026-02-11
**Next Review:** 2026-05-11

## Contact

For security concerns, contact:

- Email: security@digital-democracy.org
- GitHub: @digidem/security-team (for private security advisories)

---

**Thank you for helping keep CoMapeo Documentation secure!** 🔒
