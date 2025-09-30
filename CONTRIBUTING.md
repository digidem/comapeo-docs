# Contributing to CoMapeo Documentation

Thank you for your interest in contributing! This guide explains our two-branch workflow and how to contribute effectively.

## 📋 Table of Contents

- [Branch Strategy](#branch-strategy)
- [Contributing to Code](#contributing-to-code)
- [Contributing to Content](#contributing-to-content)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Pull Request Guidelines](#pull-request-guidelines)

## Branch Strategy

We use a **two-branch architecture** to separate code from generated content:

### `main` branch
**Purpose**: Source code, scripts, and configuration

**Contains**:
- TypeScript scripts (`scripts/`)
- React components (`src/`)
- Configuration files (`docusaurus.config.ts`, `package.json`, etc.)
- GitHub Actions workflows (`.github/workflows/`)
- Documentation tooling and build system

**For**: Developers working on documentation infrastructure, scripts, and site features

### `content` branch
**Purpose**: Generated documentation content from Notion CMS

**Contains**:
- Markdown documentation (`docs/`)
- Translations (`i18n/`)
- Images (`static/images/`)

**For**: Content automatically generated from Notion - **not for direct editing**

## Contributing to Code

### Setup

```bash
# Clone repository
git clone https://github.com/digidem/comapeo-docs.git
cd comapeo-docs

# Install dependencies
bun i

# Fetch content for local development
git fetch origin content
git checkout origin/content -- docs/ i18n/ static/images/

# Start development server
bun dev
```

### Making Changes

1. **Create feature branch** from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/your-feature-name
   ```

2. **Make your code changes** (src/, scripts/, .github/, etc.)

3. **Test locally** with content:
   ```bash
   # If you need fresh content
   git fetch origin content
   git checkout origin/content -- docs/ i18n/ static/images/

   # Test your changes
   bun dev
   bun run build
   bun test
   ```

4. **Push changes** and create PR targeting `main`:
   ```bash
   git add .
   git commit -m "feat: your descriptive commit message"
   git push origin feat/your-feature-name

   # Create PR via GitHub CLI
   gh pr create --base main
   ```

### Local Development Tips

**Option 1: Use Content Branch** (Recommended - Fast)
```bash
git fetch origin content
git checkout origin/content -- docs/ i18n/ static/images/
bun dev
```

**Option 2: Generate from Notion** (Requires API access)
```bash
# Setup .env with Notion credentials
cp .env.example .env
# Add NOTION_API_KEY and DATABASE_ID

# Generate content
bun notion:fetch
bun dev
```

**Option 3: Git Worktree** (For multi-branch work)
```bash
# Create worktree for content branch
mkdir -p worktrees
git worktree add worktrees/content content

# Work in both directories simultaneously
cd worktrees/content  # View/explore content
cd ../..              # Work on code
```

## Contributing to Content

### ⚠️ Important: Content is Managed via Notion

Direct edits to the `content` branch are **not recommended** because:
- Content is automatically generated from Notion CMS
- Manual changes will be overwritten on next sync
- Content workflow is managed by automation

### To Update Content

**Primary Method** - Edit in Notion CMS:
1. Update content in Notion database
2. Trigger `Sync Notion Docs` workflow via GitHub Actions
3. Review changes in staging deployment (GitHub Pages)
4. Manually trigger production deployment when ready

### Emergency Content Hotfix

If immediate content fix is needed before Notion sync:

1. **Create branch from content**:
   ```bash
   git checkout content
   git pull origin content
   git checkout -b hotfix/urgent-content-fix
   ```

2. **Make minimal required changes**:
   ```bash
   # Edit specific files only
   git add docs/specific-file.md
   git commit -m "hotfix: fix critical typo in installation guide"
   ```

3. **Create PR targeting content branch**:
   ```bash
   git push origin hotfix/urgent-content-fix
   gh pr create --base content
   ```

4. **⚠️ Important**: Also update Notion to prevent reversion on next sync

5. **Document hotfix**: Explain why emergency fix was needed in PR description

## Development Setup

### Prerequisites

- **Node.js** >= 18.0
- **Bun** (recommended) or npm
- **Git**
- **GitHub CLI** (optional, for PR creation)

### Environment Variables

```bash
# Required for Notion integration (optional for most contributors)
NOTION_API_KEY=your_notion_api_key
DATABASE_ID=your_database_id

# Required for translations (optional)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4
```

### Directory Structure

```
comapeo-docs/
├── .github/workflows/     # CI/CD workflows
├── docs/                  # Generated content (from content branch)
├── i18n/                  # Generated translations (from content branch)
├── scripts/               # Notion sync and build scripts
├── src/                   # Docusaurus customizations
│   ├── components/        # React components
│   ├── css/              # Custom styles
│   ├── pages/            # Custom pages
│   └── theme/            # Theme overrides
├── static/
│   ├── images/           # Generated images (from content branch)
│   └── img/              # Static assets
├── docusaurus.config.ts  # Docusaurus configuration
├── package.json          # Dependencies and scripts
└── README.md             # Project documentation
```

## Testing

### Run Tests

```bash
# Run all tests
bun test

# Run specific test suite
bun test:scripts
bun test:notion-fetch

# Run tests in watch mode
bun test:watch

# Run with coverage
bun test:coverage
```

### Type Checking

```bash
# Type check entire project
bun run typecheck
```

### Linting

```bash
# Lint and auto-fix
bun run lint

# Lint only (no fixes)
bun run lint --no-fix
```

### Build Testing

```bash
# Test production build
bun run build

# Serve production build locally
bun run serve
```

## Pull Request Guidelines

### PR Title Format

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat:` - New feature or functionality
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test additions or changes
- `style:` - Code style/formatting changes
- `perf:` - Performance improvements

**Examples**:
- `feat: add dark mode toggle to documentation site`
- `fix: resolve broken links in sidebar navigation`
- `docs: update contribution guidelines for two-branch workflow`
- `chore: upgrade Docusaurus to v3.9`

### PR Description Template

```markdown
## Summary
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Other (describe)

## Testing
Describe testing performed:
- [ ] Ran `bun test` - all tests pass
- [ ] Ran `bun run typecheck` - no errors
- [ ] Ran `bun run build` - build succeeds
- [ ] Tested locally with `bun dev`
- [ ] Verified on different browsers (if UI change)

## Screenshots
(If applicable, add screenshots of UI changes)

## Related Issues
Closes #issue-number
Relates to #other-issue
```

### PR Checklist

Before submitting PR:

- [ ] **Code quality**
  - [ ] Follows existing code style
  - [ ] No linting errors (`bun run lint`)
  - [ ] Type checking passes (`bun run typecheck`)
- [ ] **Testing**
  - [ ] All tests pass (`bun test`)
  - [ ] New tests added for new functionality
  - [ ] Tested locally with real content
- [ ] **Documentation**
  - [ ] README updated if needed
  - [ ] Code comments added for complex logic
  - [ ] CONTRIBUTING.md updated if workflow changes
- [ ] **Git**
  - [ ] Commit messages follow Conventional Commits
  - [ ] Branch name descriptive (feat/*, fix/*, docs/*, etc.)
  - [ ] No merge conflicts with base branch

### Review Process

1. **Automated checks** run on PR creation
2. **Maintainer review** - may request changes
3. **Approval** - at least one maintainer approval required
4. **Merge** - Squash and merge (preferred) or standard merge

### After PR is Merged

- Feature branch is automatically deleted
- Changes deploy to staging automatically
- Production deployment is manual (maintainers only)

## Code Style Guidelines

### TypeScript/JavaScript

- Use TypeScript for new files
- Use 2 spaces for indentation
- Use double quotes for strings
- Use semicolons
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Use async/await over promises

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use TypeScript interfaces for props
- PascalCase for component names

### File Naming

- **React components**: `PascalCase.tsx` (e.g., `HomepageFeatures.tsx`)
- **Scripts**: `kebab-case.ts` (e.g., `notion-fetch.ts`)
- **Documentation**: `kebab-case.md` (e.g., `contributing-guidelines.md`)
- **Utilities**: `camelCase.ts` (e.g., `imageProcessor.ts`)

## Questions or Issues?

- **Code/Infrastructure Issues**: [Open an issue](https://github.com/digidem/comapeo-docs/issues/new)
- **Content Issues**: Update in Notion CMS or contact content team
- **General Questions**: Use GitHub Discussions or team chat

## Additional Resources

- [Docusaurus Documentation](https://docusaurus.io/docs)
- [Notion API Documentation](https://developers.notion.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)

---

**Thank you for contributing to CoMapeo Documentation!** 🎉