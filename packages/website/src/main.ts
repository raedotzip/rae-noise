import $ from "jquery";
import "./views";
import initDemo from "./demo";
import { currentRouteKey, renderRoute } from "./router";
import "./../styles/styles.css";

/**
 * Main application router — renders the correct page template and
 * initialises page-specific behaviour (e.g. the editor demo).
 */
function router(): void {
  const pathname: string = window.location.pathname;

  renderRoute(pathname);

  const key: string = currentRouteKey(pathname);
  if (key === "editor") {
    initDemo();
  }

  // Highlight the active nav link
  const base: string = import.meta.env.BASE_URL.replace(/\/$/, "");
  $(".nav-link").each(function (this: HTMLElement): void {
    const $link: JQuery<HTMLElement> = $(this);
    const href: string = $link.attr("href") ?? "";
    const linkPath: string = href.replace(base, "") || "/";
    const currentPath: string = window.location.pathname.replace(base, "") || "/";
    $link.toggleClass("active", linkPath === currentPath);
  });
}

// SPA navigation
$(window).on("popstate", router);

$(document).on("click", "[data-link]", function (this: HTMLAnchorElement, e: JQuery.ClickEvent): void {
  e.preventDefault();
  history.pushState(null, "", $(this).attr("href") ?? "");
  router();
});

router();
