import "./views";
import initDemo from "./demo";
import { renderRoute } from "./router";
import "./../styles/styles.css";

function router() {
  renderRoute(window.location.pathname);
  initDemo();
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
