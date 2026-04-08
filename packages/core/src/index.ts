/**
 * **rae-noise** — WebGL2-powered procedural noise for real-time visual effects.
 *
 * This library provides a layer-based noise renderer that composites multiple
 * configurable noise patterns (simplex, perlin, worley, fbm, curl) onto an
 * HTML canvas in real time.
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
 * ## API surface
 *
 * | Export             | Kind     | Description                                    |
 * |--------------------|----------|------------------------------------------------|
 * | {@link createRenderer} | function | Creates a renderer bound to a canvas element   |
 * | {@link defaultLayer}   | function | Returns a layer config with sensible defaults  |
 * | {@link NoiseLayer}     | type     | Full configuration for a single noise layer    |
 * | {@link RaeNoiseRenderer} | type   | Public interface for the renderer              |
 * | {@link NoiseType}      | type     | Union of supported noise algorithms            |
 * | {@link BlendMode}      | type     | Union of supported blend modes                 |
 * | {@link FlowType}       | type     | Union of supported animation flow types        |
 * | {@link PaletteStop}    | type     | RGB color triplet `[r, g, b]` in `[0, 1]`     |
 *
 * @packageDocumentation
 */
export type { NoiseLayer, RaeNoiseRenderer, NoiseType, BlendMode, PaletteStop, FlowType } from './types';
export { createRenderer, defaultLayer } from './shader/renderer';