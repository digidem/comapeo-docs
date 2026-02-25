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

## Child Process Environment Variables (Whitelisted)

The following environment variables are whitelisted for passing to child processes:

### Notion Configuration Variables

- `NOTION_API_KEY` - Notion API authentication
- `DATABASE_ID` / `NOTION_DATABASE_ID` - Target database
- `DATA_SOURCE_ID` - Data source identifier

### Translation Options

- `OPENAI_API_KEY` - OpenAI API key for translations
- `OPENAI_MODEL` - Model to use for translations

### Application Configuration

- `DEFAULT_DOCS_PAGE` - Default docs page
- `BASE_URL` - Base URL for API
- `NODE_ENV` - Runtime environment
- `DEBUG` - Debug logging flag

### Debug and Performance Telemetry

- `NOTION_PERF_LOG` - Internal performance logging
- `NOTION_PERF_OUTPUT` - Performance output destination

### Runtime and Locale

- `PATH` - System PATH for executable resolution
- `HOME` - User home directory
- `BUN_INSTALL` - Bun installation directory
- `LANG` - Locale language setting
- `LC_ALL` - Locale all categories setting

### Security (Explicitly Blocked)

The following variables are NOT passed to child processes:

- `GITHUB_TOKEN` - GitHub token (never passed to child)
- Variables with names starting with `API_KEY_` (Note: `OPENAI_API_KEY` is explicitly whitelisted above)

## Endpoints

### Health Check

Check if the API server is running and get basic status information.

**Endpoint:** `GET /health`

**Authentication:** Not required

**Response:**

```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-02-06T12:00:00.000Z",
    "uptime": 1234.567,
    "auth": {
      "enabled": true,
      "keysConfigured": 2
    }
  },
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T12:00:00.000Z"
}
```

**Response Fields:**

