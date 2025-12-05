/**
 * Client module to add scroll-to-top functionality for active navigation elements
 * Handles both breadcrumbs and sidebar active items
 * Issue #014: Mobile TOC/sidebar doesn't scroll back to the top
 */

import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

if (ExecutionEnvironment.canUseDOM) {
  let observer: MutationObserver | null = null;

  /**
   * Scrolls the page to top with smooth animation
   */
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /**
   * Configuration for different navigation elements
   */
  const navigationHandlers = [
    {
      selector: ".theme-doc-breadcrumbs",
      shouldScrollToTop: (target: HTMLElement): boolean => {
        // First check: Never scroll if clicking on or inside a link (navigation)
        if (target.closest("a") !== null) {
          return false;
        }

        // Second check: Only scroll if clicking inside the active breadcrumb item
        // Docusaurus renders active breadcrumb as: <li class="breadcrumbs__item--active"><span>Current Page</span></li>
        // This prevents scrolling when clicking on empty space around breadcrumbs
        return target.closest(".breadcrumbs__item--active") !== null;
      },
    },
    {
      selector: ".theme-doc-sidebar-menu",
      shouldScrollToTop: (target: HTMLElement): boolean => {
        // Check if clicked element is or is within an active menu link
        return (
          target.closest(".menu__link--active") !== null ||
          target.closest('[aria-current="page"]') !== null
        );
      },
    },
  ];

  /**
   * Adds click handlers to navigation elements
   */
  const addScrollHandlers = () => {
    navigationHandlers.forEach(({ selector, shouldScrollToTop }) => {
      const element = document.querySelector(selector);

      if (element && !element.hasAttribute("data-scroll-handler")) {
        // Mark that we've added the handler to avoid duplicates
        element.setAttribute("data-scroll-handler", "true");

        element.addEventListener("click", (event) => {
          const target = event.target as HTMLElement;

          if (shouldScrollToTop(target)) {
            event.preventDefault();
            scrollToTop();
          }
        });
      }
    });
  };

  // Run on initial load
  addScrollHandlers();

  // Re-run when navigation occurs (for SPA navigation)
  const startObserving = () => {
    const docRoot =
      document.querySelector('[class*="docRoot"]') ||
      document.querySelector("main");

    if (docRoot) {
      observer = new MutationObserver(() => {
        addScrollHandlers();
      });

      observer.observe(docRoot, {
        childList: true,
        subtree: false, // Only observe direct children for performance
      });
    }
  };

  // Start observing after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserving);
  } else {
    startObserving();
  }

  // Cleanup observer when page unloads
  window.addEventListener("beforeunload", () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });
}

export default function scrollToTop(): void {
  // This function is required for Docusaurus client modules
  // but the actual work is done in the module scope above
}
