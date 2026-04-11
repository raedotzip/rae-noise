/**
 * @file Scene compiler for rae-noise.
 *
 * Converts an in-memory layer stack into a {@link CompiledScene} that the
 * minimal production runtime can replay. Each plugin contributes its own
 * compiled payload via {@link Plugin.compile}; this module just walks the
 * list, assembles shared compositor state, and emits the envelope.
 *
 * ## Design-time vs. production-time
 *
 * The full rae-noise library (renderer, plugins, builders, validators) is
 * used at design-time in the editor. The compiled scene strips all of that
 * away — it contains only baked shader source, frozen uniform tables, and
 * blend/opacity metadata. The production runtime reads this and replays it
 * with minimal code.
 *
 * ## Usage
 *
 * ```ts
 * import { createRenderer } from "rae-noise";
 *
 * const renderer = createRenderer(canvas);
 * renderer.addLayer({ noiseType: "fbm", scale: 4 });
 *
 * const scene = renderer.compile();
 * const json = JSON.stringify(scene);
 * // Ship `json` to production.
 * ```
 *
 * @see {@link CompiledScene} for the output format.
 * @see {@link CompiledLayer} for individual layer payloads.
 * @see {@link Plugin.compile} for plugin-level compilation.
 */

import type { CompiledScene, Layer, Plugin, PluginType } from "../types";

/**
 * Runtime format version written into {@link CompiledScene.v}.
 *
 * The production-time runtime (`rae-noise/runtime`, built separately) reads
 * this to decide how to replay the scene. Bump when the replay contract
 * changes — e.g., a new mandatory field in {@link CompiledLayer}.
 */
export const RUNTIME_FORMAT_VERSION = 1;

/**
 * Compile an in-memory layer stack to a {@link CompiledScene}.
 *
 * Walks all visible layers, delegates to each plugin's {@link Plugin.compile}
 * hook, and assembles the results into a versioned envelope. Plugin-specific
 * optimization (dead-code elimination, constant inlining) lives inside each
 * plugin's `compile` method.
 *
 * @param layers  - The ordered layer stack (bottom to top).
 * @param plugins - Registry of rendering plugins, keyed by plugin type.
 * @returns A compiled scene ready for the production runtime.
 * @throws If a visible layer references a plugin type that is not registered.
 *
 * @example
 * ```ts
 * // Usually called indirectly via renderer.compile():
 * const scene = renderer.compile();
 *
 * // Or directly if you have layers and plugins:
 * import { compile } from "rae-noise";
 * const scene = compile(layers, plugins);
 * ```
 */
export function compile(layers: Layer[], plugins: Map<PluginType, Plugin>): CompiledScene {
  const compiledLayers = layers
    .filter((l) => l.visible !== false)
    .map((layer) => {
      const plugin = plugins.get(layer.plugin);
      if (!plugin) {
        throw new Error(
          `compile: no plugin registered for layer "${layer.id}" of type "${layer.plugin}"`
        );
      }
      // biome-ignore lint/suspicious/noExplicitAny: plugin lookup is dynamic
      return (plugin as Plugin<any>).compile(layer);
    });

  return {
    v: RUNTIME_FORMAT_VERSION,
    layers: compiledLayers,
  };
}
