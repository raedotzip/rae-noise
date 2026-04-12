# CI/CD & Monorepo System Documentation

## Overview

This repository uses a modern monorepo architecture powered by:

* pnpm (dependency management)
* Turborepo (task orchestration & caching)
* GitHub Actions (CI/CD)
* Vitest (testing + coverage)
* Playwright (E2E testing)
* CodeQL (security scanning)

---

## Workflows

### 1. CI (`ci.yml`)

**Purpose:**
Primary pipeline for validating all changes.

**Jobs:**

* Lint → code quality
* Typecheck → TypeScript correctness
* Build → Turbo-based incremental builds
* Test → unit tests + coverage
* E2E → browser tests (website only)
* Security → dependency audit

**Key Features:**

* Runs jobs in parallel
* Uses Turbo caching
* Only runs affected packages
* Uploads coverage reports

---

### 2. CodeQL (`codeql.yml`)

**Purpose:**
Static security analysis.

**Runs:**

* On push
* On PR
* Weekly schedule

**Why needed:**

* Detects vulnerabilities in JS/TS code
* Complements dependency audit

---

### 3. Deploy (`deploy.yml`)

**Purpose:**
Deploy website to GitHub Pages.

**Trigger:**

* Push to main

**Behavior:**

* Builds entire monorepo
* Deploys `packages/website/dist`

---

### 4. Preview (`preview.yml`)

**Purpose:**
Provide preview deployments for pull requests.

**Behavior:**

* Builds website only
* Deploys preview via GitHub Pages

---

### 5. Release (`release.yml`)

**Purpose:**
Manage package versioning and publishing.

**Tool:**

* Changesets

**Behavior:**

* Creates release PRs
* Publishes when enabled

---

### 6. Docs Sync (`docs.yml`)

**Purpose:**
Sync API documentation to GitHub Wiki.

**Behavior:**

* Generates docs using TypeDoc
* Pushes to `.wiki` repo

---

## Turborepo

**Role:**

* Determines which packages need rebuilding
* Caches results locally and remotely
* Executes tasks in dependency order

**Key Commands:**

* `pnpm build` → full build
* `pnpm build:affected` → only changed packages
* `pnpm test:affected` → only changed tests

---

## Testing Strategy

### Unit Tests

* Framework: Vitest
* Location: `test/**/*.test.ts`

### E2E Tests

* Framework: Playwright
* Only run when website changes

### Coverage

* Generated using V8 provider
* Uploaded as CI artifacts
* Commented on PRs

---

## Performance Optimizations

* Turbo caching (local + remote)
* Parallel CI jobs
* Affected-only execution
* Conditional E2E tests

---

## Design Principles

* Core library is isolated and optimized
* Website is a consumer/demo only
* No cross-dependency from core → website
* CI is fast, deterministic, and scalable

---

## Future Improvements

* Coverage thresholds enforcement
* Automated release pipeline
* Dependency graph visualization UI
