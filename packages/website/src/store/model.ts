import type { NoiseLayerConfig, PaletteStop, RendererConfig } from "rae-noise";
import { defaultLayer } from "rae-noise";

// Re-export so the rest of the store can import from one place.
export type { NoiseLayerConfig };

/** Which modal (if any) is currently open. */
export type ModalId = "config-export" | "config-import" | "node-graph" | "presets" | null;

/**
 * The complete UI + data state of the noise editor.
 *
 * This is the single source of truth for the application.
 * The WebGL renderer is treated as a side-effect sink — it is
 * always synchronised to match this state, never read as state.
 */
export interface AppState {
  /**
   * Ordered list of layers. The array order matches the visual stacking
   * order (index 0 = bottom-most layer, last index = top-most).
   */
  layers: NoiseLayerConfig[];

  /** ID of the layer currently selected in the hierarchy, or null. */
  activeLayerId: string | null;

  /** Whether the renderer's RAF loop is paused (speed set to 0). */
  paused: boolean;

  /** Which modal is currently visible. */
  openModal: ModalId;

  /**
   * Running counter used to generate default layer names.
   * Never resets to avoid name collisions after deletes.
   */
  layerCounter: number;
}

/** Sensible starting palette for a newly created layer. */
export function starterPalette(hue: number): PaletteStop[] {
  return [
    [0, 0, 0],
    [
      0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28)),
      0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 2)),
      0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 4)),
    ],
  ];
}

/** Build a fresh NoiseLayerConfig with a generated id and display name. */
export function newLayer(counter: number, overrides: Partial<NoiseLayerConfig> = {}): NoiseLayerConfig {
  const hue = Math.random();
  return {
    ...defaultLayer(),
    id: crypto.randomUUID(),
    name: `layer ${counter}`,
    palette: starterPalette(hue),
    ...overrides,
  };
}

/** Import an entire RendererConfig into layers, assigning fresh IDs. */
export function layersFromConfig(config: RendererConfig): NoiseLayerConfig[] {
  // The renderer assigns IDs during importConfig; here we build the state-side
  // representation. IDs are placeholders — the store will update them after
  // passing the config to the renderer and reading back its assigned IDs.
  return config.layers.map((entry: import("rae-noise").LayerEntry) => ({
    ...defaultLayer(),
    ...(entry.data as Partial<NoiseLayerConfig>),
    id: crypto.randomUUID(),
    name: entry.name ?? "layer",
    opacity: entry.opacity ?? 1,
    blendMode: entry.blendMode ?? "add",
    visible: entry.visible ?? true,
    plugin: "noise" as const,
  }));
}

export const initialState: AppState = {
  layers: [],
  activeLayerId: null,
  paused: false,
  openModal: null,
  layerCounter: 0,
};
