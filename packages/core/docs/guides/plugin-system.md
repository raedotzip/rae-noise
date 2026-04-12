# Adding a new plugin

rae-noise is built around **plugins** — self-contained modules that own a
single visual type (noise, particles, lines, sprites, field effects, …).
Each plugin owns its own shaders, per-layer GPU state, config schema,
and compiled output. Adding a new visual type is one new file with
**zero changes** to shared renderer, serializer, or config code.

This doc walks through what a plugin has to provide, how the pieces
wire together, and how the scene graph / parent system works.

---

## 1. Mental model

A **layer** is one instance of a plugin in the scene. A noise layer, a
particle layer, a sprite layer — they're all layers, they all composite
onto each other, they all have shared fields (`opacity`, `blendMode`,
`parent`, `transform`, `visible`) and plugin-specific fields (the noise
layer has `noiseType` and `palette`, a particle layer would have
`count` and `velocity`, etc.).

A **plugin** is the code that knows how to render one kind of layer.
The renderer holds a map of `plugin type string → Plugin instance` and
dispatches to the right one when walking the layer list each frame.

The same plugin is also responsible for:
- **Serializing** its layer config to a JSON-safe blob for export
- **Deserializing** that blob back into an in-memory layer (with
  migration from older schema versions)
- **Compiling** a layer to a `CompiledLayer` the minimal production
  runtime can replay without the plugin code present

This keeps schema ownership local. The top-level serializer doesn't
know what a noise layer looks like — it just calls `plugin.serialize(layer)`.

---

## 2. The `Plugin<L>` interface

Defined in [`src/types/index.d.ts`](../src/types/index.d.ts). You
implement it for your layer config type `L`:

```ts
interface Plugin<L extends LayerBase> {
  readonly type: PluginType;           // e.g. "particles"
  readonly schemaVersion: number;      // bump when L changes shape

  // Lifecycle
  init(gl: WebGL2RenderingContext): void;
  destroy(): void;

  // Per-layer
  render(
    layer: L,
    time: number,
    width: number,
    height: number,
    worldTransform: WorldTransform
  ): void;
  needsRecompile(prev: L, next: L): boolean;
  recompile(layerId: string, layer: L): void;
  removeLayer(layerId: string): void;

  // Schema ownership
  serialize(layer: L): unknown;
  deserialize(data: unknown, version: number): Omit<L, keyof LayerBase>;

  // Compilation (design-time → production-time)
  compile(layer: L): CompiledLayer;
}
```

### What each method is for

| Method | When it runs | What it should do |
| --- | --- | --- |
| `init` | Once, when the plugin is registered. | Create shared GPU resources: shaders, buffers, samplers. |
| `render` | Every frame, for every visible layer. The compositor has already bound the layer's FBO and set the viewport. | Draw the layer's visuals into the bound FBO. |
| `needsRecompile` | Whenever a layer is patched via `renderer.updateLayer`. | Return `true` only if the change requires a GPU shader rebuild. Uniform-only tweaks should return `false`. |
| `recompile` | Right before the next frame, if `needsRecompile` returned `true`. | Throw away the old per-layer shader and build a new one. |
| `removeLayer` | When a layer is removed. | Free any per-layer GPU resources. |
| `destroy` | When the renderer is destroyed. | Free all GPU resources the plugin owns. |
| `serialize` | During `renderer.exportConfig()`. | Return a plain JSON-safe object containing only plugin-specific fields — the envelope carries the shared ones. |
| `deserialize` | During `renderer.importConfig()`. | Rebuild the plugin-specific fields from a data blob, using `version` to migrate older schemas. |
| `compile` | During `renderer.compile()`, at design-time. | Return a `CompiledLayer` with baked shader source + frozen uniform values. Should **not** allocate GPU resources. |

### Minimum viable plugin skeleton

