# Docker Integration Tests

Real-world testing scripts for the Comapeo Docs API server using Docker.

## Scripts

### `test-fetch.sh`

Notion fetch testing via API server. Tests data fetching with configurable options.

```bash
# Quick test (default: 5 pages)
./scripts/test-docker/test-fetch.sh

# Fetch all pages from Notion
./scripts/test-docker/test-fetch.sh --all

# Limit to specific page count
./scripts/test-docker/test-fetch.sh --max-pages 10

# Dry run (no actual changes)
./scripts/test-docker/test-fetch.sh --dry-run

# Combine options
./scripts/test-docker/test-fetch.sh --all --no-cleanup
```

**Options:**
| Flag | Description |
|------|-------------|
| `--all` | Fetch all pages (no maxPages limit) |
| `--max-pages N` | Limit fetch to N pages (default: 5) |
| `--dry-run` | Run in dry-run mode (no actual changes) |
| `--no-cleanup` | Leave container running after test |
| `--include-removed` | Include pages with 'Remove' status |

### `test-api-docker.sh`

Comprehensive API endpoint testing. Validates all API routes with proper assertions.

```bash
# Run all API tests
./scripts/test-docker/test-api-docker.sh

# Keep container and logs for debugging
./scripts/test-docker/test-api-docker.sh --no-cleanup --keep-logs
```

**Test Coverage:**

- Health checks (public)
- API documentation (OpenAPI spec)
- Job types listing
- Job creation and status polling
- Job cancellation
- Validation and error handling
- CORS headers
- Authentication flow

### `test-fetch-validation.test.sh`

Unit tests for the `validate_page_count()` function from `test-fetch.sh`. Tests the page count validation logic in isolation without requiring Docker or Notion API access.

```bash
# Run page count validation unit tests
./scripts/test-docker/test-fetch-validation.test.sh
```

**Test Coverage:**

- Exact match scenarios (expected = actual)
- Fewer files than expected
- More files than expected
- Max-pages adjustment (when expected > max-pages)
- Max-pages no adjustment (when expected < max-pages)
- Empty docs directory
- Non-empty docs with zero expected
- Fetch all mode with exact match
- Large count differences
- Single file edge case

## Environment

Required environment variables (set in `.env`):

- `NOTION_API_KEY` - Notion API integration token
- `DATABASE_ID` - Notion database ID
- `DATA_SOURCE_ID` - Notion data source ID (v5 API)

Optional:

- `API_KEY_*` - API keys for authentication testing
- `DEFAULT_DOCS_PAGE` - Default docs page (overrides `introduction-remove`)

## Test Results

Test results are saved to `./test-results/` directory:

- JSON responses from each endpoint
- Test summary with pass/fail counts
- Docker logs (with `--keep-logs`)

## Docker Images

Scripts use the `comapeo-docs-api:test` image built from `Dockerfile`. The image is rebuilt on each run to ensure latest changes are tested.

## Cleanup

By default, containers are stopped and removed after tests complete. Use `--no-cleanup` to leave containers running for debugging.

## File Persistence

**`test-fetch.sh` uses Docker volume mounts** to save generated files to your host machine:

| Host Path         | Container Path       | Contents                 |
| ----------------- | -------------------- | ------------------------ |
| `./docs`          | `/app/docs`          | Generated markdown files |
| `./static/images` | `/app/static/images` | Downloaded images        |

When you run `./scripts/test-docker/test-fetch.sh --all`:

- Files are generated **inside the Docker container**
- Volume mounts **copy them to your host machine** in real-time
- When the container exits, **files remain on your host**
- You can view/edit the generated files directly

**After running `--all`:**

```bash
# Check generated docs
ls -la docs/
wc -l docs/*.md

# Check downloaded images
ls -la static/images/
```
