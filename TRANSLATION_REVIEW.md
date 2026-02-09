# Translation Workflow Review & Analysis

**Workflow**: `.github/workflows/translate-docs.yml`
**Last Reviewed**: 2025-02-09
**Status**: Under Investigation

---

## Executive Summary

The `translate-docs.yml` workflow automates translation of Notion content to multiple languages (pt-BR, es) using OpenAI. Several design issues and potential failure points have been identified that may cause silent failures or confusing behavior.

## How the Workflow Works

### Triggers

- `workflow_dispatch`: Manual trigger from GitHub Actions UI
- `repository_dispatch`: Programmatic trigger via `translate-docs` event type

### Execution Flow

```
1. Checkout content branch (ref: content)
2. Setup Bun runtime
3. Install dependencies (bun i)
4. Run Notion translation script (bun notion:translate)
   ├─ Fetch English pages with "Ready for translation" status
   ├─ For each target language (pt-BR, es):
   │  ├─ Check if translation exists
   │  ├─ Compare last_edited_time to skip if current
   │  ├─ Convert Notion → Markdown
   │  ├─ Translate via OpenAI API
   │  ├─ Create/update Notion translation page
   │  └─ Save .md to i18n/{lang}/... directory
   ├─ Translate code.json files
   └─ Translate navbar/footer theme config
5. Update Notion status: "Ready for translation" → "Auto translation generated"
6. Commit i18n/ and docs/ to content branch
7. Send Slack notification
```

### Key Scripts

- `scripts/notion-translate/index.ts` - Main translation logic
- `scripts/notion-status/index.ts` - Status updates in Notion
- `scripts/translateFrontMatter.ts` - Frontmatter translation
- `scripts/translateCodeJson.ts` - UI string translation
- `scripts/markdownToNotion.ts` - Markdown → Notion block conversion

---

## Issues & Blindspots

### 🔴 Critical Issues

#### 1. OpenAI API Integration Broken (CONFIRMED)

**Location**: `scripts/translateFrontMatter.ts` (and related translation files)

**Error**: `400 Invalid schema for response_format 'translation': schema must be a JSON Schema of 'type: "object"', got 'type: "string"'`

**Problem**: The OpenAI API integration uses an invalid response_format schema. The API expects `type: "object"` but receives `type: "string"`.

**Impact**:

- All translations fail with 400 error
- Translation returns `undefined`, causing TypeError cascade
- 0 translations completed despite workflow "success"

**Evidence**: Test run on 2025-02-09 showed complete translation failure

**Fix**: Update response_format schema to valid JSON Schema with `type: "object"` or remove structured output entirely.

---

#### 2. No Quota Handling (CONFIRMED)

**Location**: All translation API calls

**Error**: `429 You exceeded your current quota, please check your plan and billing details`

**Problem**: When OpenAI quota is exceeded, workflow retries 3x but all fail. No graceful degradation or early exit.

**Impact**:

- Wastes API credits on repeated failed requests
- No meaningful error message to user
- Workflow continues as if nothing happened

**Fix**: Add quota detection and early exit with clear error message.

---

#### 3. Silent Success on Total Failure (CONFIRMED)

**Location**: Entire workflow

**Problem**: Workflow reports `success` to GitHub and Slack even when 0 translations completed.

**Impact**:

- False confidence in translation pipeline
- No way to detect failures without checking logs
- Slack notification shows "Translation sync: success" despite complete failure

**Fix**: Add failure threshold (e.g., fail if <50% of translations succeed).

---

#### 4. Branch Selection UX Bug

**Location**: `.github/workflows/translate-docs.yml:18-22`

```yaml
- uses: actions/checkout@...
  with:
    ref: content # Hardcoded, ignores user selection
```

**Problem**: The `workflow_dispatch` trigger allows users to select a branch in the GitHub UI, but the checkout step explicitly uses `ref: content`, making the branch selection dropdown **completely ignored**.

**Impact**: Users may think they're running on their feature branch, but it's actually running on `content`.

**Fix**: Either:

- Remove the hardcoded `ref: content` to respect user selection
- Or document clearly that branch selection is ignored

---

#### 2. Content Branch May Not Exist

**Location**: `.github/workflows/translate-docs.yml:18-22`

**Problem**: Workflow assumes `content` branch exists. If it doesn't, checkout fails.

**Impact**: Workflow failure if:

- `content` branch was never created
- `content` branch was deleted
- Repository is new and `content` hasn't been set up

