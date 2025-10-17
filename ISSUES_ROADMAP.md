# Issues Roadmap - Jen's UI/UX Fixes

**Generated**: 2025-10-03
**Total Issues**: 5
**Estimated Total Effort**: 10-17 hours
**Status**: Planning Phase

---

## Executive Summary

Five UI/UX issues from jen focused on improving documentation site usability and appearance. Issues range from simple CSS fixes (1-2 hours) to more complex investigations (2-5 hours).

**Quick Wins**: #33 (tables), #32 (sidebar title)
**High Impact**: #34 (mobile landing), #31 (button clipping)
**Complex**: #39 (TOC inconsistency)

---

## Priority Matrix

### By Impact & Effort

```
High Impact
│
│  #34 Mobile        #31 Button      #39 TOC
│  Landing          Clipping        Issues
│  (3-5h)           (2-3h)          (2-4h)
│
│
Medium Impact
│
│  #32 Sidebar      #33 Table
│  Title            Alignment
│  (2-3h)           (1-2h)
│
└────────────────────────────────────────────
   Low Effort              High Effort
```

### By Risk & Complexity

```
High Risk
│
│                              #39 TOC
│                              Issues
│
│
Medium Risk
│                   #31 Button
│                   Clipping
│
Low Risk
│
│  #33 Table        #32 Sidebar    #34 Mobile
│  Alignment        Title          Landing
│
└────────────────────────────────────────────
   Low Complexity         High Complexity
```

---

## Recommended Sequential Order

### 🥇 Phase 1: Quick Wins (3-5 hours total)

#### 1. Issue #33 - Table Alignment ⚡ START HERE
- **Branch**: `fix/table-alignment`
- **Worktree**: `worktrees/fix-table-alignment`
- **Effort**: 1-2 hours
- **Risk**: Very Low 🟢
- **Impact**: Medium
- **Files**: `src/css/custom.css`

**Why First?**
- Simplest fix (~5 lines of CSS)
- Quick win builds momentum
- Zero dependencies
- Easy verification
- Good warm-up

**Changes**:
```css
.theme-doc-markdown table td,
.theme-doc-markdown table th {
  vertical-align: top;
}
```

---

#### 2. Issue #32 - Sidebar Title Styling
- **Branch**: `fix/sidebar-title-styling`
- **Worktree**: `worktrees/fix-sidebar-title-styling`
- **Effort**: 2-3 hours
- **Risk**: Low 🟢
- **Impact**: High
- **Files**: `src/css/custom.css`, possibly `src/theme/DocSidebar/`

**Why Second?**
- CSS-focused, medium complexity
- High visual impact
- No conflicts with #33
- Informs sidebar work for #31
- Improves navigation hierarchy

