#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for this smoke check"
  exit 1
fi

: "${API_ENDPOINT:?API_ENDPOINT is required (example: https://api.example.com)}"
: "${API_KEY_GITHUB_ACTIONS:?API_KEY_GITHUB_ACTIONS is required}"

MAX_PAGES="${MAX_PAGES:-1}"
POLL_ATTEMPTS="${POLL_ATTEMPTS:-180}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-1}"

create_and_wait() {
  local job_type="$1"
  local create_json
  local create_code
  local job_id
  local status=""

  create_json="$(mktemp)"
  create_code="$(curl -sS -o "${create_json}" -w "%{http_code}" \
    -X POST "${API_ENDPOINT}/jobs" \
    -H "Authorization: Bearer ${API_KEY_GITHUB_ACTIONS}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"${job_type}\",\"options\":{\"dryRun\":true,\"maxPages\":${MAX_PAGES}}}")"

  if [[ "${create_code}" != "202" ]]; then
    echo "Expected 202 for ${job_type}, got ${create_code}"
    cat "${create_json}"
    exit 1
  fi

  job_id="$(jq -r ".jobId" "${create_json}")"
  if [[ -z "${job_id}" || "${job_id}" == "null" ]]; then
    echo "Missing jobId for ${job_type}"
    cat "${create_json}"
    exit 1
  fi

  echo "Created ${job_type} job: ${job_id}"

  local status_json
  status_json="$(mktemp)"
  for _ in $(seq 1 "${POLL_ATTEMPTS}"); do
    curl -sS "${API_ENDPOINT}/jobs/${job_id}" \
      -H "Authorization: Bearer ${API_KEY_GITHUB_ACTIONS}" > "${status_json}"
    status="$(jq -r ".status" "${status_json}")"
    if [[ "${status}" == "completed" || "${status}" == "failed" ]]; then
      break
    fi
    sleep "${POLL_INTERVAL_SECONDS}"
  done

  if [[ "${status}" != "completed" ]]; then
    echo "Expected completed terminal status for ${job_type}, got ${status}"
    cat "${status_json}"
    exit 1
  fi

  jq -e ".dryRun == true and .commitHash == null and (.pagesProcessed | type == \"number\")" "${status_json}" >/dev/null
  echo "${job_type} dry-run terminal response validated"
}

echo "Running VPS fetch smoke checks against ${API_ENDPOINT}"
create_and_wait "fetch-ready"
create_and_wait "fetch-all"
echo "VPS fetch smoke checks passed"