**Fix**: Add branch existence check or auto-create fallback.

---

#### 5. Parent Item Property Assumption

**Location**: `scripts/notion-translate/index.ts:518-531`

```typescript
const parentInfo = (
  englishPage.properties["Parent item"] as NotionRelationProperty
).relation[0].id; // No null check!
```

**Problem**: Code assumes every page has a "Parent item" relation property with at least one value.

**Impact**: **Crashes with TypeError** if:

- Page has no "Parent item" property
- "Parent item" is null/undefined
- Relation array is empty

**Fix**: Add null/undefined check before accessing.

---

### 🟡 High-Priority Issues

#### 6. Wrong Notion Status Value (CONFIRMED)

**Location**: `.github/workflows/translate-docs.yml:39` vs `scripts/notion-status/index.ts:109-113`

**Problem**: Workflow runs `notionStatus:translation` which updates status to **"Reviewing translations"**, but workflow comment says it should update to **"Auto translation generated"**.

**Evidence** (from logs):

```
translate-docs	Update Notion Status → Auto Translation Generated	2026-02-09T21:33:42.0381928Z
- Updating pages from "Ready for translation" to "Reviewing translations"
Successfully updated 1 pages from "Ready for translation" to "Reviewing translations"
```

**Impact**:

- Documentation mismatch with actual behavior
- Confusion about which status means what
- Status workflow name doesn't match actual status value

**Fix**: Either update workflow name to match status or vice versa.

---

#### 7. Silent Success on Empty Pages

**Location**: `scripts/notion-translate/index.ts:554-557`

```typescript
if (englishPages.length === 0) {
  console.log(chalk.yellow("No published English pages found. Exiting."));
  return; // Workflow succeeds but did nothing
}
```

**Problem**: If no pages have "Ready for translation" status, workflow exits successfully with zero output.

**Impact**:

- No way to distinguish "worked but nothing to do" from "actual failure"
- Slack notification shows "success" even though no translations happened
- Users may think translations were processed when they weren't

**Fix**: Exit with error or emit warning metric when no pages found.

---

#### 8. Code.json Required for Entire Workflow

**Location**: `scripts/notion-translate/index.ts:566-577`

```typescript
try {
  englishCodeJson = await fs.readFile(englishCodeJsonPath, "utf8");
  JSON.parse(englishCodeJson);
} catch (error) {
  console.error(
    chalk.red(`Error reading or parsing English code.json: ${error.message}`)
  );
  process.exit(1); // Entire translation dies
}
```

**Problem**: If `i18n/en/code.json` is missing or malformed, **all** translation work fails, even for docs.

**Impact**: Single file blocks entire translation pipeline.

**Fix**: Use graceful degradation - warn but continue with doc translations.

---

#### 9. Notion API v5 Migration Confusion

**Location**: `scripts/notion-status/index.ts:175-184`

```typescript
const dataSourceId =
  options.databaseId ||
  process.env.DATA_SOURCE_ID ||
  process.env.DATABASE_ID ||
  process.env.NOTION_DATABASE_ID;

if (dataSourceId) {
  process.env.DATABASE_ID = dataSourceId;
}
```

**Problem**: Complex fallback logic suggests migration pain. In Notion API v5, `DATA_SOURCE_ID` and `DATABASE_ID` are **different values**.

**Impact**:

- Users may set wrong secret name
- Documentation confusion about which ID to use
- Status updates may fail while translate works (or vice versa)

**Fix**: Standardize on one env var name, update documentation.

---

#### 10. Git Push Race Conditions

**Location**: `.github/workflows/translate-docs.yml:10-12`

```yaml
concurrency:
  group: "content-branch-updates"
  cancel-in-progress: false # Allows concurrent runs
```

**Problem**: Multiple workflow runs can push to `content` branch simultaneously.

**Impact**:

- `git push` fails if another workflow pushed first
- Lost updates if pushes conflict
- No automatic rebase/retry logic

**Fix**: Use `cancel-in-progress: true` or add rebase logic before push.

---

### 🟢 Medium-Priority Issues

#### 8. Workflow May Hang Indefinitely (Discovered During Testing)

**Location**: `.github/workflows/translate-docs.yml:10-12`

```yaml
concurrency:
  group: "content-branch-updates"
  cancel-in-progress: false # Queues new runs behind existing ones
```

**Problem**: Test run on 2025-02-09 remained `pending` for 7+ minutes without progressing to `in_progress`. Previous runs completed in 1-1.5 minutes.

