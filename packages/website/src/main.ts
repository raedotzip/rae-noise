import "./views";
import initDemo from "./demo";
import { currentRouteKey, renderRoute } from "./router";
import "./../styles/styles.css";

function router() {
  renderRoute(window.location.pathname);
  const key = currentRouteKey(window.location.pathname);

  if (key === "editor") {
    initDemo();
  }

  // Highlight the active nav link
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".nav-link")) {
    const href = link.getAttribute("href") ?? "";
    const linkPath = href.replace(base, "") || "/";
    link.classList.toggle("active", linkPath === (window.location.pathname.replace(base, "") || "/"));
  }
}

window.addEventListener("popstate", router);

document.addEventListener("click", (e) => {
  const target = e.target as HTMLAnchorElement;
  if (target.matches("[data-link]")) {
    e.preventDefault();
    history.pushState(null, "", target.href);
    router();
  }
});

router();