| Field                      | Type    | Description                                        |
| -------------------------- | ------- | -------------------------------------------------- |
| `data.status`              | string  | Server health status ("ok" if healthy)             |
| `data.timestamp`           | string  | ISO 8601 timestamp when health check was performed |
| `data.uptime`              | number  | Server uptime in seconds                           |
| `data.auth.enabled`        | boolean | Whether authentication is enabled                  |
| `data.auth.keysConfigured` | number  | Number of API keys configured                      |
| `requestId`                | string  | Unique request identifier for tracing              |
| `timestamp`                | string  | ISO 8601 timestamp of response                     |

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
  "data": {
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
  },
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T12:00:00.000Z"
}
```

**Response Fields:**

| Field        | Type   | Description                           |
| ------------ | ------ | ------------------------------------- |
| `data.types` | array  | Array of available job types          |
| `requestId`  | string | Unique request identifier for tracing |
| `timestamp`  | string | ISO 8601 timestamp of response        |

**Example:**

```bash
curl http://localhost:3001/jobs/types
```

### List Jobs

Retrieve all jobs with optional filtering by status or type.

**Endpoint:** `GET /jobs`

**Authentication:** Required

**Query Parameters:**

| Parameter | Type   | Description                                                        |
| --------- | ------ | ------------------------------------------------------------------ |
| `status`  | string | Filter by job status (`pending`, `running`, `completed`, `failed`) |
| `type`    | string | Filter by job type (see job types list)                            |

**Response:**

```json
{
  "data": {
    "items": [
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
  },
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T10:02:31.000Z"
}
```

**Response Fields:**

| Field        | Type   | Description                           |
| ------------ | ------ | ------------------------------------- |
| `data.items` | array  | Array of job objects                  |
| `data.count` | number | Total number of jobs returned         |
| `requestId`  | string | Unique request identifier for tracing |
| `timestamp`  | string | ISO 8601 timestamp of response        |

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

| Field     | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `type`    | string | Yes      | Job type (see job types list) |
| `options` | object | No       | Job-specific options          |

**Available Options:**

| Option           | Type    | Description                                           |
| ---------------- | ------- | ----------------------------------------------------- |
| `maxPages`       | number  | Maximum number of pages to fetch (for `notion:fetch`) |
| `statusFilter`   | string  | Filter pages by status                                |
| `force`          | boolean | Force re-processing even if already processed         |
| `dryRun`         | boolean | Simulate the job without making changes               |
| `includeRemoved` | boolean | Include removed pages in results                      |

**Response (201 Created):**

```json
{
  "data": {
    "jobId": "job-def456",
    "type": "notion:fetch-all",
    "status": "pending",
    "message": "Job created successfully",
    "_links": {
      "self": "/jobs/job-def456",
      "status": "/jobs/job-def456"
    }
  },
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T12:00:00.000Z"
}
```

**Response Fields:**

| Field                | Type   | Description                           |
| -------------------- | ------ | ------------------------------------- |
| `data.jobId`         | string | Unique job identifier                 |
| `data.type`          | string | Job type that was created             |
| `data.status`        | string | Initial job status (always "pending") |
| `data.message`       | string | Success message                       |
| `data._links.self`   | string | URL path to the job                   |
| `data._links.status` | string | URL path to job status                |
| `requestId`          | string | Unique request identifier for tracing |
| `timestamp`          | string | ISO 8601 timestamp of response        |

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

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `id`      | string | Job ID      |

**Response:**

```json
{
  "data": {
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
  },
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T12:00:00.000Z"
}
```

**Response Fields:**

| Field                   | Type        | Description                                                   |
| ----------------------- | ----------- | ------------------------------------------------------------- |
| `data.id`               | string      | Job identifier                                                |
| `data.type`             | string      | Job type                                                      |
| `data.status`           | string      | Job status                                                    |
| `data.createdAt`        | string      | ISO 8601 timestamp when job was created                       |
| `data.startedAt`        | string/null | ISO 8601 timestamp when job started (null if not started)     |
| `data.completedAt`      | string/null | ISO 8601 timestamp when job completed (null if not completed) |
| `data.progress`         | object/null | Progress information (null if not available)                  |
| `data.progress.current` | number      | Current progress value                                        |
| `data.progress.total`   | number      | Total progress value                                          |
| `data.progress.message` | string      | Progress message                                              |
| `data.result`           | object/null | Job result data (null if not completed)                       |
| `requestId`             | string      | Unique request identifier for tracing                         |
| `timestamp`             | string      | ISO 8601 timestamp of response                                |

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

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| `id`      | string | Job ID      |

**Response:**

```json
{
  "data": {
    "id": "job-def456",
    "status": "cancelled",
    "message": "Job cancelled successfully"
  },
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T12:00:00.000Z"
}
```

**Response Fields:**

| Field          | Type   | Description                           |
| -------------- | ------ | ------------------------------------- |
| `data.id`      | string | Job identifier                        |
| `data.status`  | string | New job status ("cancelled")          |
| `data.message` | string | Success message                       |
| `requestId`    | string | Unique request identifier for tracing |
| `timestamp`    | string | ISO 8601 timestamp of response        |

**Example:**

```bash
curl -X DELETE http://localhost:3001/jobs/job-def456 \
  -H "Authorization: Bearer your-api-key"
```

## Error Responses

Errors follow this standardized format:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Error message describing what went wrong",
  "status": 400,
  "requestId": "req_abc123_def456",
  "timestamp": "2025-02-06T12:00:00.000Z",
  "details": {
    "field": "type"
  },
  "suggestions": [
    "Check the request format",
    "Verify all required fields are present",
    "Refer to API documentation"
  ]
}
```

**Error Response Fields:**

| Field         | Type   | Description                                         |
| ------------- | ------ | --------------------------------------------------- |
| `code`        | string | Machine-readable error code (see error codes below) |
| `message`     | string | Human-readable error message                        |
| `status`      | number | HTTP status code                                    |
| `requestId`   | string | Unique request identifier for tracing               |
| `timestamp`   | string | ISO 8601 timestamp of the error                     |
| `details`     | object | Additional error context (optional)                 |
| `suggestions` | array  | Suggestions for resolving the error (optional)      |

**Common Error Codes:**

| Code                       | HTTP Status | Description                          |
| -------------------------- | ----------- | ------------------------------------ |
| `VALIDATION_ERROR`         | 400         | Request validation failed            |
| `INVALID_INPUT`            | 400         | Invalid input provided               |
| `MISSING_REQUIRED_FIELD`   | 400         | Required field is missing            |
| `INVALID_FORMAT`           | 400         | Field format is invalid              |
| `INVALID_ENUM_VALUE`       | 400         | Invalid enum value provided          |
| `UNAUTHORIZED`             | 401         | Authentication failed or missing     |
| `INVALID_API_KEY`          | 401         | API key is invalid                   |
| `API_KEY_INACTIVE`         | 401         | API key is inactive                  |
| `NOT_FOUND`                | 404         | Resource not found                   |
| `ENDPOINT_NOT_FOUND`       | 404         | Endpoint does not exist              |
| `CONFLICT`                 | 409         | Request conflicts with current state |
| `INVALID_STATE_TRANSITION` | 409         | Invalid state transition attempted   |
| `INTERNAL_ERROR`           | 500         | Internal server error                |
| `SERVICE_UNAVAILABLE`      | 503         | Service is unavailable               |

### Common HTTP Status Codes

| Status | Description                                   |
| ------ | --------------------------------------------- |
| 200    | Success                                       |
| 201    | Created                                       |
| 400    | Bad Request - Invalid input                   |
| 401    | Unauthorized - Missing or invalid API key     |
| 404    | Not Found - Resource doesn't exist            |
| 409    | Conflict - Cannot cancel job in current state |
| 500    | Internal Server Error                         |

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
