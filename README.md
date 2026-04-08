# rae-noise

**Not ready for pull requests yet. working on setting up the repo myself first**

A WebGL-powered visual effects library for websites. `rae-noise` lets you drive real-time noise-based visuals — think animated gradients, layered perlin/simplex/worley fields, and palette-mapped color — through a simple renderer API.

This repo is a monorepo containing the core library and a live demo website.

→ **[Live demo](https://raedotzip.github.io/rae-noise)**

---

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

## Monorepo structure

```
rae-noise/
├── packages/
│   ├── core/          # rae-noise — the npm package
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── shader/
│   │   └── rollup.config.ts
│   └── website/       # demo site
│       ├── src/
│       └── vite.config.ts
├── .changeset/        # pending release notes
├── .github/
│   ├── workflows/
│   │   ├── continuous-integration.yml # runs on every PR
│   │   ├── deploy-website.yml         # deploys to GitHub Pages on push to main
│   │   └── npm-release.yml            # publishes to npm (disabled until 1.0)
│   └── dependabot.yml
└── pnpm-workspace.yaml
```

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