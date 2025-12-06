# Scroll-to-Top Breadcrumb Issue - Engineering Handoff

## Problem Statement

PR #106 implemented a scroll-to-top feature for breadcrumbs and sidebar navigation. However, **the breadcrumb scroll-to-top functionality is not working**. When users click on the active/current breadcrumb item, the page should scroll to the top smoothly, but this behavior is not triggering.

## What Should Happen

### Expected Behavior
1. **Click on active/current breadcrumb** (the last one, showing current page) → Page scrolls to top smoothly
2. **Click on navigation breadcrumbs** (Home, parent pages) → Navigate normally to those pages
3. **Click on active sidebar item** → Page scrolls to top (this part works)

### Current Behavior
- Clicking the active breadcrumb does nothing (no scroll)
- Navigation breadcrumbs work fine (they navigate)
- Sidebar scroll-to-top works correctly

## Docusaurus Breadcrumb DOM Structure

Based on Docusaurus v3.9.2 source code research:

```html
<nav class="theme-doc-breadcrumbs breadcrumbsContainer_[hash]" aria-label="Breadcrumbs">
  <ul class="breadcrumbs">
    <!-- Navigation Breadcrumbs (Have Links) -->
    <li class="breadcrumbs__item">
      <a class="breadcrumbs__link" href="/docs">
        <span>Docs</span>
      </a>
    </li>

    <li class="breadcrumbs__item">
      <a class="breadcrumbs__link" href="/docs/category">
        <span>Category</span>
      </a>
    </li>

    <!-- Active/Current Breadcrumb (No Link, Just Span) -->
    <li class="breadcrumbs__item breadcrumbs__item--active">
      <span class="breadcrumbs__link">Current Page Name</span>
    </li>
  </ul>
</nav>
```

### Key Facts
- **Active breadcrumb** (last one): Contains `<span>`, has class `breadcrumbs__item--active`
- **Navigation breadcrumbs**: Contains `<a>` tags for navigation
- **CSS customization**: Breadcrumbs are made sticky in `src/css/custom.css` (lines 392-437)
- **Z-index**: Set to 200 on desktop, 90 on mobile to prevent menu overlap

## File Locations

- **Main implementation**: `src/client/scroll-to-top.ts`
- **Docusaurus config**: `docusaurus.config.ts` (line 302 registers the client module)
- **CSS customization**: `src/css/custom.css` (lines 392-437)
- **Project version**: Docusaurus v3.9.2

## Approaches Tried (All Failed)

### Attempt 1: Event Delegation with Class Detection
**File**: `src/client/scroll-to-top.ts:28-48` (first commit)

**Approach**:
- Attached single click listener to `.theme-doc-breadcrumbs` container
- Used event delegation with `target.closest('.breadcrumbs__item--active')`
- Multiple conditions checking for active class, `aria-current`, last-child position

**Why it failed**:
- Overly complex OR chain made logic hard to debug
- Had fallback `target.closest("a") === null` that triggered on empty space clicks
- Event delegation might not work correctly with Docusaurus's React rendering

**Code**:
```typescript
shouldScrollToTop: (target: HTMLElement): boolean => {
  return (
    target.classList?.contains("breadcrumbs__item--active") ||
    target.closest(".breadcrumbs__item--active") !== null ||
    target.getAttribute("aria-current") === "page" ||
    // ... many more conditions
  );
}
```

### Attempt 2: Simplified Two-Step Check
**File**: `src/client/scroll-to-top.ts:28-38` (second commit: ac3c97e)

**Approach**:
- Simplified to clear two-step logic:
  1. If clicking a link → don't scroll
  2. If clicking inside `.breadcrumbs__item--active` → scroll
- Removed all other conditions

**Why it failed**:
- Still used event delegation on container
- `.breadcrumbs__item--active` class detection might not work with React synthetic events
- Event target might be wrong element (span vs li)

**Code**:
```typescript
if (target.closest("a") !== null) {
  return false;
}
return target.closest(".breadcrumbs__item--active") !== null;
```

### Attempt 3: Direct Item Attachment with DOM Inspection
**File**: `src/client/scroll-to-top.ts:25-63` (current code: a23526a)

