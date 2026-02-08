# Project Maintenance & Documentation Index

This document tracks the status of documentation files, pending reviews, and maintenance tasks.

## 📚 General Index

| File | Description | Status | Notes |
| :--- | :--- | :--- | :--- |
| `AGENTS.md` | Core instructions for AI agents. | **KEEP** | Primary guideline file. |
| `CLAUDE.md` | Duplicate of `AGENTS.md`. | **KEEP** | Redundant, but kept for compatibility. |
| `CONTRIBUTING.md` | Contribution guidelines. | **KEEP** | Essential for collaboration. |
| `NOTION_FETCH_ARCHITECTURE.md` | Architecture decisions. | **KEEP** | Reference for Notion fetch system. |
| `README.md` | Project entry point. | **KEEP** | Standard documentation. |
| `prompt.md` | Issue #120 context. | **KEEP** | Active for Cloudflare migration task. |
| `.prd/feat/notion-api-service/PRD-REVIEW.completed.md` | Task list for reviewing the Notion API Service. | **ARCHIVED** | Review completed. |
| `.prd/feat/notion-api-service/PRD-REVIEW-MAPPING.md` | Mapping of files to PRD requirements. | **ARCHIVED** | Reference for past review. |
| `.prd/feat/notion-api-service/PRD.completed.md` | Initial implementation PRD (blocked/refocused). | **ARCHIVED** | Reference for original proposal. |

## 📝 Pending Actions
- [x] **Complete Review**: Finalize tasks in `PRD.md` for `feat/notion-api-service`.
- [x] **Archive Reviews**: Once `feat/notion-api-service` is merged, move `PRD.md` and `PRD-REVIEW-MAPPING.md` to `.prd/`.
- [ ] **Issue #120**: Archive `prompt.md` to `context/development/` after closing the issue.
- [ ] **Cleanup**: Evaluate if `CLAUDE.md` can be safely removed.

## 🕒 Maintenance Log

### 2026-02-08
- Renamed `ROOT_MD_INDEX.md` to `MAINTENANCE.md` and refocused on active reviews.
- Deleted `TASK.md` and `comapeo-docs-preview-*.md` files.
- Archived technical specs and reports to `context/`.
- Organized `.prd/` directory structure to follow feature-based pattern.
- Archived `PRD.md` and `PRD-REVIEW-MAPPING.md` to `.prd/feat/notion-api-service/` after confirming completion.
