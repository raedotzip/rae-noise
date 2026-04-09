import type { Layer, RendererConfig } from "../types";

const CURRENT_VERSION = 1;

/**
 * Exports the current layer stack as a serializable config object.
 * Layer `id` fields are stripped — they are reassigned on import.
 */
export function exportConfig(layers: Layer[]): RendererConfig {
  return {
    version: CURRENT_VERSION,
    layers: layers.map((layer) => {
      const { id: _, ...rest } = layer;
      return rest;
    }),
  };
}

/**
 * Validates and returns a renderer config from raw input.
 * Throws if the format is invalid. Runs migrations if needed.
 */
export function importConfig(raw: unknown): RendererConfig {
  if (!isObject(raw)) {
    throw new Error("Invalid config: expected an object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    throw new Error("Invalid config: missing or invalid 'version' field");
  }

  if (!Array.isArray(obj.layers)) {
    throw new Error("Invalid config: missing or invalid 'layers' array");
  }

  let config: RendererConfig = {
    version: obj.version,
    layers: obj.layers as Omit<Layer, "id">[],
  };

  // Run migrations for older versions
  config = migrate(config);

  // Validate each layer has at minimum a backend field
  for (let i = 0; i < config.layers.length; i++) {
    const layer = config.layers[i];
    if (!isObject(layer)) {
      throw new Error(`Invalid config: layer ${i} is not an object`);
    }
    if (typeof (layer as Record<string, unknown>).backend !== "string") {
      // Default to noise for backwards compatibility
      (layer as Record<string, unknown>).backend = "noise";
    }
  }

  return config;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function migrate(config: RendererConfig): RendererConfig {
  // Version 1 is current — no migrations needed yet.
  // Future migrations go here:
  // if (config.version < 2) config = migrateV1toV2(config);
  return { ...config, version: CURRENT_VERSION };
}
