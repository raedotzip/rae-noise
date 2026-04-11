import $ from "jquery";
import Handlebars from "handlebars";

/** Import and register all Handlebars partials and templates at module load. */

const partialModules: Record<string, string> = import.meta.glob("./views/partials/**/*.hbs", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

for (const path in partialModules) {
  const name: string = path.replace("./views/partials/", "").replace(".hbs", "");
  Handlebars.registerPartial(name, partialModules[path]);
}

const templateModules: Record<string, string> = import.meta.glob("./views/templates/*.hbs", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const templates: Record<string, Handlebars.TemplateDelegate> = {};
for (const path in templateModules) {
  const name: string = path.replace("./views/templates/", "").replace(".hbs", "");
  templates[name] = Handlebars.compile(templateModules[path]);
}

/** Route definition mapping a URL path to a template key and data. */
interface RouteEntry {
  key: string;
  data: Record<string, unknown>;
}

const routes: Record<string, RouteEntry> = {
  "/": { key: "home", data: {} },
  "/editor": { key: "editor", data: {} },
  "/docs": { key: "docs", data: {} },
};

/**
 * Normalise a full pathname by stripping the deployment base prefix.
 * Returns a path relative to the app root (e.g. "/" or "/editor").
 */
function normalise(path: string): string {
  const base: string = import.meta.env.BASE_URL.replace(/\/$/, "");
  return base && path.startsWith(base) ? path.slice(base.length) || "/" : path;
}

/**
 * Render the correct Handlebars template into `#app` for the given path.
 */
export function renderRoute(path: string): void {
  const normalised: string = normalise(path);
  const route: RouteEntry = routes[normalised] ?? routes["/"];
  const template: Handlebars.TemplateDelegate = templates[route.key] ?? templates.home;
  const base: string = import.meta.env.BASE_URL.replace(/\/$/, "");
  const $app: JQuery<HTMLElement> = $("#app");

  if ($app.length) {
    $app.html(template({ ...route.data, base }));
  }
}

/**
 * Returns the normalised route key for the current path.
 * Used by main.ts to decide which page-specific init to run.
 */
export function currentRouteKey(path: string): string {
  const normalised: string = normalise(path);
  return (routes[normalised] ?? routes["/"]).key;
}
