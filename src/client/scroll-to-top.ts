/**
 * Client module to add scroll-to-top functionality for active navigation elements.
 * Handles both breadcrumbs and sidebar active items.
 *
 * @see https://docusaurus.io/docs/advanced/client#client-module-lifecycles
 *
 * Test change for Docker workflow verification.
 */

import type { ClientModule } from "@docusaurus/types";

interface NavigationHandler {
  /** CSS selector for the container element */
  selector: string;
  /** Returns true if clicking this target should trigger scroll-to-top */
  shouldScrollToTop: (target: HTMLElement) => boolean;
}

/**
 * Scrolls the page to top with smooth animation.
 */
function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Navigation handler configurations.
 *
 * Breadcrumb detection: Active breadcrumb (current page) has NO <a> tag,
 * just a <span>. Navigation breadcrumbs have <a> tags.
 *
 * DOM structure:
 *   <li class="breadcrumbs__item">
 *     <a class="breadcrumbs__link" href="...">Navigation</a>
 *   </li>
 *   <li class="breadcrumbs__item breadcrumbs__item--active">
 *     <span class="breadcrumbs__link">Current Page</span>
 *   </li>
 */
const navigationHandlers: NavigationHandler[] = [
  {
    selector: ".theme-doc-breadcrumbs",
    shouldScrollToTop: (target) => {
      const breadcrumbItem = target.closest(".breadcrumbs__item");
      if (!breadcrumbItem) return false;
      // Active breadcrumb has no link
      return breadcrumbItem.querySelector("a") === null;
    },
  },
  {
    selector: ".theme-doc-sidebar-menu",
    shouldScrollToTop: (target) => {
      return (
        target.closest(".menu__link--active") !== null ||
        target.closest('[aria-current="page"]') !== null
      );
    },
  },
];

/**
 * Attaches click handlers to navigation elements.
 */
function attachScrollHandlers(): void {
  for (const { selector, shouldScrollToTop } of navigationHandlers) {
    const container = document.querySelector(selector);
    if (!container || container.hasAttribute("data-scroll-handler")) {
      continue;
    }

    container.setAttribute("data-scroll-handler", "true");
    container.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (shouldScrollToTop(target)) {
        event.preventDefault();
        scrollToTop();
      }
    });
  }
}

/**
 * Clears handler markers so they can be re-attached after navigation.
 */
function clearHandlerMarkers(): void {
  for (const { selector } of navigationHandlers) {
    document.querySelector(selector)?.removeAttribute("data-scroll-handler");
  }
}

const clientModule: ClientModule = {
  onRouteDidUpdate() {
    // Clear markers since React may have replaced elements
    clearHandlerMarkers();
    // Wait for React to finish rendering
    requestAnimationFrame(attachScrollHandlers);
  },
};

export default clientModule;