**Changes**:
- Add background color (#838996) to sidebar title
- Add text color (#e5e4e2)
- Improve visual separation

---

### 🥈 Phase 2: Sidebar Enhancement (2-3 hours)

#### 3. Issue #31 - Button Text Clipping
- **Branch**: `fix/button-text-clipping`
- **Worktree**: `worktrees/fix-button-text-clipping`
- **Effort**: 2-3 hours
- **Risk**: Medium 🟡
- **Impact**: High
- **Files**: `src/css/custom.css`, `src/theme/DocSidebarItem/index.tsx`

**Why Third?**
- Builds on #32 sidebar knowledge
- High usability impact
- Should be done before TOC work
- May require component changes

**Changes**:
- Enable text wrapping at word boundaries
- Hide content preview snippets
- Improve multi-line title spacing

**Dependencies**:
- ✅ Best done after #32 (sidebar context)
- ⚠️  May conflict if done in parallel with #32

---

### 🥉 Phase 3: Page Improvements (3-5 hours)

#### 4. Issue #34 - Mobile Landing Page
- **Branch**: `fix/mobile-landing`
- **Worktree**: `worktrees/fix-mobile-landing`
- **Effort**: 3-5 hours
- **Risk**: Low 🟢
- **Impact**: Very High
- **Files**: `src/pages/index.tsx`, `src/pages/index.module.css`, `src/css/custom.css`

**Why Fourth?**
- Critical for mobile users
- Independent of sidebar work
- Only affects landing page
- Can be parallelized with sidebar fixes

**Changes**:
- Mobile-first button layout (flexbox/grid)
- Responsive hero section
- WCAG touch targets (≥44x44px)
- Test across viewports (320px-1280px)

**Can Run in Parallel With**: #31, #32, #33 ✅

---

### 🔍 Phase 4: Deep Investigation (2-4 hours)

#### 5. Issue #39 - TOC Inconsistency
- **Branch**: `fix/toc-inconsistency`
- **Worktree**: `worktrees/fix-toc-inconsistency`
- **Effort**: 2-4 hours
- **Risk**: Medium-High 🟡
- **Impact**: High
- **Files**: `docusaurus.config.ts`, docs content, possibly remark plugins

**Why Last?**
- Most complex investigation
- May uncover deeper issues
- Could affect markdown processing
- Benefits from stable codebase
- Requires thorough diagnosis

**Changes**:
- Investigate TOC generation logic
- Fix heading extraction
- Ensure consistent TOC rendering
- May need global config changes

**Dependencies**:
- ✅ Best done after all other fixes stable
- ⚠️  May have hidden conflicts with markdown/theme

---

## Parallel Work Strategy

### Strategy A: Single Developer (Recommended)

**Sequential Order**: #33 → #32 → #31 → #34 → #39

**Timeline**:
- Day 1: #33 (1-2h) + #32 (2-3h) = **3-5 hours**
- Day 2: #31 (2-3h) + Start #34 = **4-5 hours**
- Day 3: Complete #34 + #39 = **4-7 hours**

**Total**: 3-4 days (10-17 hours)

---

### Strategy B: Two Developers (Parallel)

#### **Track A - Sidebar Focus** (Developer 1)
1. #33 Table Alignment (1-2h) ⚡ Quick win
2. #32 Sidebar Title Styling (2-3h)
3. #31 Button Text Clipping (2-3h)

**Total Track A**: 5-8 hours

#### **Track B - Page Focus** (Developer 2)
1. #34 Mobile Landing Page (3-5h)
2. #39 TOC Inconsistency (2-4h)

**Total Track B**: 5-9 hours

**Parallel Timeline**: 1-2 days (5-9 hours per developer)

**Why This Works**:
- Zero file conflicts between tracks
- Track A: `src/css/custom.css` (sidebar sections), `src/theme/DocSidebar*`
- Track B: `src/pages/index.*`, `docusaurus.config.ts`, docs content
- Can merge independently

---

### Strategy C: Three Developers (Maximum Parallelization)

#### **Developer 1 - Quick Fixes**
- #33 Table Alignment (1-2h)
- #32 Sidebar Title (2-3h)

#### **Developer 2 - Sidebar Deep Dive**
- #31 Button Text Clipping (2-3h)
- Then help with #39 testing

#### **Developer 3 - Pages**
- #34 Mobile Landing (3-5h)
- #39 TOC Investigation (2-4h)

**Parallel Timeline**: 1 day (3-5 hours per developer)

---

## Conflict Analysis

### File Overlap Matrix

| Issue | Primary Files | Conflicts With |
|-------|--------------|----------------|
| #33 Table | `src/css/custom.css` (tables section) | None ✅ |
| #32 Sidebar Title | `src/css/custom.css` (sidebar section) | #31 (minor) ⚠️ |
| #31 Button Clipping | `src/css/custom.css` (sidebar section), `src/theme/DocSidebarItem/` | #32 (minor) ⚠️ |
| #34 Mobile Landing | `src/pages/index.*`, `src/css/custom.css` (navbar section) | None ✅ |
| #39 TOC | `docusaurus.config.ts`, docs content, remark plugins | None ✅ |

### Safe Parallel Combinations

✅ **Zero Conflict** (Highly Recommended):
- #33 + #34 (different files entirely)
- #33 + #39 (different files entirely)
- #34 + #39 (different files entirely)
- #34 + (#32 or #31) (only navbar overlap in custom.css)

⚠️  **Minor Conflicts** (Manageable):
- #32 + #31 (both touch sidebar CSS, coordinate on custom.css)
- #33 + #32 (both in custom.css, but different sections)
- #33 + #31 (both in custom.css, but different sections)

❌ **Sequential Required**:
- #32 → #31 (better to do sequentially for context)

---

## Risk Mitigation

### Low-Risk Issues (Do First)
1. **#33 Table Alignment**
   - Pure CSS, isolated scope
   - Easy to test and rollback
   - No theme complexity

2. **#32 Sidebar Title**
   - Mostly CSS with clear scope
   - Well-defined requirements
   - Color accessibility verified

3. **#34 Mobile Landing**
   - Isolated to landing page
   - Mobile-first is standard practice
   - Clear acceptance criteria

### Medium-Risk Issues (Need Care)
4. **#31 Button Clipping**
   - May need component changes
   - Text wrapping can be tricky
   - Test edge cases thoroughly

5. **#39 TOC Inconsistency**
   - Root cause unclear
   - May affect markdown processing
   - Could uncover deeper issues
   - Needs thorough investigation

---

## Testing Strategy

### Per-Issue Testing
Each issue has detailed testing checklist in its TASK.md:
- Visual regression tests
- Responsive breakpoints (320px, 768px, 1024px+)
- Browser compatibility (Chrome, Firefox, Safari)
- Accessibility (WCAG, keyboard nav)

### Integration Testing
After each phase, test:
- [ ] Build completes: `bun run build`
- [ ] TypeScript checks: `bun run typecheck`
- [ ] Lint passes: `bunx eslint src/`
- [ ] Format consistent: `bunx prettier --check .`
- [ ] Dev server runs: `bun run dev`
- [ ] All pages load correctly
- [ ] No console errors

### Final Validation (After All Issues)
- [ ] Full site build
- [ ] Deploy to staging
- [ ] Visual regression across all pages
- [ ] Mobile device testing (real devices)
- [ ] Accessibility audit
- [ ] Performance check (Lighthouse)

---

## Branch & Merge Strategy

### Worktree Structure
```
comapeo-docs/
├── .git/
├── (main working directory)
└── worktrees/
    ├── fix-table-alignment/         (#33)
    ├── fix-sidebar-title-styling/   (#32)
    ├── fix-button-text-clipping/    (#31)
    ├── fix-mobile-landing/          (#34)
    └── fix-toc-inconsistency/       (#39)
```

### Merge Order (Sequential)
1. Merge #33 (table alignment) → `main`
2. Merge #32 (sidebar title) → `main`
3. Merge #31 (button clipping) → `main`
4. Merge #34 (mobile landing) → `main`
5. Merge #39 (TOC issues) → `main`

### Merge Order (Parallel Tracks)
**If using Track A + Track B:**
1. Complete and merge #33 + #32 (Track A Phase 1)
2. Parallel: Complete #31 (Track A) AND #34 (Track B)
3. Merge #31 → `main`
4. Merge #34 → `main`
5. Complete and merge #39 (Track B)

---

## Commands Quick Reference

### Setup Any Issue
```bash
cd worktrees/[branch-name]
cp ../../.env .
bun i
```

### Development
```bash
bun run dev              # Start dev server
bun run build            # Production build
bun run typecheck        # TypeScript validation
```

### Quality Checks
```bash
bunx eslint src/ --fix
bunx prettier --write .
bunx stylelint "src/**/*.css" --fix
```

### Git Operations
```bash
git add .
git commit -m "fix(scope): description"
git push -u origin [branch-name]
gh pr create --fill
```

---

## Progress Tracking

### Phase 1: Quick Wins
- [ ] #33 Table Alignment - **Not Started**
- [ ] #32 Sidebar Title Styling - **Not Started**

### Phase 2: Sidebar Enhancement
- [ ] #31 Button Text Clipping - **Not Started**

### Phase 3: Page Improvements
- [ ] #34 Mobile Landing Page - **Not Started**

### Phase 4: Deep Investigation
- [ ] #39 TOC Inconsistency - **Not Started**

---

## Success Metrics

### Per-Issue Metrics
- ✅ All acceptance criteria met
- ✅ Build passes without errors
- ✅ No TypeScript errors
- ✅ Visual regression tests pass
- ✅ Responsive on all breakpoints
- ✅ Accessibility compliance

### Overall Project Metrics
- **Code Quality**: All linting/formatting passes
- **User Experience**: Improved navigation and readability
- **Accessibility**: WCAG 2.1 AA compliance
- **Performance**: No negative impact on Lighthouse scores
- **Maintainability**: Clean, documented code

---

## Estimated Timeline

### Conservative (Sequential, Single Developer)
- **Week 1**: Complete #33, #32, #31 (6-8 hours)
- **Week 2**: Complete #34, #39 (5-9 hours)
- **Total**: 11-17 hours over 2 weeks

### Aggressive (Parallel, Two Developers)
- **Week 1**: Complete all 5 issues (5-9 hours per developer)
- **Total**: 5-9 hours over 1 week

### Realistic (Sequential with Buffer)
- **3-4 days** of actual work
- **1-2 weeks** calendar time (accounting for testing, reviews, iteration)

---

## Recommendations

### For Single Developer
✅ **Follow Sequential Order**: #33 → #32 → #31 → #34 → #39
- Builds context and confidence
- Minimizes context switching
- Clear progress milestones

### For Team
✅ **Use Parallel Track Strategy**:
- **Track A** (Sidebar): #33 → #32 → #31
- **Track B** (Pages): #34 → #39
- Clear separation of concerns
- Faster delivery

### General Best Practices
1. ✅ Start with #33 (quick win)
2. ✅ Test thoroughly at each step
3. ✅ Merge incrementally (don't batch)
4. ✅ Deploy to staging between merges
5. ✅ Keep PRs small and focused
6. ✅ Document any unexpected findings

---

## Notes

- All worktrees created and ready for work
- TASK.md files provide detailed implementation plans
- Each issue has comprehensive testing checklists
- Color accessibility verified (#838996 + #e5e4e2 = ~6.5:1 contrast)
- Mobile-first approach for #34
- No content branch conflicts (main is code-only)

---

## Contact & Resources

- **Issues**: All open issues by jen on GitHub
- **Worktrees**: `./worktrees/[branch-name]/`
- **Task Plans**: `./worktrees/[branch-name]/TASK.md`
- **Documentation**: [Docusaurus Docs](https://docusaurus.io/)

---

**Last Updated**: 2025-10-03
**Next Review**: After Phase 1 completion
