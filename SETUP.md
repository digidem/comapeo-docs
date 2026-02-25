# Comapeo Docs API Service - Setup Guide

**Status:** API server is embedded in this repository at `api-server/`

## Overview

The Comapeo Docs API Service provides programmatic access to Notion content management operations. It's a Bun-based API server that runs alongside the Docusaurus site.

---

## API Server Location

The API server lives in this repository:

- **Entry point:** `api-server/index.ts`
- **Run command:** `bun run api-server`
- **Port:** `3001` (default, configurable via `API_PORT`)

---

## Environment Variables

### Required for Full Functionality

| Variable         | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `NOTION_API_KEY` | Notion API authentication                                      |
| `DATABASE_ID`    | Target Notion database ID                                      |
| `API_KEY_*`      | API keys for authentication (e.g., `API_KEY_MY_KEY=secret123`) |

### Optional

| Variable         | Default     | Description       |
| ---------------- | ----------- | ----------------- |
| `API_PORT`       | `3001`      | Server port       |
| `API_HOST`       | `localhost` | Server hostname   |
| `OPENAI_API_KEY` | -           | For translations  |
| `OPENAI_MODEL`   | `gpt-4`     | Translation model |

---

## Running the API Server

```bash
# Development
bun run api-server

# Custom port
API_PORT=8080 bun run api-server

# With API key
API_KEY_ADMIN=secret123 bun run api-server
```

---

## API Endpoints

| Method | Path          | Auth | Description                                       |
| ------ | ------------- | ---- | ------------------------------------------------- |
| GET    | `/health`     | No   | Health check                                      |
| GET    | `/docs`       | No   | OpenAPI documentation                             |
| GET    | `/jobs/types` | No   | List available job types                          |
| GET    | `/jobs`       | Yes  | List jobs (supports `?status=`, `?type=` filters) |
| POST   | `/jobs`       | Yes  | Create a new job                                  |
| GET    | `/jobs/:id`   | Yes  | Get job status                                    |
| DELETE | `/jobs/:id`   | Yes  | Cancel a job                                      |

### Job Types

| Type                               | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `notion:fetch`                     | Fetch pages from Notion                       |
| `notion:fetch-all`                 | Fetch all pages from Notion                   |
| `notion:count-pages`               | Count pages in Notion database                |
| `notion:translate`                 | Translate content                             |
| `notion:status-translation`        | Update status for translation workflow        |
| `notion:status-draft`              | Update status for draft publish workflow      |
| `notion:status-publish`            | Update status for publish workflow            |
| `notion:status-publish-production` | Update status for production publish workflow |

---

## Authentication

### Enabling Authentication

Set one or more `API_KEY_*` environment variables:

```bash
API_KEY_ADMIN=secret123 API_KEY_READONLY=read456 bun run api-server
```

### Using Authenticated Endpoints

```bash
# Include in requests
curl -H "Authorization: Bearer <your-api-key>" \
  http://localhost:3001/jobs
```

---

## API Reference

Full API documentation is available at: `context/api-server/reference.md`

This includes:

- Request/response schemas
- Error codes
- CORS configuration
- Job options

---

## Deployment

### Docker

The API server is included in the Docker image:

```bash
# Build
docker build -t comapeo-docs .

# Run
docker run -p 3001:3001 \
  -e NOTION_API_KEY=... \
  -e DATABASE_ID=... \
  -e API_KEY_ADMIN=... \
  comapeo-docs
```

### Production VPS

The production API server URL is configured per deployment. Contact the administrator or check deployment configuration for the production endpoint.

---

## Related Documentation

- API Reference: `context/api-server/reference.md`
- API Server Code: `api-server/`
- Docker Config: `Dockerfile`

---

**Last Updated:** 2026-02-17
