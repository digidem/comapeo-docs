# Task: Fix Image Zoom Top Gap While Preserving Proportions

## Summary
- Problem: When zooming images in docs (using `docusaurus-plugin-image-zoom`), a large white gap appears above the image. In some iterations, images also got distorted or click-to-close broke.
- Goal: Maximize image area during zoom without ever distorting proportions. Images should fully fit within the viewport (either width or height) and not overflow; the top gap should be eliminated for tall images.
- Current status: Distortion is fixed. Top gap persists in multiple edge cases.

## Environment
- Docusaurus v3
- Plugin: `docusaurus-plugin-image-zoom` (with `medium-zoom` under the hood)
- Site has a fixed navbar; Docusaurus typically adds top padding to content equal to navbar height

## Desired Behavior
- Zoom mode should:
  - Maintain image aspect ratio, always (no stretch/compress)
  - Fill the viewport height for tall images (no top gap), or fill viewport width for wide images (vertical space is acceptable)
  - Enable closing via second click on the image and via overlay
  - Optionally provide a subtle close button in the top-right

## Current Config and CSS Hooks
- `docusaurus.config.ts`
  - Plugin enabled: `'docusaurus-plugin-image-zoom'`
  - `themeConfig.zoom`:
    - `selector: '.theme-doc-markdown img:not(.no-zoom)'`
    - `background`: theme-aware
    - `config`: `{ margin: 0, scrollOffset: 0 }` (set to remove plugin margins)
- `src/css/custom.css`
  - Base images in docs capped to `max-height: 50vh` (outside zoom)
  - Navbar hidden and scroll locked during zoom using body classes:
    - `body.zooming`, `body.zoom-open`, and `:has(img.medium-zoom-image--opened)`
  - Various attempts to control zoomed image sizing and positioning
- `src/theme/Root.tsx` (client-only enhancer)
  - Adds body class `zooming` on `pointerdown` for zoomable images so navbar is hidden before plugin measures
  - Observes DOM mutations to toggle `zoom-open` while an image has `medium-zoom-image--opened`
  - Renders a subtle top-right close button during zoom, which clicks the overlay

## What We Tried (with pros/cons)

1) Cap images globally during zoom via CSS
- CSS (earlier attempt):
  - `img.medium-zoom-image--opened { max-height: 98svh; max-width: 98vw; width: auto; height: auto; margin: 0; cursor: zoom-out; }`
- Result:
  - Some devices showed distortion or the plugin fought our sizing; occasionally broke click-to-close (due to positioning/z-index changes in other variants)
  - Top gap reduced but not consistently eliminated

2) Remove all caps in zoom; let plugin control everything
- CSS (later attempt):
  - `img.medium-zoom-image--opened { max-height: none; max-width: none; width: auto; height: auto; margin: 0; }`
- Result:
  - Fixed distortion reliably
  - Top gap remained (plugin vertically centers; any remaining layout padding exacerbates the gap)

3) Force top alignment with fixed positioning
- CSS (another attempt):
  - Pin image to top: `position: fixed; top: 0; left: 50%; transform: translateX(-50%) !important; height: 100svh; width: auto;`
- Result:
  - Removed top gap
  - Introduced regressions: click-to-close sometimes failed (interfered with plugin’s transform/overlay ordering); in some cases, reintroduced distortion due to conflicts with plugin transforms

4) Post-open transform adjustment (matrix math)
- Logic:
  - Read `getComputedStyle(img).transform` after plugin opens, extract scale and translation
  - Compute leftover vertical space and shift Y translation to top-align
- Result:
  - Maintained proportions and plugin event handling
  - Still saw top gap in cases; likely due to transform reflows, address bar changes, or plugin’s subsequent adjustments

5) Aspect-ratio based explicit fit (JS-driven)
- Logic:
  - On open, compute `imgAR` vs `vpAR` using `visualViewport` where available
  - If tall: set `position: fixed; top: 0; left: 50%; transform: translateX(-50%); height: <viewport px>; width: auto;`
  - If wide: set `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: <viewport px>; height: auto;`
  - Recompute on resize/orientationchange; clean up on close
- Result:
  - Proportions preserved, but in practice the top gap persisted in some environments (likely fighting plugin animations/transform order or overlay timing)

6) Navbar and layout adjustments
- Hiding navbar before plugin measures via `pointerdown` capture (works)
- Removing padding-top on `.main-wrapper` while zooming (helps)
- Still suspect there are other offsets present during measurement (e.g., Docusaurus fixed navbar variables, safe-area insets, other wrappers)