```ts
// src/plugin/particles/index.ts
import type {
  Plugin,
  CompiledLayer,
  LayerBase,
  WorldTransform,
} from "../../types";

export const PARTICLES_SCHEMA_VERSION = 1;

export interface ParticleLayerConfig extends LayerBase {
  plugin: "particles";
  count: number;
  velocity: [number, number];
  color: [number, number, number];
}

export class ParticlePlugin implements Plugin<ParticleLayerConfig> {
  readonly type = "particles" as const;
  readonly schemaVersion = PARTICLES_SCHEMA_VERSION;
  private gl!: WebGL2RenderingContext;

  init(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // ...create shaders, instanced quad VBO, etc.
  }

  render(
    layer: ParticleLayerConfig,
    time: number,
    width: number,
    height: number,
    worldTransform: WorldTransform
  ) {
    // ...draw `layer.count` instanced quads, positioned by
    // `worldTransform.position` (normalized, 0..1). Multiply by
    // (width, height) to get pixel coordinates.
  }

  needsRecompile(prev: ParticleLayerConfig, next: ParticleLayerConfig): boolean {
    // Only count changes force a VBO resize; everything else is uniforms.
    return prev.count !== next.count;
  }

  recompile(_id: string, _layer: ParticleLayerConfig) {
    // Reallocate instance buffer at new size.
  }

  removeLayer(_id: string) {
    // Drop per-layer VBO / bind group.
  }

  destroy() {
    // Delete shared programs / buffers.
  }

  serialize(layer: ParticleLayerConfig): unknown {
    return {
      count: layer.count,
      velocity: [layer.velocity[0], layer.velocity[1]],
      color: [layer.color[0], layer.color[1], layer.color[2]],
    };
  }

  deserialize(data: unknown, _version: number) {
    const d = data as Record<string, unknown>;
    return {
      count: Number(d.count ?? 100),
      velocity: (d.velocity ?? [0, 0]) as [number, number],
      color: (d.color ?? [1, 1, 1]) as [number, number, number],
    };
  }

  compile(layer: ParticleLayerConfig): CompiledLayer {
    return {
      plugin: "particles",
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      data: {
        // Whatever the production runtime needs to replay this layer —
        // finalized shader source, uniform values, vertex layout, etc.
      },
    };
  }
}
```

### Registering the plugin

Users opt in with `registerPlugin`:

```ts
import { createRenderer } from "rae-noise";
import { ParticlePlugin } from "./my-particle-plugin";

const renderer = createRenderer(canvas);
renderer.registerPlugin(new ParticlePlugin());
renderer.addLayer({ plugin: "particles", count: 500 });
```

For built-in plugins that ship with rae-noise, register them in
[`src/renderer/renderer.ts`](../src/renderer/renderer.ts) alongside
`NoisePlugin` in the constructor.

---

## 3. Scene graph, transforms, and parent-child

