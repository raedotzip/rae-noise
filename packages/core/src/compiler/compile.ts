import type { Backend, BackendType, CompiledScene, Layer } from "../types";

/**
 * Runtime format version written into {@link CompiledScene.v}. The
 * production-time runtime (`rae-noise/runtime`, built separately) reads
 * this to decide how to replay the scene. Bump when the replay contract
 * changes — e.g., a new mandatory field in {@link CompiledLayer}.
 */
export const RUNTIME_FORMAT_VERSION = 1;

/**
 * Compile an in-memory layer stack to a {@link CompiledScene} the
 * minimal production runtime can replay. Each backend contributes its
 * own compiled payload via {@link Backend.compile}; the compiler just
 * walks the list, assembles shared compositor state, and emits the
 * envelope. Backend-specific optimization (dead-code elimination,
 * constant inlining) lives inside each backend's `compile` hook.
 *
 * Unlike the full renderer, a compiled scene has no notion of the
 * backend registry, no shader builders, no defaults, and no
 * validation — everything is either baked into `fragSrc` or stored
 * as a constant in `data`.
 */
export function compile(layers: Layer[], backends: Map<BackendType, Backend>): CompiledScene {
  const compiledLayers = layers
    .filter((l) => l.visible !== false)
    .map((layer) => {
      const backend = backends.get(layer.backend);
      if (!backend) {
        throw new Error(
          `compile: no backend registered for layer "${layer.id}" of type "${layer.backend}"`
        );
      }
      // biome-ignore lint/suspicious/noExplicitAny: backend lookup is dynamic
      return (backend as Backend<any>).compile(layer);
    });

  return {
    v: RUNTIME_FORMAT_VERSION,
    layers: compiledLayers,
  };
}
