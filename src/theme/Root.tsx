import React, { useEffect } from "react";

// Enhances image zoom UX by working WITH the medium-zoom plugin
// - Hides navbar before plugin measures layout
// - Uses CSS transforms to adjust final positioning without breaking plugin
// - Preserves all plugin functionality (animations, events, z-index)

const ZOOM_SELECTOR = ".theme-doc-markdown img:not(.no-zoom)";

export default function Root({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const img = target.closest("img");
      if (img && (img as Element).matches(ZOOM_SELECTOR)) {
        document.body.classList.add("zooming");
      }
    };

    // Get viewport dimensions
    const getViewport = () => {
      const vv = (window as any).visualViewport;
      return {
        width: vv?.width ? Math.floor(vv.width) : window.innerWidth,
        height: vv?.height ? Math.floor(vv.height) : window.innerHeight,
      };
    };

    // Apply top-alignment adjustment AFTER plugin completes its positioning
    const adjustImagePosition = (img: HTMLImageElement) => {
      if (!img.naturalWidth || !img.naturalHeight) return;

      const { width: vpW, height: vpH } = getViewport();
      const imgAR = img.naturalWidth / img.naturalHeight;
      const vpAR = vpW / vpH;

      // Only adjust tall images that would benefit from top alignment
      if (imgAR <= vpAR) {
        // Get the current transform from the plugin
        const currentTransform = window.getComputedStyle(img).transform;

        // Parse the current transform to extract scale and translate values
        const matrix = new DOMMatrix(currentTransform);
        const currentScale = matrix.a; // scale from transform matrix

        // Calculate how much we need to shift up to eliminate top gap
        const scaledHeight = img.naturalHeight * currentScale;
        const topShift = (vpH - scaledHeight) / 2;

        // Apply additional transform to move image to top
        // This works with the plugin's transform rather than replacing it
        img.style.transform = `${currentTransform} translateY(${-topShift}px)`;
        img.setAttribute("data-top-aligned", "true");
      }
    };

    // Cleanup function
    const clearAdjustment = (img: HTMLImageElement | null) => {
      if (img && img.hasAttribute("data-top-aligned")) {
        img.removeAttribute("data-top-aligned");
        // Let plugin handle transform restoration
      }
    };

    // Observe for zoom state changes
    const observer = new MutationObserver(() => {
      const opened = document.querySelector(
        "img.medium-zoom-image--opened"
      ) as HTMLImageElement | null;
      const isOpened = Boolean(opened);

      if (isOpened && opened) {
        document.body.classList.add("zoom-open");
        setOpen(true);

        // Wait for plugin's animation to complete, then apply our adjustment
        const handleTransitionEnd = () => {
          adjustImagePosition(opened);
          opened.removeEventListener("transitionend", handleTransitionEnd);
        };
        opened.addEventListener("transitionend", handleTransitionEnd);

        // Fallback timeout in case transitionend doesn't fire
        setTimeout(() => adjustImagePosition(opened), 300);
      } else {
        // Clear any adjustments on close
        const prevAdjusted = document.querySelector(
          "img[data-top-aligned]"
        ) as HTMLImageElement | null;
        clearAdjustment(prevAdjusted);

        document.body.classList.remove("zoom-open");
        document.body.classList.remove("zooming");
        setOpen(false);
      }
    });

    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });

    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true as any);
      observer.disconnect();
    };
  }, []);

  const handleClose = () => {
    // Use plugin's preferred close method
    const overlay = document.querySelector(
      ".medium-zoom-overlay"
    ) as HTMLElement | null;
    if (overlay) {
      overlay.click();
      return;
    }

    // Fallback to image click
    const opened = document.querySelector(
      "img.medium-zoom-image--opened"
    ) as HTMLElement | null;
    if (opened) {
      opened.click();
    }
  };

  return (
    <>
      {children}
      {open ? (
        <button
          type="button"
          aria-label="Close image"
          className="zoom-close-btn"
          onClick={handleClose}
        >
          ✕
        </button>
      ) : null}
    </>
  );
}
