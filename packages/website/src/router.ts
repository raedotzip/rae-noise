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

const routes: Record<string, { key: string; data: unknown }> = {
  "/":       { key: "demo",   data: {}   },
  "/docs":   { key: "docs",   data: {}   },
};

// export function renderNav() {
//   const navTemplate = Handlebars.compile(Handlebars.partials["nav/nav"] as string);
//   const mobileTemplate = Handlebars.compile(Handlebars.partials["nav/mobile-nav"] as string);
//   document.getElementById("nav")!.innerHTML = navTemplate(siteData);
//   document.getElementById("mobile-nav")!.innerHTML = mobileTemplate(siteData);
// }

export function renderRoute(path: string) {
  const route = routes[path] ?? routes["/"];
  const template = templates[route.key] ?? templates.home;
  const app = document.getElementById("app");
  if (app) app.innerHTML = template(route.data);
}