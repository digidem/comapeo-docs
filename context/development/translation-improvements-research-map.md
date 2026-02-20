# Translation Improvements Research Map

Date: 2026-02-19  
Purpose: parallelize investigation so multiple subagents can propose robust fixes for translation parity.

## Problem Statement

Auto-generated PT/ES markdown can be empty or structurally mismatched compared to EN source. We need code-level fixes so translated outputs remain structurally equivalent (except media path differences).

## Research Outcomes Required

Each research track must produce:

- concrete root-cause hypotheses
- exact code paths involved
- minimal patch strategy
- tests to prove no regression
- risk assessment

## Suggested Subagent Tracks

### Track A: Translation Roundtrip Integrity

Focus:

- `scripts/notion-translate/markdownToNotion.ts`
- `scripts/notion-translate/index.ts`
- `scripts/notion-translate/translateFrontMatter.ts`

Questions:

- Are markdown blocks dropped during conversion to Notion blocks?
- Are translated pages updated vs recreated with partial content?
- Are Parent/Sub-item relations and language resolution causing mis-targeted writes?

Expected output:

- list of likely loss points (by function)
- proposed invariants before/after roundtrip

### Track B: Markdown Export Consistency Across Locales

Focus:

- `scripts/notion-fetch/generateBlocks.ts`
- `scripts/notion-fetch/pageGrouping.ts`
- `scripts/notion-fetch/sectionProcessors.ts`
- `scripts/notion-fetch/markdownTransform.ts`
- `scripts/notion-fetch/contentWriter.ts`

Questions:

- Is locale grouping deterministic and complete?
- Are section/toggle/title blocks being processed asymmetrically by locale?
- Are transformed markdown operations removing locale content unexpectedly?

Expected output:

- mismatch-causing export paths
- parity-safe processing rules

### Track C: Emoji and Formatting Fidelity

Focus:

- `scripts/notion-fetch/emojiProcessor.ts`
- `scripts/notion-fetch/emojiExtraction.ts`
- `scripts/notion-fetch/calloutProcessor.ts`
- `scripts/notion-fetch/markdownTransform.ts`

Questions:

- Are emojis preserved in translated outputs at the same structural locations?
- Are callouts/admonitions preserved consistently across locales?
- Does retry/post-processing alter non-media markdown inconsistently?

Expected output:

- exact transformations that can drift by locale
- patch approach + focused tests

### Track D: Test Infrastructure and Regression Gates

Focus:

- `scripts/notion-translate/*.test.ts`
- `scripts/notion-fetch/__tests__/*`
- `scripts/verify-locale-output.test.ts`

Questions:

- Which tests currently allow empty/partial translated content to pass?
- Where to add parity assertions for headings/lists/links/code/emoji?
- What fixture strategy best captures EN/PT/ES equivalence with media exceptions?

Expected output:

- test plan with file-level additions
- CI gate recommendation (fast + deterministic)

## Cross-Cutting Diagnostics to Collect

Each subagent should gather these artifacts:

1. Before/after markdown snapshots per locale for the same family.
2. Parsed markdown AST summaries (headings, lists, links, code fences, admonitions).
3. Frontmatter key comparison table by locale.
4. Emoji token comparison list by locale.
5. Lost-content trace: where EN content disappears from PT/ES pipeline.

## External Research Targets

Use primary documentation/specs where needed:

- Notion API block/page/data_source behavior for content updates.
- `notion-to-md` conversion behavior and known edge cases.
- Docusaurus markdown/admonition/frontmatter expectations.
- Markdown parser behavior used in current stack (where relevant).

## Dispatch Template (Copy/Paste)

Use this prompt skeleton for each subagent:

```text
Investigate translation parity failures for EN/PT/ES markdown generation.
Scope:
- [insert track files]
Deliver:
1) root causes with code references,
2) minimal patch plan,
3) required tests,
4) risk/tradeoff notes.
Constraints:
- do not edit generated markdown files,
- focus on generator/translation code,
- preserve media-only exception.
```

## Acceptance for Research Phase

Research phase is complete when:

- at least 3 independent root-cause hypotheses are validated or falsified,
- a prioritized fix plan exists (ordered by impact/risk),
- test plan covers empty-output and structural-mismatch regressions,
- implementation tasks are actionable without re-discovery.
