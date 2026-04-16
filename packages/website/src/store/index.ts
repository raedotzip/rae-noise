import type { RaeNoiseRenderer } from "rae-noise";
import type { AppIntent } from "./intent";
import { type AppState, initialState } from "./model";
import { appReducer } from "./reducer";

// ── Renderer reference ──────────────────────────────────────────────────────

let renderer: RaeNoiseRenderer | null = null;

export function registerRenderer(r: RaeNoiseRenderer): void {
  renderer = r;
}

// ── State ───────────────────────────────────────────────────────────────────

let state: AppState = { ...initialState };

export function getState(): AppState {
  return state;
}

// ── Subscribers ─────────────────────────────────────────────────────────────

type Listener = (state: AppState, intent: AppIntent) => void;
const listeners: Set<Listener> = new Set();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export function dispatch(intent: AppIntent): void {
  const prev = state;
  // Run pure reducer
  let next = appReducer(prev, intent);

  // Apply renderer side-effects; may return a corrected state (e.g. real IDs)
  if (renderer) {
    next = syncRenderer(prev, next, renderer, intent);
  }

  // Commit — subscribers and getState() see the same final state
  state = next;

  for (const fn of listeners) {
    fn(state, intent);
  }
}

// ── Renderer sync ────────────────────────────────────────────────────────────

/**
 * Synchronise the WebGL renderer to match next state.
 * Returns the (possibly corrected) state that should be committed.
 * This is the only place in the app that calls renderer methods.
 */
function syncRenderer(
  _prev: AppState,
  next: AppState,
  r: RaeNoiseRenderer,
  intent: AppIntent
): AppState {
  // ── LAYERS_IMPORT ─────────────────────────────────────────────────────────
  if (intent.type === "LAYERS_IMPORT") {
    for (const l of r.getLayers()) r.removeLayer(l.id);
    r.importConfig(intent.payload.config);
    // Mirror real renderer-assigned IDs back into state
    const rendererLayers = r.getLayers();
    return { ...next, layers: rendererLayers, activeLayerId: null };
  }

  // ── LAYERS_CLEAR ──────────────────────────────────────────────────────────
  if (intent.type === "LAYERS_CLEAR") {
    for (const l of r.getLayers()) r.removeLayer(l.id);
    return next;
  }

  // ── LAYER_ADD ─────────────────────────────────────────────────────────────
  if (intent.type === "LAYER_ADD") {
    const stateLayer = next.layers[next.layers.length - 1];
    const realId = r.addLayer({ ...stateLayer });
    if (realId === stateLayer.id) return next;
    // Patch temp UUID → real renderer ID throughout state
    return {
      ...next,
      activeLayerId: next.activeLayerId === stateLayer.id ? realId : next.activeLayerId,
      layers: next.layers.map((l) => (l.id === stateLayer.id ? { ...l, id: realId } : l)),
    };
  }

  // ── LAYER_REMOVE ──────────────────────────────────────────────────────────
  if (intent.type === "LAYER_REMOVE") {
    r.removeLayer(intent.payload.id);
    return next;
  }

  // ── LAYER_UPDATE ──────────────────────────────────────────────────────────
  if (intent.type === "LAYER_UPDATE") {
    r.updateLayer(intent.payload.id, intent.payload.patch);
    return next;
  }

  // ── LAYER_REORDER ─────────────────────────────────────────────────────────
  if (intent.type === "LAYER_REORDER") {
    r.reorderLayers(intent.payload.ids);
    return next;
  }

  // ── PLAYBACK_TOGGLE ───────────────────────────────────────────────────────
  if (intent.type === "PLAYBACK_TOGGLE") {
    if (next.paused) {
      for (const l of r.getLayers()) r.updateLayer(l.id, { speed: 0 });
    } else {
      for (const l of next.layers) r.updateLayer(l.id, { speed: l.speed, animate: l.animate });
    }
    return next;
  }

  // Modal / selection intents — no renderer side-effect
  return next;
}
