# rae-noise

A WebGL2-powered library for real-time procedural visuals on the web. Design layered noise, gradients, and (soon) particles in a live editor, then ship them to production.

> [**Live demo**](https://raedotzip.github.io/rae-noise) · [**GitHub**](https://github.com/raedotzip/rae-noise) · [**Report an issue**](https://github.com/raedotzip/rae-noise/issues)

---

## Start here

rae-noise is built around a **plugin-driven renderer**: each visual type is a self-contained module, and the renderer orchestrates them. Pick the guide that matches what you want to do.

| I want to… | Read |
|---|---|
| **Use rae-noise in a website** | [Quick start](#quick-start) below, then the [Architecture](Guide-Architecture) guide |
| **Understand how the codebase fits together** | [Architecture](Guide-Architecture) |
| **Add a new visual type (particles, lines, sprites…)** | [Plugin system](Guide-Plugin-System) |
| **Understand the GPU rendering pipeline** | [Rendering pipeline](Guide-Rendering-Pipeline) |
| **Group and position layers with parent-child transforms** | [Scene graph](Guide-Scene-Graph) |
| **Look up a specific type or function** | See the **API Reference** section in the sidebar |

## Quick start

```bash
# Not yet published — awaiting 1.0
pnpm add rae-noise
```

```ts
import { createRenderer, defaultLayer } from "rae-noise";

const canvas = document.querySelector("canvas")!;
const renderer = createRenderer(canvas);

renderer.addLayer({
  ...defaultLayer(),
  noiseType: "fbm",
  scale: 4,
  speed: 0.2,
  palette: [
    [0.0, 0.02, 0.08],
    [0.0, 0.6, 0.4],
    [0.1, 0.9, 0.7],
  ],
});
```

That's it — you have an animated gradient filling the canvas. Everything else (layering, blend modes, scene graph, compile-to-production) is additive.

## Guides

<!-- GUIDE_PAGES -->

## How the wiki is maintained

**Every page in this wiki is generated from the repository.** Guides live in [`packages/core/docs/guides/`](https://github.com/raedotzip/rae-noise/tree/main/packages/core/docs/guides), the API reference is generated from TSDoc comments in the source via TypeDoc, and a [GitHub Action](https://github.com/raedotzip/rae-noise/blob/main/.github/workflows/sync-wiki.yml) pushes both into this wiki on every commit to `main`.

That means:

- **Don't edit pages in the wiki UI** — your changes will be overwritten on the next sync. Open a PR against the repo instead.
- **Every generated page has an "Edit this page" footer** linking to the source file.
- **Hand-written pages in the wiki UI that don't collide with `Guide-*`, `API-*`, `Home`, or `_Sidebar`** are preserved across syncs.

## Project status

rae-noise is pre-1.0 and not yet published to npm. The core renderer, plugin system, FBO compositor, scene graph, JSON config serializer, and editor demo are all working and under active development. Follow the repo for release news.
