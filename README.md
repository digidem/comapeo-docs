# CoMapeo Documentation

Welcome to the documentation portal for the CoMapeo platform. This site is built with [Docusaurus](https://docusaurus.io/), which powers a modern static website and supports features like multilingual content and automatic Markdown generation from our Notion database.

### Installation

Install all dependencies with:

```
bun i
```

### Branch Architecture

This repository uses a **two-branch architecture** to separate code from generated content:

- **`main` branch**: Source code, TypeScript scripts, workflows, and configuration (~1MB)
- **`content` branch**: Generated documentation from Notion (docs/, i18n/, static/images/ ~29MB)

**Why separate branches?**
- Keeps main branch clean for code review and development
- Reduces repository clone time for contributors
- Separates content syncs from code changes
- Improves CI/CD performance and clarity

### Content Setup

Before local development, you need content files. Choose one of these methods:

**Option 1: Fetch from content branch** (Recommended - Fast)
```bash
git fetch origin content
git checkout origin/content -- docs/ i18n/ static/images/
```

**Option 2: Generate from Notion** (Requires API access)
1. Copy `.env.example` to `.env` and add your Notion API key and Database ID
2. Fetch content:
```bash
bun notion:fetch
```

### Notion Fetch Workflow

The `bun notion:fetch` script pulls structured content from Notion and rewrites local docs. Keep these rules in mind so the output matches your expectations:

- **Filter criteria**: Only pages where `Status` equals `Ready to publish` _and_ the `Parent item` relation is empty are treated as parent records. Pages that fail either check are skipped.
- **Sub-page grouping**: Parents must link their language variants through the `Sub-item` relation. Each linked child should set `Language` to `English`, `Spanish`, or `Portuguese`. Any other language values are ignored.
- **Element Type field drives layout**:
  - `Element Type = Page` exports markdown, regenerates frontmatter, rewrites remote images under `static/images/`, and tracks compression savings for the summary.
  - `Element Type = Toggle` creates a folder (plus `_category_.json` for English) and increments the “section folders” counter.
  - `Element Type = Heading` stores the heading for the next `Page` entry’s sidebar metadata and increments the “title sections applied” counter.
- **Summary counters**: The totals printed at the end reflect the actions above. Zeros mean no matching work occurred (for example, no toggles, no headings, or no images to optimize).
- **Translations**: When a non-English child page is processed, its title is written to `i18n/<locale>/code.json` using the parent’s English title as the key. Ensure those files exist before running the script.
- **Slug and edit URL**: Markdown frontmatter derives the slug and `custom_edit_url` from the parent title. Adjust the Notion title to change the generated path.
- **Safety checks**: Missing `NOTION_API_KEY` or `DATABASE_ID` cause the script to exit early after logging an error. Other runtime failures (such as image download issues) are logged and processing continues for remaining pages.

### Local Development

**Prerequisites**: Ensure you've fetched content using one of the methods in [Content Setup](#content-setup).

Launch a local development server with live reloading:

```bash
bun dev
```

This command opens your browser automatically and reflects changes immediately.

**Full local setup from scratch:**
```bash
# Clone repository
git clone https://github.com/digidem/comapeo-docs.git
cd comapeo-docs

# Install dependencies
bun i

# Fetch content from content branch (fast)
git fetch origin content
git checkout origin/content -- docs/ i18n/ static/images/

# Start development server
bun dev
```

### Build

Compile all content—including Markdown files fetched from Notion and integrated translations—into static assets by running:

```
bun build
```

The resulting files are placed in the `build` directory for deployment via any static hosting service.

### Deployment

#### How Deployment Works

Deployments use a **checkout strategy**:
1. Checkout `main` branch (code and scripts)
2. Overlay content files from `content` branch (docs, i18n, images)
3. Build the site with merged content
4. Deploy to hosting platform

This ensures deployments always use the latest code with the latest content.

#### Production Deployment (Cloudflare Pages)

The site automatically deploys to production at `https://docs.comapeo.app` via GitHub Actions when changes are pushed to the `main` branch. You can also trigger deployments manually:

**Manual Deployment:**

1. Go to the GitHub repository
2. Click **Actions** → **Deploy to Production**
3. Click **Run workflow** on the `main` branch

**API Deployment:**

```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{"event_type":"deploy-production"}'
```

**What happens during deployment:**

1. Site is built using `bun run build`
2. Static files are deployed to Cloudflare Pages
3. Notion pages with "Staging" status are updated to "Published"
4. "Date Published" is automatically set in Notion

**Required GitHub Secrets:**

- `CLOUDFLARE_API_TOKEN` - Cloudflare API token for deployment
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `NOTION_API_KEY` - Notion integration API key
- `DATABASE_ID` - Notion database ID

#### Alternative Deployment (GitHub Pages)

You can still deploy to GitHub Pages using:

- Using SSH:

```
USE_SSH=true bun deploy
```

- Without SSH (using GitHub credentials):

```
GIT_USER=<Your GitHub username> bun deploy
```

This method builds the site and pushes to the `gh-pages` branch.

### Notion Status Workflows

The project includes automated Notion status management workflows:

```bash
# Update translation status
bun run notionStatus:translation

# Move to draft status
bun run notionStatus:draft

# Publish content (sets published date)
bun run notionStatus:publish

# Production publishing (Staging → Published with date)
bun run notionStatus:publish-production
```

These workflows automatically update page statuses in your Notion database and set published dates when content moves to "Published" status.

### Customizing Admonition Colors

The site supports custom colors for Notion callouts (admonitions). To modify the color scheme:

1. **Open** `src/css/custom.css`
2. **Find** the "Custom Admonition Colors" section (around line 85)
3. **Modify** the hex color values for any admonition type:
   - `NOTE` (gray Notion callouts): Currently `#e5e4e2` (platinum/silver)
   - `TIP` (green Notion callouts): Currently `#22c55e` (green)
   - `INFO` (blue Notion callouts): Currently `#3b82f6` (blue)
   - `WARNING` (yellow Notion callouts): Currently `#f59e0b` (amber)
   - `DANGER` (red Notion callouts): Currently `#ef4444` (red)
   - `CAUTION` (orange Notion callouts): Currently `#f97316` (orange)

**Example**: To change NOTE admonitions to purple:

```css
/* NOTE admonitions (gray callouts from Notion) */
.admonition--note,
.admonition-note,
.alert--secondary,
div[class*="admonition"][class*="note"] {
  background-color: rgba(147, 51, 234, 0.1) !important;
  border-left-color: #9333ea !important;
  border-color: #9333ea !important;
}

/* Update the corresponding icon color */
.admonition-note .admonition-icon svg,
div[class*="admonition"][class*="note"] svg {
  fill: #9333ea !important;
}
```

Changes will be reflected immediately in development mode (`bun dev`).

### GitHub Actions Workflows

The repository includes several automated workflows for content management:

#### Content Workflows (Push to `content` branch)

**Sync Notion Docs** (`sync-docs.yml`)
- **Trigger**: Manual dispatch or repository dispatch
- **Purpose**: Fetches content from Notion and commits to `content` branch
- **Target Branch**: `content`
- **Environment**: Requires `NOTION_API_KEY` and `DATABASE_ID` secrets

**Translate Docs** (`translate-docs.yml`)
- **Trigger**: Manual dispatch or repository dispatch
- **Purpose**: Generates translations and commits to `content` branch
- **Target Branch**: `content`
- **Environment**: Requires `NOTION_API_KEY`, `DATABASE_ID`, `OPENAI_API_KEY`

**Fetch All Content for Testing** (`notion-fetch-test.yml`)
- **Trigger**: Manual dispatch with optional force mode
- **Purpose**: Tests complete content fetch from Notion
- **Target Branch**: `content`
- **Features**: Retry logic, detailed statistics, content validation

**Clean All Generated Content** (`clean-content.yml`)
- **Trigger**: Manual dispatch with confirmation
- **Purpose**: Removes all generated content from `content` branch
- **Target Branch**: `content`
- **Safety**: Requires explicit "yes" confirmation

#### Deployment Workflows (Read from both branches)

**Deploy to Staging** (`deploy-staging.yml`)
- **Trigger**: Push to `main`, manual dispatch, or after content sync
- **Process**: Checkout `main` + overlay `content` → build → deploy to GitHub Pages
- **URL**: https://digidem.github.io/comapeo-docs

**Deploy to Production** (`deploy-production.yml`)
- **Trigger**: Push to `main` or manual dispatch
- **Process**: Checkout `main` + overlay `content` → build → deploy to Cloudflare Pages
- **URL**: https://docs.comapeo.app

### Roadmap & Future Enhancements

- [ ] Develop a robust translation strategy to further enhance our multilingual support.
- [x] Integrate GitHub Actions for continuous deployment and automated publishing.
- [ ] Refine the Notion-to-Markdown integration for more dynamic updates.
