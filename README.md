# rae-noise

**Not ready for pull requests yet. working on setting up the repo myself first**

A WebGL-powered visual effects library for websites. `rae-noise` lets you drive real-time noise-based visuals — think animated gradients, layered perlin/simplex/worley fields, and palette-mapped color — through a simple renderer API.

This repo is a monorepo containing the core library and a live demo website.

→ **[Live demo](https://raedotzip.github.io/rae-noise)**

---

## ✨ Features

- 🎨 Real-time WebGL noise rendering
- 🧩 Plugin-based architecture (extensible visuals)
- ⚡ Designed for performance (FBO + shader composition)
- 🛠 Built-in noise types: Perlin, Simplex, Worley, FBM
- 🌐 Designed for modern web apps

## Packages

| Package | Description |
|---|---|
| [`rae-noise`](./packages/core) | The core library — published to npm |
| [`@rae-noise/website`](./packages/website) | Demo site — deployed to GitHub Pages |

---

## Using the library

> The npm package is not yet published. This section will be updated after the 1.0 release.

```bash
npm install rae-noise
# or
pnpm add rae-noise
```

```typescript
import { createRenderer, defaultLayer } from "rae-noise";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const renderer = createRenderer(canvas);

const layerId = renderer.addLayer({
  ...defaultLayer(),
  name: "base",
});
```

---

## Repository layout

This is a pnpm workspace with two packages: the published library and the demo site that drives its development.

```
rae-noise/
├── packages/
│   ├── core/                   # rae-noise — the npm package
│   │   ├── src/
│   │   │   ├── index.ts        # public API re-exports
│   │   │   ├── types/          # type definitions (Plugin, Layer, RendererConfig, …)
│   │   │   ├── webgl/          # low-level WebGL2 primitives (program, quad, FBO)
│   │   │   ├── plugin/         # self-contained visual plugins
│   │   │   │   └── noise/      # built-in noise plugin: shaders, builder, chunks
│   │   │   │       └── chunks/ # GLSL fragments (simplex, perlin, worley, fbm, curl, …)
│   │   │   ├── compositor/     # FBO ping-pong blending + gamma pass
│   │   │   ├── compiler/       # design-time → production-time scene compiler
│   │   │   ├── config/         # JSON envelope serializer (exportConfig / importConfig)
│   │   │   └── renderer/       # Renderer orchestrator, defaults, scene graph resolver
│   │   ├── test/               # vitest unit tests
│   │   ├── docs/
│   │   │   ├── guides/         # long-form authoring guides (synced to the wiki)
│   │   │   └── wiki/           # wiki chrome: Home.md, _Sidebar.md
│   │   └── rollup.config.ts
│   └── website/                # demo site — vanilla TS + Handlebars, deployed to Pages
│       ├── src/
│       │   ├── demo/           # editor UI, layer cards, widgets, node graph
│       │   ├── views/          # Handlebars templates + partials
│       │   └── styles/         # CSS organized into base/components/features/layout
│       └── vite.config.ts
├── .changeset/                 # pending release notes
├── .github/
│   └── workflows/
│       ├── continuous-integration.yml  # lint, typecheck, build on every PR
│       ├── deploy-website.yml          # deploys to GitHub Pages on push to main
│       ├── sync-wiki.yml               # generates API docs wiki from TypeDoc
│       └── npm-release.yml             # changesets-gated npm publish (disabled until 1.0)
└── pnpm-workspace.yaml
```

### How the core library is organized

The renderer is **plugin-driven**: each visual type (noise today, particles and sprites later) is a self-contained module under `src/plugin/` that owns its own shaders, per-layer GPU state, config schema, and compiled output. Adding a new visual type is one new plugin file with zero changes to shared code — see [`packages/core/docs/guides/plugin-system.md`](./packages/core/docs/guides/plugin-system.md).

| Area | Purpose |
| --- | --- |
| `types/` | The `Plugin<L>` interface, layer types, `Transform2D` / `WorldTransform`, `RendererConfig` envelope, `CompiledScene`. |
| `webgl/` | Thin wrappers over WebGL2: shader compilation, uniform caching, fullscreen quad, FBO. |
| `plugin/noise/` | The built-in noise plugin. `builder.ts` assembles a fragment shader from GLSL chunks per layer config; `index.ts` implements the `Plugin` interface (render, serialize, deserialize, compile). |
| `compositor/` | FBO-per-layer ping-pong blending with a two-pass overlay fallback and a final gamma correction pass. |
| `compiler/` | Walks the layer stack at design-time and asks each plugin to `compile` its layers into a `CompiledScene` the minimal production runtime can replay. |
| `config/` | JSON export/import using a per-plugin envelope format — the serializer doesn't know what a noise layer looks like, it delegates to `plugin.serialize` / `plugin.deserialize`. |
| `renderer/` | The `Renderer` class, default layer factory, and `resolveWorldTransforms` for the Unity-style parent/child scene graph. |

---

## Compiling and shipping scenes

rae-noise supports two ways to ship visuals to production:

### Path 1: Ship the full library + JSON config

Import the library, pass in a config exported from the editor. Shaders compile on first frame.

```ts
import { createRenderer } from "rae-noise";

const renderer = createRenderer(canvas);
renderer.importConfig(savedConfig);
```

This ships the full library bundle. Straightforward, no build step beyond your bundler.

### Path 2: Precompile for minimal runtime (planned)

Design a scene in the editor, compile it, and ship only the frozen result with a tiny runtime. The compile step bakes shader source and uniforms so the production bundle doesn't need plugins, builders, or validation.

```
 [Editor UI]
      |
      v
 renderer.compile()        -->  CompiledScene (baked shaders + frozen uniforms)
      |
      v
 emit(compiledScene)       -->  scene.js (self-contained module)
      |
      v
 rae-noise/runtime         -->  minimal replay loop (~5-10 KB gzipped)
```

The compiled output strips everything the runtime doesn't need: no shader builder, no GLSL chunks, no config serializer, no unused plugins. A typical 3-layer scene compiles to ~2 KB of JSON.

```ts
// Production site — only imports the minimal runtime
import { replay } from "rae-noise/runtime";
import scene from "./my-background.json";

const handle = replay(canvas, scene);
handle.set("speed", 2.0);  // exposed params still adjustable
handle.destroy();           // cleanup
```

The emitter (`compiler/emit.ts`) and minimal runtime (`rae-noise/runtime`) are not yet implemented — the `Plugin.compile()` hooks and `CompiledScene` format that they depend on are in place.

---

## Development

**Requirements:** Node 20+, pnpm 9

```bash
# Install dependencies
pnpm install

# Start both the core watcher and the dev server
pnpm dev
```

Vite resolves `rae-noise` directly from `packages/core/src` during development, so changes to the core are reflected instantly without waiting for a build step.

| Script | What it does |
|---|---|
| `pnpm dev` | Starts rollup watch + Vite dev server |
| `pnpm build` | Builds core then website |
| `pnpm build:core` | Builds only the core library |
| `pnpm build:website` | Builds only the website |

---

## Releases

Releases are managed with [Changesets](https://github.com/changesets/changesets). See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full release workflow.