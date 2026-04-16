# Rae Noise

## Overview

Rae Noise (real name tba) is a project that aims to allow users to better make visuals and backgrounds for their webpages that take up minimal processing power so various graphcis can easily be run on most devices. Rae Noise is initially being designed for *precedually generated* background Web Visuals so you can generate cool noise values for projects but later on it shouldn't be too difficult to integrate various interactive components and all sorts of 2D/3D visuals to the project

Rae Noise's main seling point is the web editor where users can very easily edit things for the graphics

## Library Features

### Design Considerations
  - Speed / Low Computation Costs
  - Backwards Compatibility
  - Ease of Graphic Design / Not Technical
  - Easy to Integrate
  - Works Across Frameworks
  - Low Integration Cost / Small Executable
  - Organized and Easy to Use Documentation
  - Compatibility (this library will use WebGPU once it becomes a more wildly avaliable technology)

### Core Initial Features
  - Web Interface to design procedulelly generated graphics for webpage
    - Non-technical interface so that non-programmers can easily use
    - Website contains various guides and API references
    - Plenty of examples to learn from
    - Graphics editor to have a Unity-like interface
  - Various types of tools to edit
    - Diverse toolset to create visuals

---

## Website Architecture — MVI

The editor website (`packages/website`) uses a full **Model-View-Intent** (MVI) architecture. Every user action flows through a single pipeline:

```
User gesture → Intent → Reducer → State → Side-effects (renderer + UI)
```

### Why MVI

- **Predictable** — the UI is always a pure function of `AppState`. Bugs are reproducible by replaying intents.
- **Testable** — the reducer is a pure function with no DOM or WebGL dependency. Every state transition can be unit-tested by calling `appReducer(state, intent)`.
- **Scalable** — adding a feature means: add an intent type, handle it in the reducer, wire a button to `dispatch()`. No other files need to change.

### Files

| File | Role |
|---|---|
| `src/store/model.ts` | `AppState` interface + `initialState` + helpers (`newLayer`, `layersFromConfig`) |
| `src/store/intent.ts` | `AppIntent` discriminated union — every possible user action |
| `src/store/reducer.ts` | Pure reducer: `(AppState, AppIntent) → AppState`. No side-effects. |
| `src/store/index.ts` | Holds state, runs the reducer, syncs the WebGL renderer, notifies subscribers |
| `src/demo/index.ts` | Wires DOM events to `dispatch()`, subscribes to state to update the hierarchy / inspector |
| `src/demo/layerCard.ts` | Hierarchy rows and inspector panel — reads a layer snapshot, dispatches on change |
| `src/demo/nodeGraph.ts` | Canvas node graph — reads `getState().layers`, no renderer dependency |

### Data flow

```
┌─────────────────────────────────────────────────────────┐
│  DOM event (button click, slider drag, drag-and-drop)   │
└──────────────────────────┬──────────────────────────────┘
                           │  dispatch(intent)
                           ▼
                    ┌─────────────┐
                    │   reducer   │  pure: (state, intent) → state
                    └──────┬──────┘
                           │  next AppState
                           ▼
                    ┌─────────────┐
                    │    store    │  applies side-effects:
                    └──────┬──────┘  1. syncRenderer() — adds/removes/updates GPU layers
                           │         2. notifies subscribers
                           ▼
              ┌────────────────────────┐
              │  subscribers (UI)      │  update hierarchy, inspector, node graph
              └────────────────────────┘
```

### The renderer as a side-effect sink

The WebGL renderer (`rae-noise`) is **not** the source of truth. `AppState` owns all layer data. The renderer is synchronised to match state inside `syncRenderer()` in `store/index.ts` — the only place in the codebase that calls renderer methods.

This means:
- Layer config lives in `AppState.layers` (array of `NoiseLayerConfig`)
- The renderer always mirrors state — never leads it
- After `importConfig`, the renderer's assigned IDs are read back and patched into state so they stay in sync

### AppState shape

```ts
interface AppState {
  layers: NoiseLayerConfig[];  // full layer configs, bottom → top
  activeLayerId: string | null;
  paused: boolean;
  openModal: "config-export" | "config-import" | "node-graph" | "presets" | null;
  layerCounter: number;        // monotonically increasing, used for default names
}
```

### Adding a new feature

1. Add an intent to `AppIntent` in `intent.ts`
2. Handle it in the `switch` in `reducer.ts` (TypeScript will error if you forget)
3. If it needs a renderer side-effect, add a branch in `syncRenderer()` in `store/index.ts`
4. Wire a DOM event to `dispatch({ type: "YOUR_INTENT", ... })` in `demo/index.ts`

### Testing the reducer

Because the reducer is pure, tests need no DOM or WebGL setup:

```ts
import { appReducer } from "./src/store/reducer";
import { initialState } from "./src/store/model";

const next = appReducer(initialState, { type: "LAYER_ADD" });
assert(next.layers.length === 1);
assert(next.activeLayerId === next.layers[0].id);
```