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
   * Add click handler to breadcrumbs items directly
   */
  const addBreadcrumbsHandler = () => {
    const breadcrumbsContainer = document.querySelector(
      ".theme-doc-breadcrumbs"
    );

    if (!breadcrumbsContainer) {
      return;
    }

    // Find all breadcrumb items
    const items = breadcrumbsContainer.querySelectorAll(".breadcrumbs__item");
    console.log("[ScrollToTop] Found breadcrumb items:", items.length);

    items.forEach((item, index) => {
      // Skip if already has handler
      if (item.hasAttribute("data-scroll-handler")) {
        return;
      }

      // Check if this item contains a link or just a span (active item)
      const link = item.querySelector("a");
      const isActive = !link; // If no link, it's the active/current item

      console.log(
        `[ScrollToTop] Item ${index}: isActive=${isActive}, hasLink=${!!link}`
      );

      if (isActive) {
        // This is the active breadcrumb (no link, just text)
        item.setAttribute("data-scroll-handler", "true");
        item.addEventListener("click", (event) => {
          console.log("[ScrollToTop] Active breadcrumb clicked!");
          event.preventDefault();
          scrollToTop();
        });
      }
      // If it has a link, we don't attach a handler - let it navigate normally
    });
  };

  /**
   * Configuration for sidebar navigation
   */
  const navigationHandlers = [
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
    // Handle breadcrumbs separately
    addBreadcrumbsHandler();

    // Handle other navigation elements (sidebar, etc.)
    navigationHandlers.forEach(({ selector, shouldScrollToTop }) => {
      const element = document.querySelector(selector);

      if (element && !element.hasAttribute("data-scroll-handler")) {
        // Mark that we've added the handler to avoid duplicates
        element.setAttribute("data-scroll-handler", "true");
        console.log("[ScrollToTop] Handler attached to:", selector);

        element.addEventListener("click", (event) => {
          const target = event.target as HTMLElement;

          if (shouldScrollToTop(target)) {
            console.log(
              "[ScrollToTop] Sidebar active item clicked, scrolling!"
            );
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
