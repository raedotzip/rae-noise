import type { NoiseLayerConfig, RendererConfig } from "rae-noise";

/**
 * Every user action in the editor is expressed as an Intent.
 *
 * Intents are plain data — they carry no logic. The reducer decides
 * how each intent mutates the model. New features start here: add an
 * intent type, handle it in the reducer, wire it up in the view.
 */
export type AppIntent =
  // ── Layer lifecycle ─────────────────────────────────────────────
  /** Add a new layer with optional config overrides. */
  | { type: "LAYER_ADD"; payload?: Partial<NoiseLayerConfig> }

  /** Remove a layer by ID. */
  | { type: "LAYER_REMOVE"; payload: { id: string } }

  /** Apply a partial config patch to an existing layer. */
  | { type: "LAYER_UPDATE"; payload: { id: string; patch: Partial<NoiseLayerConfig> } }

  /** Reorder layers. `ids` is the full ordered list (bottom → top). */
  | { type: "LAYER_REORDER"; payload: { ids: string[] } }

  /** Select a layer in the hierarchy (null = deselect). */
  | { type: "LAYER_SELECT"; payload: { id: string | null } }

  /** Remove all layers at once (used by randomise + import). */
  | { type: "LAYERS_CLEAR" }

  /**
   * Replace the entire layer stack from a RendererConfig.
   * The store will sync the renderer and then update IDs to match.
   */
  | { type: "LAYERS_IMPORT"; payload: { config: RendererConfig } }

  // ── Playback ────────────────────────────────────────────────────
  /** Toggle the animation pause state. */
  | { type: "PLAYBACK_TOGGLE" }

  // ── Modals ──────────────────────────────────────────────────────
  | { type: "MODAL_OPEN"; payload: { id: "config-export" | "config-import" | "node-graph" | "presets" } }
  | { type: "MODAL_CLOSE" };
