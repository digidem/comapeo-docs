---
id: api-reference
title: API Reference
sidebar_label: API Reference
sidebar_position: 1
pagination_label: API Reference
custom_edit_url: https://github.com/digidem/comapeo-docs/edit/main/docs/developer-tools/api-reference.md
keywords:
  - api
  - rest
  - http
  - web service
tags:
  - developer
  - api
slug: /developer-tools/api-reference
last_update:
  date: 06/02/2025
  author: Awana Digital
---

# API Reference

The CoMapeo Documentation API provides programmatic access to Notion content management operations. This REST API allows you to trigger jobs, check status, and manage content workflows.

## Base URL

By default, the API server runs on:

```
http://localhost:3001
```

You can configure the host and port using environment variables:

- `API_HOST`: Server hostname (default: `localhost`)
- `API_PORT`: Server port (default: `3001`)

## Authentication

The API uses Bearer token authentication. Set your API keys using environment variables:

```bash
export API_KEY_MY_KEY="your-secret-key-here"
```

Then include the key in your requests:

```bash
curl -H "Authorization: Bearer your-secret-key-here" \
  http://localhost:3001/jobs
```

:::note Public Endpoints
The following endpoints do not require authentication:
- `GET /health` - Health check
- `GET /jobs/types` - List available job types
:::

## Endpoints

### Health Check

Check if the API server is running and get basic status information.

**Endpoint:** `GET /health`

**Authentication:** Not required

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-02-06T12:00:00.000Z",
  "uptime": 1234.567,
  "auth": {
    "enabled": true,
    "keysConfigured": 2
  }
}
```

**Example:**

```bash
curl http://localhost:3001/health
```

### List Job Types

Get a list of all available job types that can be created.

**Endpoint:** `GET /jobs/types`

**Authentication:** Not required

**Response:**

```json
{
  "types": [
    {
      "id": "notion:fetch",
      "description": "Fetch pages from Notion"
    },
    {
      "id": "notion:fetch-all",
      "description": "Fetch all pages from Notion"
    },
    {
      "id": "notion:translate",
      "description": "Translate content"
    },
    {
      "id": "notion:status-translation",
      "description": "Update status for translation workflow"
    },
    {
      "id": "notion:status-draft",
      "description": "Update status for draft publish workflow"
    },
    {
      "id": "notion:status-publish",
      "description": "Update status for publish workflow"
    },
    {
      "id": "notion:status-publish-production",
      "description": "Update status for production publish workflow"
    }
  ]
}
```

**Example:**

```bash
curl http://localhost:3001/jobs/types
```

### List Jobs

Retrieve all jobs with optional filtering by status or type.

**Endpoint:** `GET /jobs`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by job status (`pending`, `running`, `completed`, `failed`) |
| `type` | string | Filter by job type (see job types list) |

**Response:**

```json
{
  "jobs": [
    {
      "id": "job-abc123",
      "type": "notion:fetch-all",
      "status": "completed",
      "createdAt": "2025-02-06T10:00:00.000Z",
      "startedAt": "2025-02-06T10:00:01.000Z",
      "completedAt": "2025-02-06T10:02:30.000Z",
      "progress": {
        "current": 50,
        "total": 50,
        "message": "Completed"
      },
      "result": {
        "success": true,
        "pagesProcessed": 50
      }
    }
  ],
  "count": 1
}
```

**Examples:**

```bash
# List all jobs
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3001/jobs

# Filter by status
curl -H "Authorization: Bearer your-api-key" \
  "http://localhost:3001/jobs?status=running"

# Filter by type
curl -H "Authorization: Bearer your-api-key" \
  "http://localhost:3001/jobs?type=notion:fetch"

# Combine filters
curl -H "Authorization: Bearer your-api-key" \
  "http://localhost:3001/jobs?status=completed&type=notion:fetch-all"
```

### Create Job

Create and trigger a new job.

**Endpoint:** `POST /jobs`

**Authentication:** Required

**Request Body:**

```json
{
  "type": "notion:fetch-all",
  "options": {
    "maxPages": 10,
    "force": false
  }
}
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Job type (see job types list) |
| `options` | object | No | Job-specific options |

**Available Options:**

| Option | Type | Description |
|--------|------|-------------|
| `maxPages` | number | Maximum number of pages to fetch (for `notion:fetch`) |
| `statusFilter` | string | Filter pages by status |
| `force` | boolean | Force re-processing even if already processed |
| `dryRun` | boolean | Simulate the job without making changes |
| `includeRemoved` | boolean | Include removed pages in results |

**Response (201 Created):**

```json
{
  "jobId": "job-def456",
  "type": "notion:fetch-all",
  "status": "pending",
  "message": "Job created successfully",
  "_links": {
    "self": "/jobs/job-def456",
    "status": "/jobs/job-def456"
  }
}
```

**Examples:**

```bash
# Create a fetch-all job
curl -X POST http://localhost:3001/jobs \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"type": "notion:fetch-all"}'

# Create a fetch job with options
curl -X POST http://localhost:3001/jobs \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "notion:fetch",
    "options": {
      "maxPages": 10,
      "force": false
    }
  }'

# Create a translate job
curl -X POST http://localhost:3001/jobs \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"type": "notion:translate"}'

# Create a status update job
curl -X POST http://localhost:3001/jobs \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"type": "notion:status-publish"}'
```

### Get Job Status

Retrieve detailed status of a specific job.

**Endpoint:** `GET /jobs/:id`

**Authentication:** Required

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

**Response:**

```json
{
  "id": "job-def456",
  "type": "notion:fetch-all",
  "status": "running",
  "createdAt": "2025-02-06T12:00:00.000Z",
  "startedAt": "2025-02-06T12:00:01.000Z",
  "completedAt": null,
  "progress": {
    "current": 25,
    "total": 50,
    "message": "Processing page 25 of 50"
  },
  "result": null
}
```

**Example:**

```bash
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3001/jobs/job-def456
```

### Cancel Job

Cancel a pending or running job.

**Endpoint:** `DELETE /jobs/:id`

**Authentication:** Required

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

**Response:**

```json
{
  "id": "job-def456",
  "status": "cancelled",
  "message": "Job cancelled successfully"
}
```

**Example:**

```bash
curl -X DELETE http://localhost:3001/jobs/job-def456 \
  -H "Authorization: Bearer your-api-key"
```

## Error Responses

Errors follow this format:

```json
{
  "error": "Error message",
  "details": {},
  "suggestions": [
    "Suggestion 1",
    "Suggestion 2"
  ]
}
```

### Common HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Cannot cancel job in current state |
| 500 | Internal Server Error |

## Rate Limiting

Currently, there are no rate limits imposed on the API. However, please use reasonable request patterns to avoid overwhelming the server.

## CORS

The API supports CORS for cross-origin requests. The following headers are included:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Starting the API Server

To start the API server:

```bash
# Using Bun
bun run api:server

# Or directly
bun scripts/api-server
```

The server will log the available endpoints and authentication status on startup.
