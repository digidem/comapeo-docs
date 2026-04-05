# Translation Eval Fixtures

These fixtures support the local translation eval harness in
[`translateEfficiency.test.ts`](../translateEfficiency.test.ts).

## Provenance

- `small.md`
  - Source page: `introduction`
  - Source title: `Introduction`
- `medium.md`
  - Source page: `understanding-comapeos-core-concepts-and-functions`
  - Source title: `Understanding CoMapeo’s Core Concepts & Functions`
  - Notes: representative mid-sized excerpt kept around 8 KB
- `large.md`
  - Source page: `understanding-comapeos-core-concepts-and-functions`
  - Source title: `Understanding CoMapeo’s Core Concepts & Functions`
  - Notes: larger excerpt from the same exported page kept around 15 KB

## How To Refresh

1. Regenerate or fetch the latest Notion-backed markdown for the source page.
2. Copy the generated markdown into the fixture file, preserving frontmatter and
   representative structure such as headings, images, links, and code fences.
3. If needed, trim only by removing trailing sections so the fixture stays close
   to its current size class.
4. Run:
   - `bunx vitest run scripts/notion-translate/translateEfficiency.test.ts`

## Intended Use

- Real fixtures (`small.md`, `medium.md`, `large.md`) validate realism and
  structure preservation.
- Synthetic inline cases inside the eval file force retry and chunking paths
  that these smaller real fixtures do not naturally trigger under the current
  chunk cap.