## Files Touched
- `src/css/custom.css`
  - Base image sizing in docs
  - Zoom state styles for navbar, scroll lock, and various image sizing attempts
- `docusaurus.config.ts`
  - Added `'docusaurus-plugin-image-zoom'` to `plugins`
  - Added `themeConfig.zoom` with `{ margin: 0, scrollOffset: 0 }`
  - Added `rehype` plugin hook for figures/captions (see below)
- `scripts/rehype-image-figure.ts`
  - Simple rehype: wraps standalone images in `<figure>` and uses `alt` as `<figcaption>` (not directly related to zoom sizing)
- `src/theme/Root.tsx`
  - Client enhancement to coordinate navbar hiding, zoom state, close button, and multiple experimental sizing strategies

## Observations / Hypotheses
- The plugin vertically centers images by design. With no `margin`, it still computes a centered translate. If any layout padding remains at measurement, the translate will include it, creating top gap.
- Docusaurus’ fixed navbar normally adds top offset via CSS variables (e.g., `--ifm-navbar-height`) and wrappers. We remove padding from `.main-wrapper`, but other elements may still contribute top spacing or affect the plugin’s calculation.
- On mobile, the address bar affects `innerHeight` during transitions; `visualViewport.height` is more accurate. We already use it in some attempts, but timing may still be off.
- Overriding the plugin’s transform or positioning fully removes the gap but risks fighting its click/overlay behavior unless carefully layered.

## Repro Steps
1) Start dev server: `bun run dev`
2) Navigate to any doc with a tall image
3) Click image to zoom
4) Observe: navbar hides, image keeps proportions, but a white space remains above the image (image is not top-aligned), or in some variants closing via second click fails

## Acceptance Criteria
- Zoomed image retains original proportions and never overflows viewport
- Tall images: no white gap above (top-aligned), fill 100% of viewport height
- Wide images: fill 100% of viewport width, centered vertically, no overflow
- Click-to-close and overlay click both work; the close button provides an additional accessible method

## Proposed Next Steps (Precise Fixes)
1) Identify and eliminate all layout offsets in zoom-open state before measurement:
   - Inspect Docusaurus fixed navbar CSS; during `zooming/zoom-open`, override `:root { --ifm-navbar-height: 0 !important; }` and remove any `padding-top` that depends on it (e.g., `.navbar--fixed + .main-wrapper`).
   - Ensure no other wrappers (e.g., `.container`, `.main-wrapper`, page headers) add `margin-top`/`padding-top`.

2) Sync timing with plugin measurement:
   - On `pointerdown`, add `zooming` class and in the next animation frame, trigger a synthetic `click` programmatically on the image to ensure the plugin measures only after layout changes.
   - Alternatively, listen for overlay insertion and immediately re-open after forcing layout (close if opened prematurely).

3) Controlled top-aligned sizing without breaking close:
   - After open, set only `position: fixed` + explicit `height: visualViewport.height` for tall images (width auto), with `transform: translateX(-50%)` — do not change z-index or pointer events; rely on overlay for closing.
   - For wide images, set only `width: visualViewport.width` (height auto) and center vertically via `top: 50%; transform: translate(-50%, -50%)`.
   - Reapply on `visualViewport.resize`.

4) Safety fallbacks:
   - If any click-to-close regression appears, ensure overlay remains above the image in z-order (or let image stay above overlay but attach a click handler to call `overlay.click()`).
   - Consider disabling any prior CSS that targets `img.medium-zoom-image--opened` except for `margin: 0` and `cursor: zoom-out` to avoid conflicts.

5) Measure and log (temporary):
   - Log computed `transform`, `boundingClientRect`, and any padding/margins for the opened image and parents to understand remaining offsets. Remove logs before commit.

## Optional Enhancements (Once Fixed)
- Add an opt-in class `zoom-top` for any images that must always top-align (applied during zoom)
- Add safe-area insets handling for iOS: subtract `env(safe-area-inset-top/bottom)` from viewport height when computing fits
- Add lightbox controls (prev/next) if/when multiple images are in series

## References
- Plugin: https://github.com/gabrielcsapo/docusaurus-plugin-image-zoom
- Medium Zoom internals: https://github.com/francoischalifour/medium-zoom

## Appendix: Key Code Locations
- Config: `docusaurus.config.ts` (plugin and themeConfig.zoom)
- CSS: `src/css/custom.css` (navbar hiding, zoom overrides, base image sizing)
- Client enhancer: `src/theme/Root.tsx` (pointerdown timing, state classes, close button, experimental sizing logic)
- Rehype (optional): `scripts/rehype-image-figure.ts` (figures/captions; not directly tied to zoom sizing)
