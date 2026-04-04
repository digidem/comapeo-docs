# CoMape Documentation Workflow


This document defines the official workflow for how CoMapeo documentation moves from Notion to staging and production.

---

# System Overview

Our system connects:

* Notion (editorial source of truth)
* API Server (content processing)
* GitHub (version control and automation)
* GitHub Pages (staging and production)
* Slack (notifications)

Notion is the source of truth.
GitHub is the automation and deployment engine.
Slack notifications are always sent from GitHub workflows — never directly from the API server.

---

# Architecture Principle

The API server never sends Slack notifications.

Instead:

1. The API server performs content operations.
2. It commits changes to the `content` branch.
3. That push triggers GitHub Actions.
4. GitHub Actions handle:

   * Deployments
   * Slack webhooks
   * Status reporting

This ensures all notifications are centralized and traceable inside GitHub.

---

# Editorial Lifecycle

The complete lifecycle of a page is:

Content Ready for Translation
→ Auto-translation generated
→ Ready to Publish
→ Draft Published (Staging)
→ Published (Production)

This separates translation generation, editorial review, staging validation, and production release.

---

# 1. Auto-Translate

Triggered from Notion → Runs on GitHub

Purpose: Generate translation drafts inside Notion.

When triggered:

* GitHub Actions runs the translation workflow.
* It fetches pages marked "Content Ready for Translation."
* It generates translations.
* It publishes translations back into Notion under the appropriate language pages.
* It updates the page status to "Auto-translation generated."
* GitHub sends a Slack notification with the result.

Important:

* If translation pages are blank or contain only empty strings, they are ignored.
* This workflow does not commit to the `content` branch.
* It does not deploy.
* It only updates Notion.

---

# 2. fetch-ready

Triggered from Notion → Runs on API Server

Purpose: Move reviewed content into GitHub and deploy to staging.

After translations are reviewed, the page is manually set to "Ready to Publish."

When triggered:

1. The API server fetches:

   * The English page
   * All available translations
2. It ignores any pages that are blank or contain only empty strings.
3. It converts content to Markdown.
4. It commits everything to the `content` branch.
5. It updates Notion status from "Ready to Publish" to "Draft Published."

After the commit:

* The push to `content` automatically triggers the GitHub Pages staging deployment.
* The staging deployment workflow runs automatically on every push to `main` or `content`.
* Slack webhooks are sent from that GitHub deployment workflow.

Important:

* The API server does not send Slack notifications.
* GitHub sends Slack notifications after the staging deploy completes.
* This step publishes content to staging only.

---

# 3. Deploy to Production

Triggered from Notion → Runs on GitHub

Purpose: Release documentation publicly.

When triggered:

* GitHub runs the production deployment workflow.
* It builds the site using:

  * `main` branch for application code
  * `content` branch for documentation
* It deploys to the production documentation system.

After successful deployment:

* The Notion status is updated to "Published."
* Slack notifications are sent from GitHub.

This is the final publishing step.

---

# Sensitive Actions (GitHub Only)

These actions are restricted and must be manually dispatched in GitHub.
They do not run from Notion.

---

# 4. Clean All

Manual GitHub Dispatch

Purpose: Reset the documentation layer.

This action:

* Deletes all content from the `content` branch.
* Fully clears generated documentation.

Slack notifications are sent from the GitHub workflow.

---

# 5. fetch-all

Manual GitHub Dispatch → Runs on API Server

Purpose: Full rebuild from Notion.

When triggered:

1. GitHub manually dispatches the workflow.
2. The API server fetches:

   * All valid English pages
   * All available translations
3. It filters out pages marked with removal tags.
4. It ignores pages that are blank or contain only empty strings.
5. It converts everything to Markdown.
6. It commits all content to the `content` branch.

After the commit:

* The push triggers the GitHub Pages staging deployment automatically.
* Slack notifications are sent from GitHub.

Important:

* This action rebuilds both English content and translations.

---

# Automatic Deployment Rules

* GitHub Pages staging runs automatically on every push to `main` or `content`.
* Production deployment runs only when explicitly triggered.
* Slack webhooks are always sent from GitHub workflows.
* The API server never sends Slack notifications directly.

---

# Design Philosophy

* Notion is the editorial source of truth.
* Translation generation is automated but requires human review.
* The API server transforms and commits content.
* GitHub controls deployment and notifications.
* Staging happens automatically on push.
* Production requires explicit release.
* Sensitive resets are GitHub-only.
* Empty or invalid translation pages are ignored.

