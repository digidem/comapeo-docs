/**
 * Client module to add scroll-to-top functionality to breadcrumbs
 * Issue #61: Make breadcrumbs clickable to scroll back to top
 */

import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

if (ExecutionEnvironment.canUseDOM) {
  let observer: MutationObserver | null = null;

  // Get the base URL from the site config
  const getBaseUrl = (): string => {
    // Docusaurus provides the base URL in the HTML base tag
    const baseTag = document.querySelector("base");
    return baseTag?.getAttribute("href") || "/";
  };

  // Check if a link is a home link
  const isHomeLink = (href: string | null): boolean => {
    if (!href) return false;

    const baseUrl = getBaseUrl();
    const normalizedHref = href.endsWith("/") ? href : href + "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    // Check for home link patterns
    return (
      href === "/" ||
      href === baseUrl ||
      normalizedHref === normalizedBase ||
      href === "/docs" ||
      href === `${baseUrl}docs` ||
      href.endsWith("breadcrumbs__link--home")
    );
  };

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
        if (clickedLink) {
          const href = clickedLink.getAttribute("href");
          const hasHomeClass = clickedLink.classList.contains(
            "breadcrumbs__link--home"
          );

          if (isHomeLink(href) || hasHomeClass) {
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
