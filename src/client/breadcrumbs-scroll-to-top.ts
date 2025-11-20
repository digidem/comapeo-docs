/**
 * Client module to add scroll-to-top functionality to breadcrumbs
 * Issue #61: Make breadcrumbs clickable to scroll back to top
 */

import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

if (ExecutionEnvironment.canUseDOM) {
  let observer: MutationObserver | null = null;

  // Add click handler to breadcrumbs after DOM is loaded
  const addBreadcrumbsClickHandler = () => {
    const breadcrumbs = document.querySelector(".theme-doc-breadcrumbs");

    if (breadcrumbs && !breadcrumbs.hasAttribute("data-scroll-handler")) {
      // Mark that we've added the handler to avoid duplicates
      breadcrumbs.setAttribute("data-scroll-handler", "true");

      breadcrumbs.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;

        // Check if the click originated from within an anchor tag
        const clickedLink = target.closest("a");

        // If clicking on ANY link (home or intermediate breadcrumbs), let it navigate
        // Breadcrumbs are navigation controls - they must work!
        if (clickedLink) {
          // Let all breadcrumb links work normally for hierarchical navigation
          return;
        }

        // Only scroll to top when clicking on:
        // - The breadcrumb container itself
        // - The current page text (usually a <span>, not a link)
        // - Empty space in the breadcrumbs area
        event.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      });
    }
  };

  // Run on initial load
  addBreadcrumbsClickHandler();

  // Re-run when navigation occurs (for SPA navigation)
  // Use a more targeted observation to improve performance
  const startObserving = () => {
    const docRoot =
      document.querySelector('[class*="docRoot"]') ||
      document.querySelector("main");

    if (docRoot) {
      observer = new MutationObserver(() => {
        addBreadcrumbsClickHandler();
      });

      observer.observe(docRoot, {
        childList: true,
        subtree: false, // Only observe direct children, not deep subtree
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

export default function breadcrumbsScrollToTop(): void {
  // This function is required for Docusaurus client modules
  // but the actual work is done in the module scope above
}
