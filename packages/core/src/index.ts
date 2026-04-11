/**
 * **rae-noise** — WebGL2-powered procedural visuals for real-time effects.
 *
 * This library provides a modular, plugin-driven renderer that composites
 * multiple configurable visual layers onto an HTML canvas in real time.
 * The built-in `noise` plugin supports simplex, perlin, worley, fbm, and
 * curl noise. Custom plugins can be registered to add new visual types
 * (particles, lines, images, etc.) without modifying the core.
 *
 * ## Quick start
 *
 * ```ts
 * import { createRenderer, defaultLayer } from "rae-noise";
 *
 * const renderer = createRenderer(document.querySelector("canvas")!);
 * renderer.addLayer({ noiseType: "fbm", scale: 4, speed: 0.2 });
 * ```
 *
 * ## Initialize from JSON config
 *
 * ```ts
 * const renderer = createRenderer(canvas);
 * renderer.importConfig({
 *   version: 1,
 *   layers: [{ plugin: "noise", noiseType: "fbm", scale: 4, speed: 0.2 }],
 * });
 * ```
 *
 * ## Register a custom plugin
 *
 * ```ts
 * import type { Plugin, LayerBase } from "rae-noise";
 *
 * class ParticlePlugin implements Plugin<ParticleLayerConfig> {
 *   readonly type = "particles";
 *   readonly schemaVersion = 1;
 *   // ... implement init, render, needsRecompile, recompile, etc.
 * }
 *
 * const renderer = createRenderer(canvas);
 * renderer.registerPlugin(new ParticlePlugin());
 * renderer.addLayer({ plugin: "particles", count: 1000 });
 * ```
 *
 * ## API surface
 *
 * | Export                 | Kind     | Description                                      |
 * |------------------------|----------|--------------------------------------------------|
 * | {@link createRenderer}     | function | Creates a renderer bound to a canvas element |
 * | {@link defaultLayer}       | function | Returns a layer config with sensible defaults |
 * | {@link compile}            | function | Compiles a layer stack for production runtime |
 * | {@link NoiseLayerConfig}   | type     | Configuration for a noise layer               |
 * | {@link NoiseLayer}         | type     | Legacy alias for NoiseLayerConfig             |
 * | {@link RaeNoiseRenderer}   | type     | Public interface for the renderer             |
 * | {@link Layer}              | type     | Discriminated union of all layer types        |
 * | {@link LayerBase}          | type     | Base properties shared by every layer         |
 * | {@link Plugin}             | type     | Interface for custom rendering plugins        |
 * | {@link RendererConfig}     | type     | Serializable config for JSON export/import    |
 * | {@link NoiseType}          | type     | Union of supported noise algorithms           |
 * | {@link BlendMode}          | type     | Union of supported blend modes                |
 * | {@link FlowType}           | type     | Union of supported animation flow types       |
 * | {@link PaletteStop}        | type     | RGB color triplet `[r, g, b]` in `[0, 1]`    |
 * | {@link PluginType}         | type     | Plugin identifier string                      |
 *
 * @packageDocumentation
 */

// Types
export type {
  NoiseLayer,
  NoiseLayerConfig,
  RaeNoiseRenderer,
  NoiseType,
  BlendMode,
  PaletteStop,
  FlowType,
  Layer,
  LayerBase,
  Plugin,
  PluginType,
  RendererConfig,
  LayerEntry,
  Transform2D,
  WorldTransform,
  CompiledLayer,
  CompiledScene,
  ExposedParam,
} from "./types";

// Functions
export { createRenderer } from "./renderer/renderer";
export { defaultLayer } from "./renderer/defaults";
export { compile } from "./compiler/compile";
export { resolveWorldTransforms, identityTransform } from "./renderer/sceneGraph";