rae-noise has a Unity-style scene graph: every layer has an optional
`parent` (another layer's id) and a local `Transform2D`:

```ts
interface Transform2D {
  position: [number, number]; // normalized canvas coords, 0..1
  rotation: number;           // radians
  scale: [number, number];
  anchor?: [number, number];  // rotation/scale pivot, default [0.5, 0.5]
}
```

Each frame, the renderer walks the scene graph once via
[`resolveWorldTransforms`](../src/renderer/sceneGraph.ts) and passes
each layer's resolved `WorldTransform` to `plugin.render`. Moving a
parent moves all of its descendants automatically.

### What your plugin should do with the transform

- **Full-canvas plugins** (noise, postprocess-like effects) can
  **ignore** the `worldTransform` argument. They draw a fullscreen
  quad into their FBO regardless. This is what `NoisePlugin` does today.
- **Placement-aware plugins** (sprites, particles, lines, 3D objects)
  should use `worldTransform.position` as the layer's origin,
  `worldTransform.rotation` as its orientation, and `worldTransform.scale`
  as its size multiplier. Bake these into your vertex shader's
  model-view transform or multiply them into instance data.

### Current transform compose limits

The current scene-graph resolver composes position, rotation, and scale
as independent values:

```
child.worldPos   = parent.worldPos + child.localPos * parent.worldScale
child.worldRot   = parent.worldRot + child.localRot
child.worldScale = parent.worldScale * child.localScale
```

This is **not** a full 2D affine matrix compose, so rotating a parent
does **not** orbit its children around the parent's position — they
rotate in place. That's a deliberate first cut because no built-in
plugin currently needs orbit behavior; when one does, upgrade
`resolveWorldTransforms` to matrix compose and nothing else has to change.

### Cycle prevention

`Renderer.setParent(id, parentId)` walks up the proposed parent chain
and throws if it would create a cycle. Plugins don't need to worry
about cycles — the resolver trusts the graph is a forest.

---

## 4. Schema ownership and versioning

There are **two versions** in the system, and they're intentionally
independent:

1. **Envelope version** (`RendererConfig.version`) — the shape of the
   top-level JSON format. Very stable. Changes only when the envelope
   itself gains a new mandatory field or restructures layers/scene/timeline/assets.
2. **Plugin schema version** (`Plugin.schemaVersion`, stored as
   `LayerEntry.bv`) — the shape of one plugin's layer config. Each
   plugin bumps its own version as it evolves.

This means the noise plugin can go through six schema versions without
ever touching envelope code, and vice versa.

### Writing a migration

When you change `NoiseLayerConfig` — say, renaming `scale` to `frequency` —
bump `NOISE_SCHEMA_VERSION` and add a migration branch in `deserialize`:

```ts
deserialize(data: unknown, version: number) {
  const d = data as Record<string, unknown>;

  if (version < 2) {
    // v1 → v2: `scale` was renamed to `frequency`.
    if ("scale" in d && !("frequency" in d)) {
      d.frequency = d.scale;
      delete d.scale;
    }
  }

  return { /* ...reconstruct from d... */ };
}
```

The renderer reads the stored `bv` for each entry and passes it to
`deserialize`, so old exported configs keep loading as your plugin evolves.

### What goes in `serialize` vs the envelope

The envelope already stores the shared `LayerBase` fields:
`name`, `opacity`, `blendMode`, `visible`, `parent`, `transform`. Your
`serialize` method should return **only** the plugin-specific fields —
everything that's in your `Omit<L, keyof LayerBase>`.

Do not include `id` or any shared field in the returned blob.

---

## 5. Compilation and the production runtime

The `compile` hook is what makes the "design in the editor, ship the
result" story work. At design-time, the user has the full library in
memory — all plugins, shader builders, validation, UI. At
production-time, they want **just the finished graphic** with the
smallest possible runtime.

### What `compile` should return

A `CompiledLayer` has three key fields:

- `plugin` — identifies the layer type so the runtime picks the right replayer
- `opacity`, `blendMode` — shared compositor state, snapshotted
- `data` — an **opaque plugin-specific payload** that contains
  everything the runtime needs to redraw this layer with no access
  to the design-time code

For a shader plugin (noise, particles), `data` typically contains:
- **Finalized shader source** (as a string) with compile-time constants
  already inlined as literals where possible
- **A uniform table** of frozen values that change only when exposed
  params are set at runtime
- Optional **vertex/instance data** baked as `Float32Array`-shaped JS arrays

### Why compilation is a per-plugin concern

Different plugins have completely different compiled representations.
A noise layer's `data` is a shader + constants. A sprite layer's `data`
is an image reference + transform. A procedural particle layer's `data`
is a spawn function + pool size. The renderer doesn't need to know —
it just asks each plugin to compile its own layers and bundles the
results.

### What compilation lets you strip from the runtime

Once you have a `CompiledScene`, the production runtime does not need:
- The shader builder (e.g., [`src/plugin/noise/builder.ts`](../src/plugin/noise/builder.ts))
- The shader chunks (the `chunks/` directory)
- The config serializer
- The default-layer factory
- The plugin's `needsRecompile` / `recompile` paths — scenes are frozen
- Any plugin whose layers aren't used in the scene

The plan is to ship the runtime as a second package entry point
(`rae-noise/runtime`) in a future pass. Plugins contribute to this
goal by keeping their `compile` output self-contained.

---

## 6. Checklist for adding a plugin

1. Create `src/plugin/<name>/index.ts` with a class implementing `Plugin<YourLayerConfig>`.
2. Extend the `Layer` discriminated union in [`src/types/index.d.ts`](../src/types/index.d.ts) with your config interface.
3. Set `schemaVersion = 1` and implement `serialize` / `deserialize` with
   migration slots reserved for future bumps.
4. Implement `compile` that returns a `CompiledLayer` with everything
   the runtime needs to replay the layer, nothing else.
5. Decide whether your plugin cares about `worldTransform` and handle
   it in `render` accordingly.
6. Write tests for the plugin's `serialize` ↔ `deserialize` round-trip
   (they don't need a real GL context — those methods are pure).
7. If it's a built-in plugin, register it in `Renderer` alongside
   `NoisePlugin`. If it's third-party, have users call
   `renderer.registerPlugin` themselves.

That's it. The renderer, serializer, scene graph, and compositor all
work with your new plugin automatically — because they only ever touch
the envelope and the plugin interface, never the plugin-specific
config fields.
