/**
 * @file JSON config serializer/deserializer for rae-noise.
 *
 * Handles exporting the renderer's layer stack to a portable JSON format
 * ({@link RendererConfig}) and importing it back. The serializer is
 * plugin-agnostic: for each layer it writes the shared compositor/scene-graph
 * fields into the envelope and delegates the plugin-specific payload to the
 * plugin's own {@link Plugin.serialize} / {@link Plugin.deserialize} pair.
 *
 * ## Envelope format
 *
 * ```json
 * {
 *   "version": 1,
 *   "layers": [
 *     {
 *       "id": "abc-123",
 *       "plugin": "noise",
 *       "bv": 1,
 *       "name": "background",
 *       "opacity": 0.8,
 *       "blendMode": "add",
 *       "data": { ... }
 *     }
 *   ]
 * }
 * ```
 *
 * The `data` blob is opaque to this module. Each plugin owns its format and
 * schema versioning. Adding a new plugin requires zero changes here.
 *
 * ## Versioning strategy
 *
 * - **Envelope version** (`version` field): bumped when the envelope shape
 *   changes (new top-level fields, renamed layer fields). Very rare.
 * - **Plugin schema version** (`bv` field per layer): bumped when a plugin's
 *   data format changes. Each plugin handles its own migrations in
 *   {@link Plugin.deserialize}.
 *
 * @example
 * ```ts
 * const config = renderer.exportConfig();
 * localStorage.setItem("my-preset", JSON.stringify(config));
 *
 * // Restore:
 * renderer.importConfig(JSON.parse(localStorage.getItem("my-preset")!));
 * ```
 *
 * @see {@link RendererConfig} for the top-level config type.
 * @see {@link LayerEntry} for the per-layer envelope type.
 * @see {@link Plugin.serialize} / {@link Plugin.deserialize} for plugin-owned data.
 */

import type { Layer, LayerEntry, Plugin, PluginType, RendererConfig } from "../types";

/**
 * Manifest envelope format version. Bump only when the *envelope* shape
 * changes (not when an individual plugin's schema changes — those use
 * per-plugin versioning via {@link Plugin.schemaVersion}).
 */
const CURRENT_VERSION = 1;

/**
 * Export the current layer stack as a serializable config object.
 *
 * For each layer, writes shared {@link LayerBase} fields into the envelope
 * and delegates the plugin-specific payload to `plugin.serialize(layer)`.
 *
 * @param layers  - The ordered layer stack (bottom to top).
 * @param plugins - Registry of rendering plugins, keyed by plugin type.
 * @returns A serializable {@link RendererConfig}.
 * @throws If a layer references a plugin type that is not registered.
 *
 * @example
 * ```ts
 * const config = exportConfig(renderer.getLayers(), plugins);
 * const json = JSON.stringify(config);
 * ```
 */
export function exportConfig(
  layers: Layer[],
  plugins: Map<PluginType, Plugin>
): RendererConfig {
  const entries: LayerEntry[] = layers.map((layer) => {
    const plugin = plugins.get(layer.plugin);
    if (!plugin) {
      throw new Error(
        `exportConfig: no plugin registered for layer "${layer.id}" of type "${layer.plugin}"`
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: plugin is typed as Plugin<LayerBase>
    const data = (plugin as Plugin<any>).serialize(layer);

    const entry: LayerEntry = {
      id: layer.id,
      plugin: layer.plugin,
      bv: plugin.schemaVersion,
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
 * Validate raw input and return a {@link RendererConfig} ready for import.
 *
 * Throws on structural problems in the envelope (missing version, non-array
 * layers, etc.). Per-plugin payload validation happens inside the plugin's
 * {@link Plugin.deserialize} when the renderer actually reconstructs the layer.
 *
 * @param raw - The raw parsed JSON object to validate.
 * @returns A validated {@link RendererConfig}.
 * @throws If the input is not a valid config envelope.
 *
 * @example
 * ```ts
 * const config = importConfig(JSON.parse(jsonString));
 * // config is now safe to pass to renderer.importConfig()
 * ```
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
    if (typeof entry.plugin !== "string") {
      throw new Error(`Invalid config: layer ${i} is missing 'plugin' field`);
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
 * the appropriate plugin's {@link Plugin.deserialize} hook.
 *
 * Separated from {@link importConfig} so the renderer can assign ids and
 * run the plugin lookup at the right point in its own lifecycle.
 *
 * @param entry   - The envelope entry from the config.
 * @param plugins - Registry of rendering plugins.
 * @param id      - The fresh id to assign to the reconstructed layer.
 * @returns A fully hydrated in-memory {@link Layer}.
 * @throws If the entry references a plugin type that is not registered.
 *
 * @example
 * ```ts
 * const layer = hydrateLayer(entry, plugins, crypto.randomUUID());
 * ```
 */
export function hydrateLayer(
  entry: LayerEntry,
  plugins: Map<PluginType, Plugin>,
  id: string
): Layer {
  const plugin = plugins.get(entry.plugin);
  if (!plugin) {
    throw new Error(
      `hydrateLayer: no plugin registered for type "${entry.plugin}". Register the plugin with renderer.registerPlugin() before importing the config.`
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: plugin is typed as Plugin<LayerBase>
  const specific = (plugin as Plugin<any>).deserialize(entry.data, entry.bv);

  return {
    id,
    name: entry.name ?? "layer",
    plugin: entry.plugin,
    opacity: entry.opacity ?? 1,
    blendMode: entry.blendMode ?? "add",
    visible: entry.visible ?? true,
    parent: entry.parent ?? null,
    transform: entry.transform,
    ...specific,
  } as Layer;
}

/**
 * Type guard: check if a value is a non-null, non-array object.
 */
function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Apply envelope-level migrations. Future migrations go here.
 * Currently a no-op that normalizes the version number.
 */
function migrate(config: RendererConfig): RendererConfig {
  // Future envelope migrations go here.
  return { ...config, version: CURRENT_VERSION };
}
