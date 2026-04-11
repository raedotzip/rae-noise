/**
 * @file Scene graph transform resolution for rae-noise.
 *
 * Implements a simple 2D scene graph where layers can be parented to other
 * layers. Each frame, {@link resolveWorldTransforms} walks the layer list
 * and composes local transforms with parent chains to produce world-space
 * transforms, Unity-style.
 *
 * ## Composition model
 *
 * The current implementation is intentionally simple:
 * - Position is **additive** in normalized canvas space (parent-scaled)
 * - Rotation **adds** (parent rotation + child rotation)
 * - Scale **multiplies** component-wise
 *
 * This is adequate for hierarchical layer positioning but is *not* a true
 * affine matrix compose — rotating a parent does not orbit its children
 * around the parent's position. Upgrade to matrix compose when a plugin
 * actually needs orbit behavior.
 *
 * ## Safety guarantees
 *
 * - Cycles are rejected at mutation time by {@link Renderer.setParent}, so
 *   this walker trusts the graph is a forest (DAG with shared roots).
 * - Orphaned parent references (parent id not found) are treated as parentless.
 * - Layers without a transform resolve to identity.
 * - The output map is guaranteed to have an entry for every layer in the input.
 *
 * @example
 * ```ts
 * const transforms = resolveWorldTransforms(renderer.getLayers());
 * const world = transforms.get(layerId);
 * console.log(world.position, world.rotation, world.scale);
 * ```
 *
 * @see {@link Transform2D} for the local (pre-composition) transform type.
 * @see {@link WorldTransform} for the resolved world-space output type.
 * @see {@link RaeNoiseRenderer.setParent} for building parent-child relationships.
 */

import type { Layer, Transform2D, WorldTransform } from "../types";

/** Identity world transform — zero position, zero rotation, unit scale, center anchor. */
const IDENTITY: WorldTransform = {
  position: [0, 0],
  rotation: 0,
  scale: [1, 1],
  anchor: [0.5, 0.5],
};

/**
 * Walk a layer list and resolve each layer's world-space transform by
 * composing its local {@link Transform2D} with its parent chain.
 *
 * Returns a map keyed by layer id. Every layer in the input is guaranteed
 * to have an entry in the output, even if it has no transform (identity is
 * used as the fallback).
 *
 * @param layers - The ordered layer stack (bottom to top).
 * @returns A map from layer id to resolved {@link WorldTransform}.
 *
 * @example
 * ```ts
 * const transforms = resolveWorldTransforms(layers);
 * for (const layer of layers) {
 *   const world = transforms.get(layer.id)!;
 *   plugin.render(layer, time, w, h, world);
 * }
 * ```
 */
export function resolveWorldTransforms(layers: Layer[]): Map<string, WorldTransform> {
  const byId = new Map<string, Layer>();
  for (const l of layers) byId.set(l.id, l);

  const memo = new Map<string, WorldTransform>();

  const resolve = (layer: Layer): WorldTransform => {
    const cached = memo.get(layer.id);
    if (cached) return cached;

    const local = layer.transform ?? identityTransform();
    const parentId = layer.parent ?? null;

    if (parentId == null) {
      const world: WorldTransform = {
        position: [local.position[0], local.position[1]],
        rotation: local.rotation,
        scale: [local.scale[0], local.scale[1]],
        anchor: local.anchor ?? [0.5, 0.5],
      };
      memo.set(layer.id, world);
      return world;
    }

    const parent = byId.get(parentId);
    if (!parent) {
      // Orphan — treat as parentless.
      const world: WorldTransform = {
        position: [local.position[0], local.position[1]],
        rotation: local.rotation,
        scale: [local.scale[0], local.scale[1]],
        anchor: local.anchor ?? [0.5, 0.5],
      };
      memo.set(layer.id, world);
      return world;
    }

    const parentWorld = resolve(parent);
    const world: WorldTransform = {
      position: [
        parentWorld.position[0] + local.position[0] * parentWorld.scale[0],
        parentWorld.position[1] + local.position[1] * parentWorld.scale[1],
      ],
      rotation: parentWorld.rotation + local.rotation,
      scale: [parentWorld.scale[0] * local.scale[0], parentWorld.scale[1] * local.scale[1]],
      anchor: local.anchor ?? parentWorld.anchor,
    };
    memo.set(layer.id, world);
    return world;
  };

  for (const layer of layers) resolve(layer);

  // Ensure every layer has at least identity so callers can rely on
  // `.get(id)` returning a value.
  for (const l of layers) {
    if (!memo.has(l.id)) memo.set(l.id, { ...IDENTITY });
  }
  return memo;
}

/**
 * Returns a fresh identity {@link Transform2D} — zero position, zero rotation,
 * unit scale, center anchor. Used as the default when a layer has no explicit
 * transform.
 *
 * @returns An identity transform: `{ position: [0,0], rotation: 0, scale: [1,1], anchor: [0.5,0.5] }`.
 */
export function identityTransform(): Transform2D {
  return {
    position: [0, 0],
    rotation: 0,
    scale: [1, 1],
    anchor: [0.5, 0.5],
  };
}
