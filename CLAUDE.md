# rae-noise

WebGL-powered procedural noise library for real-time visual effects on websites. Pre-release (not yet published to npm).

**Author**: Raegan Scheet
**Live demo**: https://raedotzip.github.io/rae-noise

## Monorepo structure

pnpm workspace with two packages:

- `packages/core/` — The published npm library (`rae-noise`). Rollup builds to ESM + CJS.
- `packages/website/` — Interactive demo site (`@rae-noise/website`, private). Vite + Handlebars, deployed to GitHub Pages.

## Core library architecture

The public API surface is small — two functions and six types:

```
createRenderer(canvas) → RaeNoiseRenderer
defaultLayer()         → NoiseLayer
```

### Key files

- `packages/core/src/index.ts` — Entry point, re-exports types + functions
- `packages/core/src/types/index.d.ts` — All type definitions (NoiseLayer, RaeNoiseRenderer, NoiseType, BlendMode, FlowType, PaletteStop)
- `packages/core/src/shader/renderer.ts` — `NoiseRenderer` class: manages WebGL2 context, compiles shaders, runs animation loop, uploads uniforms per frame
- `packages/core/src/shader/builder.ts` — `buildFragShader(layers)`: dynamically generates GLSL fragment shader from active layer configs. Only includes noise chunks that are actually needed.
- `packages/core/src/shader/chunks/` — GLSL shader fragments:
  - `noise/simplex.glsl`, `noise/perlin.glsl`, `noise/worley.glsl`, `noise/fbm.glsl`, `noise/curl.glsl`
  - `blend.glsl` (overlay blend), `warp.glsl` (domain warping), `utils.glsl`

### How rendering works

1. `createRenderer()` initializes WebGL2, compiles vertex shader (static fullscreen quad), and starts `requestAnimationFrame` loop
2. Each frame: uploads per-layer uniforms (time, scale, speed, direction, palette, etc.), then draws
3. When layers are added/removed/reordered, a `dirty` flag triggers shader recompilation via `buildFragShader()`
4. The fragment shader is generated dynamically — it conditionally includes only the GLSL chunks needed by the active layers' noise types, blend modes, and flow types

### NoiseLayer properties

Each layer has: `noiseType` (simplex/perlin/worley/fbm/curl), `scale`, `octaves` (1-8), `speed`, `direction` [x,y], `flowType` (linear/radial/spiral/vortex/turbulent), `contrast`, `brightness`, `palette` (up to 8 RGB stops), `opacity`, `blendMode` (add/multiply/screen/overlay), `animate`, `warp`, `curlStrength`.

## Website architecture

Vanilla TypeScript + Handlebars templates (no framework). Key files:

- `packages/website/src/main.ts` — Entry point, inits demo + router
- `packages/website/src/router.ts` — Client-side SPA routing (/ → demo, /docs → docs)
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
pnpm build:core       # Rollup build → packages/core/dist/{esm,cjs}
pnpm build:website    # Vite build → packages/website/dist/
pnpm lint             # Biome lint
pnpm format           # Biome format (writes changes)
pnpm check            # Biome check (lint + format, writes changes)
pnpm typecheck        # TypeScript --noEmit across all packages
pnpm build:docs       # Generate TypeDoc API docs
pnpm changeset        # Create a changeset for version bumping
```

## Code style

- **Formatter/Linter**: Biome — 2-space indent, double quotes, ES5 trailing commas, always semicolons, 100-char line width
- **TypeScript**: Strict mode, ES2020 target, ESNext modules, Bundler module resolution
- Biome scope: `packages/*/src/**` + config files. GLSL files are excluded from biome.
- No test framework wired up yet (vitest + playwright deps exist but no tests written)

## Build tooling

- **pnpm 9** — Monorepo package manager
- **Rollup 4** — Core library bundler (ESM + CJS outputs, GLSL inlined via rollup-plugin-glsl)
- **Vite 6** — Website dev server + bundler (aliases `rae-noise` to local core source for hot-reload)
- **TypeDoc** — API documentation generation
- **Changesets** — Semantic versioning and release management

## CI/CD (GitHub Actions)

- **continuous-integration.yml** — Runs on PRs: lint, typecheck, build core, generate docs, build website
- **deploy-website.yml** — Runs on push to main: builds and deploys website to GitHub Pages
- **npm-release.yml** — Manual dispatch: Changesets-based npm publish (gated by `NPM_PUBLISH_READY` variable, not yet enabled)

## Current project state

- npm package not yet published — awaiting 1.0 release
- No tests written yet (vitest/playwright configured but unused)
- Active development: recent refactoring moved demo code into monorepo structure, adopted Handlebars templates
- README notes project is not ready for external pull requests
