# Notion Sync Work Plan

This is a temporary checklist covering open Issues #15–19. Work through them sequentially; each item should be completed on its own branch and pull request before moving to the next.

## Sequencing Rationale

1. **Issue #18 – rename Section → Element Type**: foundational change that other tasks depend on; update code/tests/docs so later work can rely on the new schema.
2. **Issue #15 – import empty sections**: once naming is stable, extend fetch logic to generate Toggle sections even without child pages.
3. **Issue #17 – render callout colors**: enhance block rendering after structural fixes are in place.
4. **Issue #16 – support custom emojis**: media-handling improvements can layer on top of the earlier parsing changes.
5. **Issue #19 – support Published date**: audit and migrate publication metadata once other content-generation updates are complete.

## Execution Checklist

- [ ] **#18** `refactor: rename Section property to Element Type`
  - Branch: `refactor/notion-element-type`
  - PR: https://github.com/digidem/comapeo-docs/pull/20
- [ ] **#15** `feat: import empty sections from Notion`
  - Branch: `feat/notion-empty-sections`
  - PR: _link once opened_
- [ ] **#17** `feat: render Notion callout colors`
  - Branch: `feat/notion-callout-colors`
  - PR: _link once opened_
- [ ] **#16** `feat: support Notion custom emojis`
  - Branch: `feat/notion-custom-emojis`
  - PR: _link once opened_
- [ ] **#19** `investigate: support Published date property`
  - Branch: `chore/notion-published-date`
  - PR: _link once opened_

> Update this file after each merge: check off the completed item, add the PR URL, and remove the file entirely once all tasks are done.
