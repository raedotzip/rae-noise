import type { NoiseLayerConfig } from "../types";

/**
 * Returns a new noise layer configuration with sensible defaults.
 *
 * The returned object omits `id` — the renderer assigns one automatically
 * when the layer is added via {@link RaeNoiseRenderer.addLayer}.
 *
 * Default values:
 * | Property       | Default          |
 * |----------------|------------------|
 * | `backend`      | `"noise"`        |
 * | `noiseType`    | `"simplex"`      |
 * | `scale`        | `3.0`            |
 * | `octaves`      | `4`              |
 * | `speed`        | `0.3`            |
 * | `direction`    | `[1, 0]`         |
 * | `flowType`     | `"linear"`       |
 * | `contrast`     | `1.0`            |
 * | `brightness`   | `0.0`            |
 * | `palette`      | black -> white   |
 * | `opacity`      | `1.0`            |
 * | `blendMode`    | `"add"`          |
 * | `animate`      | `true`           |
 * | `warp`         | `0.0`            |
 * | `curlStrength` | `0.0`            |
 * | `visible`      | `true`           |
 *
 * @returns A default layer configuration without an `id`.
 *
 * @example
 * ```ts
 * import { createRenderer, defaultLayer } from "rae-noise";
 *
 * const renderer = createRenderer(canvas);
 * const id = renderer.addLayer({ ...defaultLayer(), noiseType: "worley", scale: 5 });
 * ```
 */
export function defaultLayer(): Omit<NoiseLayerConfig, "id"> {
  return {
    name: "layer",
    backend: "noise",
    noiseType: "simplex",
    scale: 3.0,
    octaves: 4,
    speed: 0.3,
    direction: [1.0, 0.0],
    flowType: "linear",
    contrast: 1.0,
    brightness: 0.0,
    palette: [
      [0, 0, 0],
      [1, 1, 1],
    ],
    opacity: 1.0,
    blendMode: "add",
    animate: true,
    warp: 0.0,
    curlStrength: 0.0,
    visible: true,
  };
}
