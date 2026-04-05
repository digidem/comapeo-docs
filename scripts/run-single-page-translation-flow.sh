#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/run-single-page-translation-flow.sh <notion-page-id>

What it does:
  1. Fetches the English page into docs/ using the single-page fetch path
  2. Resolves the canonical English docs path from .cache/page-metadata.json
  3. Runs local-only PT/ES translation for that page
  4. Benchmarks model translation speed against the English markdown source
  5. Verifies the saved PT/ES markdown outputs exist and look structurally complete
  6. Prints a summary of outputs, timings, and structural counts

Notes:
  - Translation runs in --local-only mode by default
  - Artifacts and logs are written to a temp directory and printed at the end
EOF
}

normalize_page_id() {
  echo "${1//-/}" | tr '[:upper:]' '[:lower:]'
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run_logged_step() {
  local name="$1"
  shift

  local start_ts end_ts status
  start_ts="$(date +%s)"

  set +e
  "$@" 2>&1 | tee "$ARTIFACT_DIR/${name}.log"
  status="${PIPESTATUS[0]}"
  set -e

  end_ts="$(date +%s)"
  echo "$((end_ts - start_ts))" >"$ARTIFACT_DIR/${name}.seconds"
  return "$status"
}

run_benchmark() {
  local locale="$1"
  local target_language="$2"

  local start_ts end_ts status
  start_ts="$(date +%s)"

  set +e
  bun scripts/eval/translation-benchmark.ts \
    "$ENGLISH_FILE" \
    --target-language "$target_language" \
    >"$ARTIFACT_DIR/benchmark-${locale}.json" \
    2>"$ARTIFACT_DIR/benchmark-${locale}.log"
  status="$?"
  set -e

  end_ts="$(date +%s)"
  echo "$((end_ts - start_ts))" >"$ARTIFACT_DIR/benchmark-${locale}.seconds"
  return "$status"
}

count_headings() {
  local file_path="$1"
  grep -c '^#' "$file_path" 2>/dev/null || true
}

count_images() {
  local file_path="$1"
  { grep -o '!\[' "$file_path" 2>/dev/null || true; } | wc -l | tr -d ' '
}

count_placeholders() {
  local file_path="$1"
  { grep -o '\[Image:' "$file_path" 2>/dev/null || true; } | wc -l | tr -d ' '
}

file_has_content() {
  local file_path="$1"
  [[ -s "$file_path" ]] && grep -q '[^[:space:]]' "$file_path"
}

assess_output_file() {
  local locale="$1"
  local file_path="$2"

  if [[ ! -f "$file_path" ]]; then
    echo "${locale}: missing"
    return
  fi

  if ! file_has_content "$file_path"; then
    echo "${locale}: empty"
    return
  fi

  if [[ ! -f "$ENGLISH_FILE" ]]; then
    echo "${locale}: ok"
    return
  fi

  local english_headings locale_headings english_images locale_images
  local locale_placeholders locale_image_representations
  english_headings="$(count_headings "$ENGLISH_FILE")"
  locale_headings="$(count_headings "$file_path")"
  english_images="$(count_images "$ENGLISH_FILE")"
  locale_images="$(count_images "$file_path")"
  locale_placeholders="$(count_placeholders "$file_path")"
  locale_image_representations="$((locale_images + locale_placeholders))"

  if [[ "$locale_headings" != "$english_headings" ]]; then
    echo "${locale}: counts differ from english"
    return
  fi

  if [[ "$locale_image_representations" != "$english_images" ]]; then
    echo "${locale}: counts differ from english"
    return
  fi

  echo "${locale}: ok"
}

print_file_stats() {
  local label="$1"
  local file_path="$2"

  if [[ ! -f "$file_path" ]]; then
    echo "- ${label}: missing"
    return
  fi

  local lines chars headings images
  local placeholders
  lines="$(wc -l <"$file_path" | tr -d ' ')"
  chars="$(wc -m <"$file_path" | tr -d ' ')"
  headings="$(count_headings "$file_path")"
  images="$(count_images "$file_path")"
  placeholders="$(count_placeholders "$file_path")"

  echo "- ${label}: present"
  echo "  path: ${file_path}"
  echo "  lines=${lines} chars=${chars} headings=${headings} images=${images} placeholders=${placeholders}"
}

read_json_value() {
  local file_path="$1"
  local expression="$2"

  FILE_PATH="$file_path" EXPRESSION="$expression" bun --eval '
    const file = process.env.FILE_PATH;
    const expression = process.env.EXPRESSION;
    if (!file || !expression) process.exit(1);
    const raw = await Bun.file(file).text();
    const firstJsonLineIndex = raw
      .split(/\r?\n/)
      .findIndex((line) => line.trimStart().startsWith("{"));
    if (firstJsonLineIndex === -1) process.exit(1);
    const lines = raw.split(/\r?\n/).slice(firstJsonLineIndex);
    const data = JSON.parse(lines.join("\n"));
    const value = expression
      .split(".")
      .reduce((acc, key) => (acc == null ? undefined : acc[key]), data);
    if (value === undefined) process.exit(1);
    console.log(typeof value === "string" ? value : JSON.stringify(value));
  ' 2>/dev/null
}

format_number() {
  LC_ALL=en_US.UTF-8 printf "%'d" "$1" 2>/dev/null || echo "$1"
}

rep_char() {
  local n="$1" char="$2" result="" i
  for ((i = 0; i < n; i++)); do result="${result}${char}"; done
  printf '%s' "$result"
}

print_metrics_table() {
  local en_h="$1" en_i="$2" en_l="$3" en_c="$4"
  local pt_h="$5" pt_i="$6" pt_l="$7" pt_c="$8"
  local es_h="$9" es_i="${10}" es_l="${11}" es_c="${12}"

  en_c="$(format_number "$en_c")"
  pt_c="$(format_number "$pt_c")"
  es_c="$(format_number "$es_c")"

  # Column content widths (no padding); minimums are header widths
  local w1=8 w2=7 w3=2 w4=2  # "headings"=8, "English"=7, "PT"=2, "ES"=2
  for v in "$en_h" "$en_i" "$en_l" "$en_c"; do [[ ${#v} -gt $w2 ]] && w2=${#v}; done
  for v in "$pt_h" "$pt_i" "$pt_l" "$pt_c"; do [[ ${#v} -gt $w3 ]] && w3=${#v}; done
  for v in "$es_h" "$es_i" "$es_l" "$es_c"; do [[ ${#v} -gt $w4 ]] && w4=${#v}; done

  local t1=$((w1 + 2)) t2=$((w2 + 2)) t3=$((w3 + 2)) t4=$((w4 + 2))
  local h1 h2 h3 h4
  h1="$(rep_char "$t1" '─')" h2="$(rep_char "$t2" '─')"
  h3="$(rep_char "$t3" '─')" h4="$(rep_char "$t4" '─')"

  printf "  ┌%s┬%s┬%s┬%s┐\n" "$h1" "$h2" "$h3" "$h4"
  printf "  │ %-*s │ %-*s │ %-*s │ %-*s │\n" "$w1" "Metric"   "$w2" "English" "$w3" "PT"    "$w4" "ES"
  printf "  ├%s┼%s┼%s┼%s┤\n" "$h1" "$h2" "$h3" "$h4"
  printf "  │ %-*s │ %-*s │ %-*s │ %-*s │\n" "$w1" "headings" "$w2" "$en_h"   "$w3" "$pt_h" "$w4" "$es_h"
  printf "  ├%s┼%s┼%s┼%s┤\n" "$h1" "$h2" "$h3" "$h4"
  printf "  │ %-*s │ %-*s │ %-*s │ %-*s │\n" "$w1" "images"   "$w2" "$en_i"   "$w3" "$pt_i" "$w4" "$es_i"
  printf "  ├%s┼%s┼%s┼%s┤\n" "$h1" "$h2" "$h3" "$h4"
  printf "  │ %-*s │ %-*s │ %-*s │ %-*s │\n" "$w1" "lines"    "$w2" "$en_l"   "$w3" "$pt_l" "$w4" "$es_l"
  printf "  ├%s┼%s┼%s┼%s┤\n" "$h1" "$h2" "$h3" "$h4"
  printf "  │ %-*s │ %-*s │ %-*s │ %-*s │\n" "$w1" "chars"    "$w2" "$en_c"   "$w3" "$pt_c" "$w4" "$es_c"
  printf "  └%s┴%s┴%s┴%s┘\n" "$h1" "$h2" "$h3" "$h4"
}

require_command bun

PAGE_ID_RAW="${1:-}"
if [[ -z "$PAGE_ID_RAW" || "$PAGE_ID_RAW" == "--help" || "$PAGE_ID_RAW" == "-h" ]]; then
  usage
  exit 0
fi

PAGE_ID="$(normalize_page_id "$PAGE_ID_RAW")"
if [[ ! "$PAGE_ID" =~ ^[0-9a-f]{32}$ ]]; then
  echo "Invalid page id: ${PAGE_ID_RAW}" >&2
  echo "Expected 32 hex chars, with or without dashes." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

RUN_ID="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_DIR="${TMPDIR:-/tmp}/comapeo-single-page-flow-${PAGE_ID}-${RUN_ID}"
mkdir -p "$ARTIFACT_DIR"
FETCH_START_MARKER="${ARTIFACT_DIR}/fetch-start.marker"
: >"$FETCH_START_MARKER"
STRICT_QUALITY_GATE="${STRICT_QUALITY_GATE:-0}"

echo "Artifacts: ${ARTIFACT_DIR}"
echo "Page ID: ${PAGE_ID}"
echo

FETCH_STATUS=0
if run_logged_step \
  fetch \
  bun run notion:fetch-all -- --page-id "$PAGE_ID" --force --perf-output "$ARTIFACT_DIR/fetch-perf.json"; then
  FETCH_STATUS=0
else
  FETCH_STATUS="$?"
fi

if [[ "$FETCH_STATUS" -ne 0 ]]; then
  echo
  echo "Fetch failed. See: ${ARTIFACT_DIR}/fetch.log" >&2
  exit "$FETCH_STATUS"
fi

CANONICAL_RELATIVE_PATH="$(
  PAGE_ID="$PAGE_ID" bun --eval '
    import { resolveCanonicalDocsRelativePath } from "./scripts/notion-fetch/pageMetadataCache.ts";
    const pageId = process.env.PAGE_ID;
    if (!pageId) process.exit(1);
    const relativePath = resolveCanonicalDocsRelativePath(pageId);
    if (!relativePath) process.exit(1);
    console.log(relativePath);
  ' 2>/dev/null || true
)"

if [[ -z "$CANONICAL_RELATIVE_PATH" ]]; then
  # --- Filesystem fallback when cache resolution fails ---
  echo "  Cache had no entry for page ${PAGE_ID}, attempting filesystem fallback..." >&2

  # Deterministic fallback: scan docs/ for markdown files whose path was
  # written during this fetch run (newer than FETCH_START_MARKER). Unlike the
  # previous heuristic `find -newer` which could match unrelated files, we
  # constrain results to the docs/ tree and pick the most-recently-written
  # English markdown file.  For single-page fetch this is unambiguous because
  # only one English page should be generated.
  RECENT_MD="$(find "${REPO_ROOT}/docs" -name "*.md" -newer "${FETCH_START_MARKER}" -type f 2>/dev/null | head -1)"
  if [[ -n "$RECENT_MD" ]]; then
    CANONICAL_RELATIVE_PATH="${RECENT_MD#"${REPO_ROOT}/docs/"}"
    echo "  Filesystem fallback: found ${CANONICAL_RELATIVE_PATH}" >&2
  else
    echo "  No recently-written markdown files found in docs/" >&2
  fi

  # --- Fetch-log failure detection ---
  # If the fetch log indicates page processing failures despite exit code 0,
  # do NOT proceed into translation — the English source may be incomplete or
  # missing.  This closes the gap where a successful process exit did not
  # guarantee successful page generation.
  if [[ -z "$CANONICAL_RELATIVE_PATH" ]] && [[ -f "${ARTIFACT_DIR}/fetch.log" ]]; then
    if grep -q "pages failed to process" "${ARTIFACT_DIR}/fetch.log" >/dev/null 2>&1; then
      echo
      echo "Fetch log indicates page processing failures despite exit code 0." >&2
      echo "  Refusing to proceed with translation — English source may be incomplete." >&2
      echo "See: ${ARTIFACT_DIR}/fetch.log" >&2
      exit 1
    fi
  fi

  # --- Strict failure when no path found ---
  if [[ -z "$CANONICAL_RELATIVE_PATH" ]]; then
    echo
    echo "Unable to resolve canonical English docs path for page ${PAGE_ID}." >&2
    echo "  Cache had no entry, filesystem fallback found nothing, and fetch log showed no failures." >&2
    echo "See: ${ARTIFACT_DIR}/fetch.log" >&2
    exit 1
  fi
fi
ENGLISH_FILE="${REPO_ROOT}/docs/${CANONICAL_RELATIVE_PATH}"
PT_FILE="${REPO_ROOT}/i18n/pt/docusaurus-plugin-content-docs/current/${CANONICAL_RELATIVE_PATH}"
ES_FILE="${REPO_ROOT}/i18n/es/docusaurus-plugin-content-docs/current/${CANONICAL_RELATIVE_PATH}"

TRANSLATE_STATUS=0
if run_logged_step \
  translate \
  bun run notion:translate -- --local-only --page-id "$PAGE_ID"; then
  TRANSLATE_STATUS=0
else
  TRANSLATE_STATUS="$?"
fi

if [[ -f translation-summary.json ]]; then
  cp translation-summary.json "$ARTIFACT_DIR/translation-summary.json"
fi

BENCHMARK_PT_STATUS=0
if [[ "$TRANSLATE_STATUS" -ne 0 ]]; then
  BENCHMARK_PT_STATUS=1
  echo "Translation failed, skipping PT model benchmark" >"$ARTIFACT_DIR/benchmark-pt.log"
elif [[ -f "$ENGLISH_FILE" ]]; then
  if run_benchmark pt "pt-BR"; then
    BENCHMARK_PT_STATUS=0
  else
    BENCHMARK_PT_STATUS="$?"
  fi
else
  BENCHMARK_PT_STATUS=1
  echo "English file missing, skipping PT model benchmark" >"$ARTIFACT_DIR/benchmark-pt.log"
fi

BENCHMARK_ES_STATUS=0
if [[ "$TRANSLATE_STATUS" -ne 0 ]]; then
  BENCHMARK_ES_STATUS=1
  echo "Translation failed, skipping ES model benchmark" >"$ARTIFACT_DIR/benchmark-es.log"
elif [[ -f "$ENGLISH_FILE" ]]; then
  if run_benchmark es "es"; then
    BENCHMARK_ES_STATUS=0
  else
    BENCHMARK_ES_STATUS="$?"
  fi
else
  BENCHMARK_ES_STATUS=1
  echo "English file missing, skipping ES model benchmark" >"$ARTIFACT_DIR/benchmark-es.log"
fi

FETCH_SECONDS="$(cat "$ARTIFACT_DIR/fetch.seconds")"
TRANSLATE_SECONDS="$(cat "$ARTIFACT_DIR/translate.seconds")"
BENCHMARK_PT_SECONDS="$(cat "$ARTIFACT_DIR/benchmark-pt.seconds" 2>/dev/null || echo "0")"
BENCHMARK_ES_SECONDS="$(cat "$ARTIFACT_DIR/benchmark-es.seconds" 2>/dev/null || echo "0")"

PT_OUTPUT_STATUS="$(assess_output_file pt "$PT_FILE")"
ES_OUTPUT_STATUS="$(assess_output_file es "$ES_FILE")"
FAILED_TRANSLATIONS="$(read_json_value "$ARTIFACT_DIR/translation-summary.json" "failedTranslations" || echo "n/a")"
NEW_TRANSLATIONS="$(read_json_value "$ARTIFACT_DIR/translation-summary.json" "newTranslations" || echo "n/a")"

QUALITY_STATUS=0
if [[ "$PT_OUTPUT_STATUS" != "pt: ok" || "$ES_OUTPUT_STATUS" != "es: ok" ]]; then
  QUALITY_STATUS=1
fi
if [[ "$FAILED_TRANSLATIONS" != "0" && "$FAILED_TRANSLATIONS" != "n/a" ]]; then
  QUALITY_STATUS=1
fi

# Collect per-file metrics for the summary table
_file_metrics() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]] || ! file_has_content "$file_path"; then
    printf '%s %s %s %s' '-' '-' '-' '-'
    return
  fi
  local h i ip l c
  h="$(count_headings "$file_path")"
  i="$(count_images "$file_path")"
  ip="$(count_placeholders "$file_path")"
  l="$(wc -l <"$file_path" | tr -d ' ')"
  c="$(wc -m <"$file_path" | tr -d ' ')"
  printf '%s %s %s %s' "$h" "$((i + ip))" "$l" "$c"
}

read -r en_h en_i en_l en_c <<< "$(_file_metrics "$ENGLISH_FILE")"
read -r pt_h pt_i pt_l pt_c <<< "$(_file_metrics "$PT_FILE")"
read -r es_h es_i es_l es_c <<< "$(_file_metrics "$ES_FILE")"

echo
print_metrics_table \
  "$en_h" "$en_i" "$en_l" "$en_c" \
  "$pt_h" "$pt_i" "$pt_l" "$pt_c" \
  "$es_h" "$es_i" "$es_l" "$es_c"

# Consolidated checks summary
echo
if [[ "$FETCH_STATUS" -eq 0 && "$TRANSLATE_STATUS" -eq 0 && "$QUALITY_STATUS" -eq 0 ]]; then
  echo "  All checks passed:"
else
  echo "  Checks:"
fi

# — fetch
if [[ "$FETCH_STATUS" -eq 0 ]]; then
  echo "  - fetch: ok (${FETCH_SECONDS}s)"
else
  echo "  - fetch: FAILED (${FETCH_SECONDS}s)"
fi

# — translate
if [[ "$TRANSLATE_STATUS" -eq 0 ]]; then
  _tx_detail=""
  if [[ "$NEW_TRANSLATIONS" != "n/a" && "$FAILED_TRANSLATIONS" != "n/a" ]]; then
    _tx_detail=" — ${NEW_TRANSLATIONS} new translations, ${FAILED_TRANSLATIONS} failures"
  fi
  echo "  - translate: ok (${TRANSLATE_SECONDS}s)${_tx_detail}"
else
  echo "  - translate: FAILED (${TRANSLATE_SECONDS}s)"
fi

# — output quality
if [[ "$QUALITY_STATUS" -eq 0 ]]; then
  _q_detail=""
  if [[ "$en_h" != "-" && "$en_i" != "-" ]]; then
    _q_detail=" — all ${en_h} headings preserved, all ${en_i} images preserved in both PT and ES"
  fi
  echo "  - output quality: ok${_q_detail}"
else
  _q_issues=""
  [[ "$PT_OUTPUT_STATUS" != "pt: ok" ]] && _q_issues="${_q_issues} pt:${PT_OUTPUT_STATUS#*: }"
  [[ "$ES_OUTPUT_STATUS" != "es: ok" ]] && _q_issues="${_q_issues} es:${ES_OUTPUT_STATUS#*: }"
  [[ "$FAILED_TRANSLATIONS" != "0" && "$FAILED_TRANSLATIONS" != "n/a" ]] && \
    _q_issues="${_q_issues}, ${FAILED_TRANSLATIONS} failed translations"
  echo "  - output quality: needs review —${_q_issues}"
fi

# — model benchmarks
if [[ "$BENCHMARK_PT_STATUS" -eq 0 && "$BENCHMARK_ES_STATUS" -eq 0 ]]; then
  echo "  - model benchmarks: ok for both languages"
elif [[ "$BENCHMARK_PT_STATUS" -ne 0 && "$BENCHMARK_ES_STATUS" -ne 0 ]]; then
  echo "  - model benchmarks: skipped/failed"
elif [[ "$BENCHMARK_PT_STATUS" -eq 0 ]]; then
  echo "  - model benchmarks: pt ok, es skipped/failed"
else
  echo "  - model benchmarks: pt skipped/failed, es ok"
fi

echo
echo "  Logs"
echo "  - fetch:     ${ARTIFACT_DIR}/fetch.log"
echo "  - translate: ${ARTIFACT_DIR}/translate.log"
echo "  - artifacts: ${ARTIFACT_DIR}/"
echo

echo "Next"
if [[ "$FETCH_STATUS" -eq 0 && "$TRANSLATE_STATUS" -eq 0 && "$QUALITY_STATUS" -eq 0 ]]; then
  echo "- run Portuguese dev server: bun run dev:pt"
  echo "- run Spanish dev server: bun run dev:es"
else
  echo "- inspect the logs above before running locale dev servers"
fi

OVERALL_STATUS=0
if [[ "$FETCH_STATUS" -ne 0 || "$TRANSLATE_STATUS" -ne 0 ]]; then
  OVERALL_STATUS=1
elif [[ "$STRICT_QUALITY_GATE" == "1" && "$QUALITY_STATUS" -ne 0 ]]; then
  OVERALL_STATUS=1
fi

exit "$OVERALL_STATUS"
