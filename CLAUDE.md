# rae-noise

WebGL-powered procedural visuals library for real-time effects on websites. Pre-release (not yet published to npm).

**Author**: Raegan Scheet
**Live demo**: https://raedotzip.github.io/rae-noise

## Monorepo structure

pnpm workspace with two packages:

- `packages/core/` — The published npm library (`rae-noise`). Rollup builds to ESM + CJS.
- `packages/website/` — Interactive demo site (`@rae-noise/website`, private). Vite + Handlebars, deployed to GitHub Pages.

## Core library architecture

Modular, plugin-driven renderer. Each visual type (noise, particles, lines, etc.) is a self-contained plugin. The renderer orchestrates plugins and composites their output via FBO ping-pong blending.

### Public API

```
createRenderer(canvas) → RaeNoiseRenderer
defaultLayer()         → Omit<NoiseLayerConfig, 'id'>
```

`RaeNoiseRenderer` methods: `addLayer`, `removeLayer`, `updateLayer`, `getLayers`, `reorderLayers`, `destroy`, `exportConfig`, `importConfig`, `registerPlugin`.

### Directory layout

```
packages/core/src/
  index.ts                          # Public API re-exports
  types/
    index.d.ts                      # All type definitions
    glsl.d.ts                       # GLSL module declarations
  webgl/
    program.ts                      # compileShader, linkProgram, UniformCache
    quad.ts                         # Fullscreen quad VAO + vertex shader
    fbo.ts                          # Framebuffer object wrapper
  plugin/
    noise/
      index.ts                      # NoisePlugin (implements Plugin interface)
      builder.ts                    # buildNoiseShader() — single-layer GLSL generation
      chunks/                       # GLSL shader fragments
        noise/simplex.glsl, perlin.glsl, worley.glsl, fbm.glsl, curl.glsl
        blend.glsl, warp.glsl
  compositor/
    compositor.ts                   # FBO-based layer compositing + gamma pass
    composite.glsl                  # Overlay blend helper for compositor
  renderer/
    renderer.ts                     # Renderer orchestrator class + createRenderer()
    defaults.ts                     # defaultLayer()
  config/
    serializer.ts                   # JSON exportConfig / importConfig with validation
```

### How rendering works

1. `createRenderer()` initializes WebGL2, registers the built-in noise plugin, creates the compositor, and starts a `requestAnimationFrame` loop
2. Each visible layer is rendered to its own FBO by its plugin (e.g., NoisePlugin draws a fullscreen quad with a per-layer noise shader)
3. The compositor blends all layer FBOs together using GL blend state (add/multiply/screen) or a two-pass overlay shader, then applies a gamma correction pass to the canvas
4. When a layer's structural config changes (noiseType, flowType, octaves, animate, warp, curlStrength), the plugin recompiles only that layer's shader. Non-structural changes (speed, scale, palette, opacity, etc.) are uploaded as uniforms per-frame with no recompilation

### Plugin system

Plugins implement the `Plugin<L>` interface: `init`, `render`, `needsRecompile`, `recompile`, `removeLayer`, `destroy`. The noise plugin is built-in. Custom plugins are registered via `renderer.registerPlugin(myPlugin)`. Each plugin owns its own shaders, geometry, and per-frame rendering logic. Adding a new visual type = one new plugin file, zero changes to existing code.

### Type system

- `LayerBase` — shared fields: id, name, plugin, opacity, blendMode, visible
- `NoiseLayerConfig extends LayerBase` — noise-specific: noiseType, scale, octaves, speed, direction, flowType, contrast, brightness, palette, animate, warp, curlStrength
- `Layer` — discriminated union of all layer configs (currently just NoiseLayerConfig)
- `NoiseLayer` — deprecated alias for NoiseLayerConfig (backwards compat)
- `Plugin<L>` — interface for rendering plugins
- `RendererConfig` — serializable JSON format: `{ version, layers }` for export/import

### JSON config export/import

