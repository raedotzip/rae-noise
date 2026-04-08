// src/views/index.ts
import Handlebars from "handlebars";

const modules = import.meta.glob("./**/*.hbs", {
  eager: true,
  query: "?raw",
  import: "default",
});

const templates: Record<string, Handlebars.TemplateDelegate> = {};

for (const path in modules) {
  const content = modules[path] as string;

  if (path.includes("/partials/")) {
    // This logic ensures 'partials/ui/tooltip.hbs' becomes 'ui/tooltip'
    const name = path
      .split("/partials/")[1]  // Get everything after /partials/
      .replace(".hbs", "");    // Remove extension
    
    Handlebars.registerPartial(name, content);
  } else {
    // For main templates like app.hbs
    const name = path.replace("./", "").replace(".hbs", "").replace(/\//g, "-");
    templates[name] = Handlebars.compile(content);
  }
}

export { templates };