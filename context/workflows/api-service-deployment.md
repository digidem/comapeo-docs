# API Service Deployment Runbook

This runbook covers a production-oriented path to deploy the API service, integrate it into an existing `docker-compose` stack, and connect it to GitHub Actions.

## 1. Prerequisites

- VPS with Docker Engine and Docker Compose plugin installed
- Repository checkout with `Dockerfile` and `docker-compose.yml`
- `.env.production` file with required secrets
- GitHub repository admin or maintainer access for secrets and workflows

## 2. Prepare Environment

Create `.env.production` in the deployment directory:

```bash
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=3001
NOTION_API_KEY=your_notion_api_key
DATABASE_ID=your_database_id
DATA_SOURCE_ID=your_data_source_id
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
API_KEY_GITHUB_ACTIONS=your_long_random_key
API_KEY_DEPLOYMENT=your_long_random_key
```

Recommended key generation:

```bash
openssl rand -base64 32
```

## 3. Deploy on VPS

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
curl -fsS http://localhost:3001/health
```

If health checks fail, inspect logs:

```bash
docker compose --env-file .env.production logs --tail=200 api
```

## 4. Integrate into Existing `docker-compose`

If you already have a compose stack, add the API service block from this repository to your existing `services:` section and share a network with upstream dependencies.

Minimal integration example:

```yaml
services:
  existing-service:
    image: your-existing-image:latest

  api:
    build:
      context: /path/to/comapeo-docs
      dockerfile: Dockerfile
      target: runner
    env_file:
      - /path/to/comapeo-docs/.env.production
    ports:
      - "3001:3001"
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "bun",
          "--silent",
          "-e",
          "fetch('http://localhost:3001/health').then(r => r.ok ? 0 : 1)",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
```

After merging compose files, run:

```bash
docker compose up -d --build api
```

## 5. Configure GitHub Integration

The workflow `.github/workflows/api-notion-fetch.yml` supports two modes:

- `API_ENDPOINT` set: calls your remote API service
- `API_ENDPOINT` not set: boots local API in the workflow runner

Add these GitHub Actions secrets:

- `API_ENDPOINT` (for remote mode, for example `https://api.example.com`)
- `API_KEY_GITHUB_ACTIONS`
- `NOTION_API_KEY`
- `DATABASE_ID`
- `DATA_SOURCE_ID`
- `OPENAI_API_KEY`

Trigger the workflow:

1. Open GitHub Actions
2. Run `Notion Fetch via API`
3. Choose `job_type`
4. Confirm job reaches `completed` and status checks update

## 6. Smoke Validation Checklist

- API health returns `200`
- Authenticated job creation works with `Authorization: Bearer ...`
- Job status polling returns transitions (`pending` to `running` to terminal state)
- GitHub status context updates for success and failure
- Restarting container preserves expected runtime behavior

## 7. Ongoing Operations

- Update image and restart:

```bash
docker compose --env-file .env.production up -d --build
```

- Tail logs:

```bash
docker compose --env-file .env.production logs -f api
```

- Roll back by re-deploying last known good image tag
