import type { AppIntent } from "./intent";
import { type AppState, layersFromConfig, newLayer } from "./model";

/**
 * Pure reducer — given the current state and an intent, returns the next state.
 *
 * No side-effects. No DOM. No renderer calls. Fully unit-testable.
 */
export function appReducer(state: AppState, intent: AppIntent): AppState {
  switch (intent.type) {
    case "LAYER_ADD": {
      const counter = state.layerCounter + 1;
      const layer = newLayer(counter, intent.payload);
      return {
        ...state,
        layerCounter: counter,
        layers: [...state.layers, layer],
        activeLayerId: layer.id,
      };
    }

    case "LAYER_REMOVE": {
      const { id } = intent.payload;
      const remaining = state.layers.filter((l) => l.id !== id);
      // Auto-select the nearest remaining layer after deletion
      let activeLayerId = state.activeLayerId;
      if (activeLayerId === id) {
        const removedIdx = state.layers.findIndex((l) => l.id === id);
        const next = remaining[removedIdx] ?? remaining[removedIdx - 1] ?? null;
        activeLayerId = next?.id ?? null;
      }
      return { ...state, layers: remaining, activeLayerId };
    }

    case "LAYER_UPDATE": {
      const { id, patch } = intent.payload;
      return {
        ...state,
        layers: state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      };
    }

    case "LAYER_REORDER": {
      const { ids } = intent.payload;
      const map = new Map(state.layers.map((l) => [l.id, l]));
      const reordered = ids.map((id) => map.get(id)).filter(Boolean) as typeof state.layers;
      return { ...state, layers: reordered };
    }

    case "LAYER_SELECT":
      return { ...state, activeLayerId: intent.payload.id };

    case "LAYERS_CLEAR":
      return { ...state, layers: [], activeLayerId: null };

    case "LAYERS_IMPORT": {
      const layers = layersFromConfig(intent.payload.config);
      // IDs here are temporary placeholders. The store will overwrite them
      // with the real IDs the renderer assigns after importConfig().
      return {
        ...state,
        layers,
        activeLayerId: null,
        layerCounter: state.layerCounter + layers.length,
      };
    }

    case "PLAYBACK_TOGGLE":
      return { ...state, paused: !state.paused };

    case "MODAL_OPEN":
      return { ...state, openModal: intent.payload.id };

    case "MODAL_CLOSE":
      return { ...state, openModal: null };

    default: {
      // Exhaustiveness check — TypeScript will error here if a case is missing.
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}
