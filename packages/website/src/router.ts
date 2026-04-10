import Handlebars from "handlebars";

const partialModules = import.meta.glob("./views/partials/**/*.hbs", {
  eager: true,
  query: "?raw",
  import: "default",
});

for (const path in partialModules) {
  const name = path.replace("./views/partials/", "").replace(".hbs", "");
  Handlebars.registerPartial(name, partialModules[path] as string);
}

const templateModules = import.meta.glob("./views/templates/*.hbs", {
  eager: true,
  query: "?raw",
  import: "default",
});

const templates: Record<string, Handlebars.TemplateDelegate> = {};
for (const path in templateModules) {
  const name = path.replace("./views/templates/", "").replace(".hbs", "");
  templates[name] = Handlebars.compile(templateModules[path] as string);
}

const routes: Record<string, { key: string; data: Record<string, unknown> }> = {
  "/": { key: "home", data: {} },
  "/editor": { key: "editor", data: {} },
  "/docs": { key: "docs", data: {} },
};

export function renderRoute(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalised = base && path.startsWith(base) ? path.slice(base.length) || "/" : path;
  const route = routes[normalised] ?? routes["/"];
  const template = templates[route.key] ?? templates.home;
  const app = document.getElementById("app");
  if (app) app.innerHTML = template({ ...route.data, base });
}

/**
 * Returns the normalised route key for the current path.
 * Used by main.ts to decide which page-specific init to run.
 */
export function currentRouteKey(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const normalised = base && path.startsWith(base) ? path.slice(base.length) || "/" : path;
  return (routes[normalised] ?? routes["/"]).key;
}