**Impact**:

- New workflows queue behind existing runs (due to `cancel-in-progress: false`)
- If a workflow is stuck or slow, all subsequent workflows pile up behind it
- No timeout specified, so a hung workflow could block indefinitely

**Fix**: Consider adding `timeout-minutes` or changing to `cancel-in-progress: true`.

---

#### 9. No OpenAI API Retry Logic

**Location**: `scripts/notion-translate/index.ts:473-480`

```typescript
const translated = await translateText(
  markdownContent,
  originalTitle,
  config.language
); // No retry wrapper visible
```

**Problem**: OpenAI API calls lack retry logic for rate limits (429) or temporary failures.

**Impact**: Translation fails on transient API issues, requiring manual re-run.

**Fix**: Add exponential backoff retry wrapper.

---

#### 10. Six Required Secrets (Any Missing = Failure)

**Location**: `.github/workflows/translate-docs.yml:31-37`

```yaml
env:
  NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
  DATA_SOURCE_ID: ${{ secrets.DATA_SOURCE_ID }}
  DATABASE_ID: ${{ secrets.DATABASE_ID }}
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  OPENAI_MODEL: ${{ secrets.OPENAI_MODEL }}
```

**Problem**: Six secrets required, with no validation at workflow start.

**Impact**: Hard to diagnose which secret is missing when workflow fails.

**Fix**: Add secret validation step with clear error messages.

---

#### 11. Hardcoded Language List

**Location**: `scripts/constants.ts:38-51`

```typescript
export const LANGUAGES: TranslationConfig[] = [
  {
    language: "pt-BR",
    notionLangCode: "Portuguese",
    outputDir: "./i18n/pt/docusaurus-plugin-content-docs/current",
  },
  {
    language: "es",
    notionLangCode: "Spanish",
    outputDir: "./i18n/es/docusaurus-plugin-content-docs/current",
  },
];
```

**Problem**: Languages are hardcoded. Adding a new language requires code changes.

**Impact**: Not configurable per environment or deployment.

**Fix**: Consider env var or config file for language list (if flexibility needed).

---

## Testing Results

### Test Run #1 (2025-02-09) - CRITICAL FAILURES DISCOVERED

**Trigger**: Manual `gh workflow run translate-docs.yml`
**Run ID**: `21838355142`
**Status**: `completed success` (GitHub) but **translation completely failed**

**Critical Findings**:

1. ✅ Content branch exists (`refs/heads/content` at `67bfa5db`)
2. ✅ Workflow triggered and completed successfully
3. ❌ **OpenAI API quota exceeded** (HTTP 429) - All translation attempts failed
4. ❌ **Invalid JSON Schema error** - OpenAI API returns: `Invalid schema for response_format 'translation': schema must be a JSON Schema of 'type: "object"', got 'type: "string"'`
5. ❌ **TypeError cascade** - Translation returns `undefined`, causing `TypeError: undefined is not an object (evaluating 'content.replace')` in `removeFrontMatter()`
6. ⚠️ **Wrong status update** - Workflow updates status to "Reviewing translations" instead of documented "Auto translation generated"

**Translation Summary** (from logs):

- English pages found: 1
- Translations created: 0 (pt-BR), 0 (es)
- Translations updated: 0 (pt-BR), 0 (es)
- Skipped: 0 (pt-BR), 0 (es)

**Error Pattern**:

```
1. code.json translation → 429 quota exceeded (retries 3x, all fail)
2. navbar/footer translation → 429 quota exceeded (retries 3x, all fail)
3. Main content translation → 400 Invalid schema error
4. Fallback to removeFrontMatter() → TypeError (undefined content)
```

**Root Causes Identified**:

- **Outdated OpenAI integration**: Code uses deprecated/invalid response_format schema
- **No quota handling**: No graceful degradation when API quota is exceeded
- **Silent failures**: Workflow reports "success" to Slack despite total translation failure
- **Status mismatch**: Notion status updates to wrong value

**Findings**:

1. ✅ Content branch exists (`refs/heads/content` at `67bfa5db`)
2. ✅ Workflow triggered successfully
3. ⚠️ Workflow remained `pending` for 7+ minutes without progressing to `in_progress`
4. ⚠️ Previous runs show `success` but took 1-1.5 minutes, suggesting current run may be stuck or queued

**Possible Causes**:

