/**
 * Client module to add scroll-to-top functionality to breadcrumbs
 * Issue #61: Make breadcrumbs clickable to scroll back to top
 */

import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

if (ExecutionEnvironment.canUseDOM) {
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

        // Allow home link to navigate normally
        // Home link is typically the first breadcrumb or has specific attributes
        if (clickedLink) {
          const href = clickedLink.getAttribute("href");
          // Only allow navigation for home links (/, /docs, or base path)
          if (
            href === "/" ||
            href === "/docs" ||
            clickedLink.classList.contains("breadcrumbs__link--home")
          ) {
            // Let the home link work normally
            return;
          }
        }

        // For all other clicks (including other breadcrumb links), scroll to top
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
  const observer = new MutationObserver(() => {
    addBreadcrumbsClickHandler();
  });

  // Observe the main content area for changes
  const startObserving = () => {
    const mainContent = document.querySelector("main");
    if (mainContent) {
      observer.observe(mainContent, {
        childList: true,
        subtree: true,
      });
    }
  };

  // Start observing after a short delay to ensure DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserving);
  } else {
    startObserving();
  }
}

export default function breadcrumbsScrollToTop(): void {
  // This function is required for Docusaurus client modules
  // but the actual work is done in the module scope above
}