**Approach**:
- Iterate through all `.breadcrumbs__item` elements
- Check if each item contains `<a>` tag: `item.querySelector("a")`
  - No link → active breadcrumb → attach click handler directly to that `<li>`
  - Has link → navigation breadcrumb → skip it
- Direct event listener on each active item instead of container delegation

**Why it's still failing** (unknown, needs investigation):
- Console logs are added but need to be checked
- Possible issues:
  1. Click handler might be getting attached but not firing
  2. `event.preventDefault()` might be blocked by something
  3. Docusaurus might be re-rendering and removing handlers
  4. CSS `pointer-events` or z-index might be blocking clicks
  5. Another event listener might be `stopPropagation()`

**Current code**:
```typescript
const addBreadcrumbsHandler = () => {
  const breadcrumbsContainer = document.querySelector(".theme-doc-breadcrumbs");
  if (!breadcrumbsContainer) return;

  const items = breadcrumbsContainer.querySelectorAll(".breadcrumbs__item");
  console.log("[ScrollToTop] Found breadcrumb items:", items.length);

  items.forEach((item, index) => {
    if (item.hasAttribute("data-scroll-handler")) return;

    const link = item.querySelector("a");
    const isActive = !link;
    console.log(`[ScrollToTop] Item ${index}: isActive=${isActive}, hasLink=${!!link}`);

    if (isActive) {
      item.setAttribute("data-scroll-handler", "true");
      item.addEventListener("click", (event) => {
        console.log("[ScrollToTop] Active breadcrumb clicked!");
        event.preventDefault();
        scrollToTop();
      });
    }
  });
};
```

## Debug Logging Currently In Place

The following console.log statements are active:

1. `[ScrollToTop] Handler attached to: .theme-doc-sidebar-menu` - Sidebar handler attached
2. `[ScrollToTop] Found breadcrumb items: N` - Number of breadcrumb items found
3. `[ScrollToTop] Item X: isActive=true/false, hasLink=true/false` - Each item's status
4. `[ScrollToTop] Active breadcrumb clicked!` - When active breadcrumb is clicked
5. `[ScrollToTop] Sidebar active item clicked, scrolling!` - When sidebar active item is clicked

## What Needs Investigation

### Priority 1: Verify Click Handler is Attached
1. Open browser DevTools console
2. Navigate to any docs page
3. Check console logs:
   - Does it show `Found breadcrumb items: X`?
   - Does it show any items with `isActive=true`?
   - Is the handler being attached?

### Priority 2: Test if Handler Fires
1. Click the active breadcrumb (last one)
2. Check if `Active breadcrumb clicked!` appears in console
   - **If YES**: Handler fires but scroll doesn't work → investigate `scrollToTop()` function or CSS blocking
   - **If NO**: Handler not firing → investigate click event blocking

### Priority 3: Inspect Actual DOM
1. Use browser DevTools Elements tab
2. Find `.theme-doc-breadcrumbs` element
3. Verify:
   - Last `<li>` has class `breadcrumbs__item--active`
   - Last `<li>` contains `<span>` (not `<a>`)
   - Check if element has `data-scroll-handler="true"` attribute
   - Check computed CSS for `pointer-events`, `z-index`, `cursor`

### Priority 4: Check Event Propagation
1. Docusaurus might have its own click handlers that call `stopPropagation()`
2. Try adding handler with `capture: true` option:
   ```typescript
   item.addEventListener("click", handler, { capture: true });
   ```
3. Or use `stopImmediatePropagation()` to prevent other handlers

### Priority 5: CSS/Positioning Issues
Check `src/css/custom.css` lines 392-437 for:
- `.theme-doc-breadcrumbs { cursor: pointer }` - Does cursor change on hover?
- `pointer-events` settings
- Z-index conflicts
- Sticky positioning blocking clicks

### Priority 6: React Re-rendering
- Docusaurus uses React and might re-render breadcrumbs on navigation
- MutationObserver at line 115-122 should re-attach handlers
- Verify observer is working by adding logs to the callback
- Check if `data-scroll-handler` attribute persists after navigation

## Possible Solutions to Try

### Solution A: Use Event Capture
```typescript
item.addEventListener("click", (event) => {
  console.log("[ScrollToTop] Active breadcrumb clicked!");
  event.preventDefault();
  event.stopPropagation(); // Stop other handlers
  scrollToTop();
}, { capture: true }); // Capture phase
```