- GitHub Actions runner queue delay
- Workflow may be waiting for another concurrent workflow (concurrency group)
- Missing secrets causing early failure not yet visible in logs
- Checkout of `content` branch hanging

**Action**: Check logs when run completes for more details.

### Manual Test Commands

```bash
# Trigger workflow
gh workflow run translate-docs.yml

# Monitor status
gh run list --workflow=translate-docs.yml --limit 5

# View logs (when complete)
gh run view <run-id> --log

# Check content branch exists
git ls-remote --heads origin content

# Verify secrets (requires admin access)
gh secret list
```

---

## Additional Findings

### 🔍 Alternative Workflow Discovered

**File**: `.github/workflows/api-notion-fetch.yml`

**Finding**: A more sophisticated workflow exists that uses an API server approach for Notion operations, including translation jobs.

**Key Differences**:
| Feature | translate-docs.yml | api-notion-fetch.yml |
|---------|-------------------|---------------------|
| Architecture | Direct script execution | API server with job queue |
| Timeout | None | 60 minutes |
| Status tracking | None | GitHub status integration |
| Error handling | Basic retries | Job polling with detailed status |
| Translation support | Built-in | Via `notion:translate` job type |

**Implication**: The `api-notion-fetch.yml` workflow may be the intended replacement for `translate-docs.yml`, offering better reliability and observability.

### 🔬 Technical Analysis of OpenAI API Error

**Root Cause**: The `translateFrontMatter.ts` file uses `openai.responses.parse()` with `zodTextFormat()` helper, which appears to be incompatible with the current OpenAI API version.

**Code Location**: `scripts/notion-translate/translateFrontMatter.ts:152-162`

```typescript
const response = await openai.responses.parse({
  model,
  input: [
    { role: "system", content: prompt },
    { role: "user", content: textWithTitle },
  ],
  text: {
    format: zodTextFormat(TranslationResult, "translation"),
  },
  temperature: DEFAULT_OPENAI_TEMPERATURE,
});
```

**Comparison**: The `translateCodeJson.ts` file uses the more traditional `openai.chat.completions.create()` API with JSON schema, which works correctly but fails due to quota issues.

**Fix Required**: Replace `openai.responses.parse()` with `openai.chat.completions.create()` using the same pattern as `translateCodeJson.ts`.

---

## Recommended Fixes

### Immediate (Critical)

1. **Fix OpenAI API integration** - Replace `openai.responses.parse()` with `openai.chat.completions.create()`
2. **Add quota detection** - Early exit on 429 errors with clear messaging
3. **Add failure threshold** - Fail workflow if <50% of translations succeed
4. Fix branch selection UX bug
5. Add Parent item null check

### Short-term (High Priority)

6. Consider migrating to `api-notion-fetch.yml` architecture
7. Add "no pages found" warning/error
8. Graceful degradation for code.json
9. Standardize Notion API v5 env vars
10. Fix git push race conditions
11. Add timeout to workflow or enable cancellation

### Long-term (Medium Priority)

12. Add OpenAI retry logic with exponential backoff
13. Add secret validation step
14. Make languages configurable
15. Consolidate translation workflows to avoid duplication

---

## Related Files

- `.github/workflows/translate-docs.yml` - Main workflow
- `scripts/notion-translate/index.ts` - Translation logic
- `scripts/notion-status/index.ts` - Status updates
- `scripts/constants.ts` - Configuration and languages
- `scripts/translateFrontMatter.ts` - Frontmatter translation
- `scripts/translateCodeJson.ts` - UI string translation
- `scripts/markdownToNotion.ts` - Notion block creation

---

## Next Steps

1. [x] Complete test run and document results
2. [ ] Fix OpenAI API integration (critical blocker)
3. [ ] Add quota detection and error handling
4. [ ] Add failure threshold for workflow success
5. [ ] Evaluate migrating to `api-notion-fetch.yml` architecture
6. [ ] Implement remaining critical fixes
7. [ ] Add integration tests for translation pipeline
8. [ ] Create troubleshooting guide for common failures

---

## Summary

The `translate-docs.yml` workflow has **critical issues** that prevent it from functioning:

1. **OpenAI API integration is broken** - Invalid schema causes 400 errors
2. **No quota handling** - 429 errors cause complete failure with retries
3. **Silent success pattern** - Workflow reports success even with 0 translations
4. **Better alternative exists** - `api-notion-fetch.yml` offers superior architecture

**Recommendation**: Prioritize fixing the OpenAI API integration or migrate to the API server workflow.
