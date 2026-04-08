# Contributing

Thanks for your interest in contributing to rae-noise.

---

## Getting started

**Requirements:** Node 20+, pnpm 9

```bash
git clone https://github.com/raedotzip/rae-noise.git
cd rae-noise
pnpm install
pnpm dev
```

The dev server runs at `http://localhost:5173`. Changes to `packages/core/src` hot-reload immediately.

---

## Project structure

- `packages/core` — the `rae-noise` npm package. This is the thing that gets published.
- `packages/website` — the demo site. It is excluded from releases and never published to npm.

---

## Making changes

1. Create a branch off `main`
2. Make your changes
3. If your change affects the public API or behaviour of `rae-noise`, add a changeset (see below)
4. Open a PR — CI will build core and website to verify nothing is broken

---

## Changesets

This project uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs for `rae-noise`.

**You do not need to manually edit `package.json` versions or `CHANGELOG.md`.** Changesets handles all of that.

### When do I need a changeset?

| Change type | Needs changeset? |
|---|---|
| Bug fix in core | ✅ Yes — `patch` |
| New feature in core | ✅ Yes — `minor` |
| Breaking API change in core | ✅ Yes — `major` |
| Website-only change | ❌ No |
| Docs / tooling only | ❌ No |

### Adding a changeset

```bash
pnpm cs
```

This opens an interactive prompt. Select `rae-noise`, choose the bump type (`patch` / `minor` / `major`), and write a one-line summary of what changed. Commit the generated file in `.changeset/` along with your code changes.

---

## How releases work

> **Note:** The automated npm publish workflow is not yet active. This section describes the intended process for after the 1.0 launch.

Releases are triggered automatically when a PR created by the Changesets bot is merged into `main`. Here's the full flow:

### 1. Changesets accumulate on `main`

As PRs are merged, `.changeset/*.md` files accumulate in the repo. Each one describes a pending change.

### 2. Changesets bot opens a release PR

The release workflow runs on every push to `main`. When it detects pending changesets, it automatically opens a PR titled **"chore: release packages"**. This PR:
- Bumps the version in `packages/core/package.json`
- Updates `packages/core/CHANGELOG.md`
- Deletes the consumed `.changeset/*.md` files

### 3. Review and merge the release PR

When you're ready to publish, review the release PR and merge it. **Merging this PR is what triggers the npm publish.**

### 4. Package is published to npm

After the release PR is merged, the workflow builds the core package and runs `changeset publish`, which pushes the new version to npm and creates a GitHub release with the changelog.

### Activating the release workflow

The npm publish workflow is currently gated. To enable it:

1. Add an `NPM_TOKEN` secret in GitHub repo settings → Secrets
2. Set `NPM_PUBLISH_READY = true` in GitHub repo settings → Variables
3. Update `.github/workflows/npm-release.yml` — change the `on:` trigger from `workflow_dispatch` to `push: branches: [main]`

---

## CI

Every PR runs `.github/workflows/continuous-integration.yml`, which builds both the core library and the website. PRs that break the build will not be merged.