### Solution B: Attach to Container with Better Detection
```typescript
breadcrumbsContainer.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const clickedItem = target.closest(".breadcrumbs__item");

  if (clickedItem && !clickedItem.querySelector("a")) {
    // Clicked an item without a link (active breadcrumb)
    event.preventDefault();
    event.stopPropagation();
    scrollToTop();
  }
});
```

### Solution C: Make Entire Breadcrumb Container Clickable
```typescript
// Only attach to container when last item is active
const lastItem = breadcrumbsContainer.querySelector(".breadcrumbs__item:last-child");
const hasLink = lastItem?.querySelector("a");

if (!hasLink) {
  breadcrumbsContainer.addEventListener("click", (event) => {
    event.preventDefault();
    scrollToTop();
  });
}
```

### Solution D: CSS Pointer Events Override
Add to `src/css/custom.css`:
```css
.theme-doc-breadcrumbs .breadcrumbs__item--active {
  cursor: pointer !important;
  pointer-events: auto !important;
}

.theme-doc-breadcrumbs .breadcrumbs__item--active * {
  pointer-events: none !important; /* Let clicks bubble to parent */
}
```

### Solution E: Swizzle Breadcrumb Component
If nothing else works, swizzle the Docusaurus breadcrumb component:
```bash
npm run swizzle @docusaurus/theme-classic DocBreadcrumbs -- --eject
```
Then modify `src/theme/DocBreadcrumbs/index.tsx` directly to add onClick handler.

## Testing Instructions

After implementing a fix:

1. **Build and run locally**:
   ```bash
   bun install
   bun run dev
   ```

2. **Navigate to a docs page** with breadcrumbs (not homepage)

3. **Test scenarios**:
   - Click "Home" breadcrumb → Should navigate to home
   - Click intermediate breadcrumbs → Should navigate to those pages
   - Click current page breadcrumb (last one) → Should scroll to top smoothly
   - Scroll down, click current breadcrumb again → Should scroll back to top

4. **Verify sidebar works**: Click active sidebar item → Should scroll to top

5. **Check mobile**: Test on mobile viewport (< 996px) as z-index changes

## Current Branch

- **Branch**: `claude/investigate-pr-106-fix-019E3W7FGkXebx2wfydBdcjC`
- **Last commit**: `a23526a` - "fix(scroll): rewrite breadcrumb logic to directly attach to items"
- **Related PR**: #106
- **Related Issue**: #014 (original issue for mobile TOC/sidebar scroll)

## Additional Context

### Working Sidebar Implementation
For reference, the sidebar scroll-to-top works correctly. Here's the working code:
```typescript
{
  selector: ".theme-doc-sidebar-menu",
  shouldScrollToTop: (target: HTMLElement): boolean => {
    return (
      target.closest(".menu__link--active") !== null ||
      target.closest('[aria-current="page"]') !== null
    );
  },
}
```

This uses event delegation on the container and checks if target is inside an active menu link. This approach works for sidebar but the same pattern doesn't work for breadcrumbs.

### Project Guidelines
- Prefer targeted fixes over project-wide changes
- Lint with: `bunx eslint path/to/file.ts --fix`
- Format with: `bunx prettier --write path/to/file.ts`
- Follow Conventional Commits: `fix(scroll): description`
- Do NOT commit without explicit request

## Questions for Investigation

1. **Are the console logs showing up?** This tells us if the module is loaded and executing.
2. **Is `isActive=true` showing for the last breadcrumb?** This confirms DOM detection works.
3. **Does "Active breadcrumb clicked!" appear when clicking?** This tells us if the event handler fires.
4. **What does the browser DevTools Elements inspector show** for the active breadcrumb's event listeners?
5. **Does the cursor change to pointer when hovering** over the active breadcrumb?
6. **Are there any errors in the console** when clicking the breadcrumb?

## Success Criteria

✅ Clicking the active/current breadcrumb (last one) scrolls page to top smoothly
✅ Clicking navigation breadcrumbs (Home, parents) navigates normally
✅ Sidebar active item scroll-to-top continues to work
✅ No console errors
✅ Works on both desktop and mobile viewports
✅ Survives page navigation (SPA routing)

Good luck! 🚀