```ts
const config = renderer.exportConfig(); // { version: 1, layers: [...] }
const json = JSON.stringify(config);
// Later, or in another project:
renderer.importConfig(JSON.parse(json));
```

### NoiseLayerConfig properties

Each noise layer has: `noiseType` (simplex/perlin/worley/fbm/curl), `scale`, `octaves` (1-8), `speed`, `direction` [x,y], `flowType` (linear/radial/spiral/vortex/turbulent), `contrast`, `brightness`, `palette` (up to 8 RGB stops), `opacity`, `blendMode` (add/multiply/screen/overlay), `animate`, `warp`, `curlStrength`, `visible`.

## Website architecture

Vanilla TypeScript + jQuery + Handlebars templates (no framework). Key files:

- `packages/website/src/main.ts` — Entry point, inits demo + router
- `packages/website/src/router.ts` — Client-side SPA routing (/ -> demo, /docs -> docs)
- `packages/website/src/demo/index.ts` — Creates renderer, layer UI, wires controls
- `packages/website/src/demo/layerCard.ts` — Layer card UI builder with all interactive controls
- `packages/website/src/demo/widgets.ts` — Widget factories (slider, chip group, toggle, dial, palette editor)
- `packages/website/src/demo/nodeGraph.ts` — Canvas-based node graph visualization (modal)
- `packages/website/src/demo/color.ts` — hexToRgb/rgbToHex/swatchGradient helpers
- `packages/website/src/demo/tooltip.ts` — Tooltip system
- `packages/website/src/views/` — Handlebars templates + partials (14 .hbs files)
- `packages/website/src/styles/` — CSS organized into base/, components/, features/, layout/

## Commands

```bash
pnpm dev              # Rollup watch (core) + Vite dev server (website) concurrently
pnpm build            # Build core then website
pnpm build:core       # Rollup build -> packages/core/dist/{esm,cjs}
pnpm build:website    # Vite build -> packages/website/dist/
pnpm lint             # Biome lint
pnpm format           # Biome format (writes changes)
pnpm check            # Biome check (lint + format, writes changes)
pnpm typecheck        # TypeScript --noEmit across all packages
pnpm build:docs       # Generate TypeDoc API docs
pnpm changeset        # Create a changeset for version bumping
pnpm test             # Run vitest tests
```

## Code style

- **Formatter/Linter**: Biome — 2-space indent, double quotes, ES5 trailing commas, always semicolons, 100-char line width
- **TypeScript**: Strict mode, ES2020 target, ESNext modules, Bundler module resolution
- Biome scope: `packages/*/src/**` + config files. GLSL files are excluded from biome.
- Tests: vitest with happy-dom, setup file mocks WebGL2/RAF/ResizeObserver

## Build tooling

- **pnpm 9** — Monorepo package manager
- **Rollup 4** — Core library bundler (ESM + CJS outputs, GLSL inlined via rollup-plugin-glsl)
- **Vite 6** — Website dev server + bundler (aliases `rae-noise` to local core source for hot-reload, `base: "/rae-noise/"` for GitHub Pages)
- **TypeDoc** — API documentation generation
- **Changesets** — Semantic versioning and release management

## CI/CD (GitHub Actions)

- **continuous-integration.yml** — Runs on PRs: lint, typecheck, build core, generate docs, build website
- **deploy-website.yml** — Runs on push to main: builds and deploys website to GitHub Pages
- **sync-wiki.yml** — Runs on push to main: generates API docs wiki pages from TypeDoc JSON
- **npm-release.yml** — Manual dispatch: Changesets-based npm publish (gated by `NPM_PUBLISH_READY` variable, not yet enabled)

## Current project state

- npm package not yet published — awaiting 1.0 release
- Plugin architecture implemented: modular system supports custom visual plugins
- Tests written: vitest unit tests for renderer, builder, defaults, serializer (48 tests)
- Active development: demo live on GitHub Pages
- README notes project is not ready for external pull requests
