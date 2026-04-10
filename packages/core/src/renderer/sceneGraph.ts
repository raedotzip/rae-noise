import type { Layer, Transform2D, WorldTransform } from "../types";

const IDENTITY: WorldTransform = {
  position: [0, 0],
  rotation: 0,
  scale: [1, 1],
  anchor: [0.5, 0.5],
};

/**
 * Walks a layer list and resolves each layer's world-space transform by
 * composing its local {@link Transform2D} with its parent chain,
 * Unity-style. Returns a map keyed by layer id.
 *
 * Layers without a transform resolve to identity. Layers whose parent
 * id can't be found are treated as parentless. Cycles are rejected by
 * {@link Renderer.setParent} at mutation time, so this walker trusts
 * the graph is a forest.
 *
 * The current implementation is intentionally simple 2D composition —
 * position is additive in normalized canvas space, rotation adds,
 * scale multiplies component-wise. It's fine for positioning layers
 * hierarchically but it is *not* a true affine matrix compose, so
 * rotating a parent does not orbit its children around the parent's
 * position. That's a fine first cut because the current backends
 * (noise) ignore transforms entirely; upgrade to matrix compose when
 * a backend actually needs orbit behavior.
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
      scale: [
        parentWorld.scale[0] * local.scale[0],
        parentWorld.scale[1] * local.scale[1],
      ],
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

export function identityTransform(): Transform2D {
  return {
    position: [0, 0],
    rotation: 0,
    scale: [1, 1],
    anchor: [0.5, 0.5],
  };
}
