import type { Backend, BackendType, Layer, LayerEntry, RendererConfig } from "../types";

/**
 * Manifest envelope format version. Bump only when the *envelope* shape
 * changes (not when an individual backend's schema changes — those use
 * per-backend versioning via `Backend.schemaVersion`).
 */
const CURRENT_VERSION = 1;

/**
 * Exports the current layer stack as a serializable config object.
 *
 * The serializer is backend-agnostic: for each layer it walks the shared
 * {@link LayerBase} fields into the envelope and delegates the
 * backend-specific payload to `backend.serialize(layer)`. Adding a new
 * backend requires zero changes here.
 */
export function exportConfig(
  layers: Layer[],
  backends: Map<BackendType, Backend>
): RendererConfig {
  const entries: LayerEntry[] = layers.map((layer) => {
    const backend = backends.get(layer.backend);
    if (!backend) {
      throw new Error(
        `exportConfig: no backend registered for layer "${layer.id}" of type "${layer.backend}"`
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: backend is typed as Backend<LayerBase>
    const data = (backend as Backend<any>).serialize(layer);

    const entry: LayerEntry = {
      id: layer.id,
      backend: layer.backend,
      bv: backend.schemaVersion,
      name: layer.name,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      visible: layer.visible,
      data,
    };

    if (layer.parent != null) entry.parent = layer.parent;
    if (layer.transform) entry.transform = layer.transform;

    return entry;
  });

  return {
    version: CURRENT_VERSION,
    layers: entries,
  };
}

/**
 * Validates raw input and returns a {@link RendererConfig} ready for import.
 * Throws on structural problems in the envelope. Per-backend payload
 * validation is the backend's responsibility and happens inside
 * `backend.deserialize` when the renderer actually reconstructs the layer.
 */
export function importConfig(raw: unknown): RendererConfig {
  if (!isObject(raw)) {
    throw new Error("Invalid config: expected an object");
  }

  if (typeof raw.version !== "number") {
    throw new Error("Invalid config: missing or invalid 'version' field");
  }

  if (!Array.isArray(raw.layers)) {
    throw new Error("Invalid config: missing or invalid 'layers' array");
  }

  let config: RendererConfig = {
    version: raw.version,
    layers: raw.layers as LayerEntry[],
    scene: raw.scene,
    timeline: raw.timeline,
    assets: raw.assets,
    post: raw.post,
    bindings: raw.bindings,
  };

  config = migrate(config);

  for (let i = 0; i < config.layers.length; i++) {
    const entry = config.layers[i];
    if (!isObject(entry)) {
      throw new Error(`Invalid config: layer ${i} is not an object`);
    }
    if (typeof entry.backend !== "string") {
      throw new Error(`Invalid config: layer ${i} is missing 'backend' field`);
    }
    if (typeof entry.bv !== "number") {
      // Assume v1 if missing — matches the pre-envelope era.
      (entry as LayerEntry).bv = 1;
    }
  }

  return config;
}

/**
 * Reconstruct an in-memory {@link Layer} from an envelope entry by calling
 * the appropriate backend's `deserialize` hook. This is separated from
 * {@link importConfig} so the renderer can assign ids and run the backend
 * lookup at the right point in its own lifecycle.
 */
export function hydrateLayer(
  entry: LayerEntry,
  backends: Map<BackendType, Backend>,
  id: string
): Layer {
  const backend = backends.get(entry.backend);
  if (!backend) {
    throw new Error(
      `hydrateLayer: no backend registered for type "${entry.backend}". Register the backend with renderer.registerBackend() before importing the config.`
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: backend is typed as Backend<LayerBase>
  const specific = (backend as Backend<any>).deserialize(entry.data, entry.bv);

  return {
    id,
    name: entry.name ?? "layer",
    backend: entry.backend,
    opacity: entry.opacity ?? 1,
    blendMode: entry.blendMode ?? "add",
    visible: entry.visible ?? true,
    parent: entry.parent ?? null,
    transform: entry.transform,
    ...specific,
  } as Layer;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function migrate(config: RendererConfig): RendererConfig {
  // Future envelope migrations go here.
  return { ...config, version: CURRENT_VERSION };
}
