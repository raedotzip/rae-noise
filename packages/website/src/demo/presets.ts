import type { LayerEntry, RendererConfig } from "rae-noise";

interface Preset {
  name: string;
  description: string;
  config: RendererConfig;
}

/** Shorthand to build a noise LayerEntry with envelope format. */
function noise(
  name: string,
  data: Record<string, unknown>,
  shared: Partial<Pick<LayerEntry, "opacity" | "blendMode" | "visible">> = {}
): LayerEntry {
  return {
    backend: "noise",
    bv: 1,
    name,
    opacity: shared.opacity ?? 1.0,
    blendMode: shared.blendMode ?? "add",
    visible: shared.visible ?? true,
    data,
  };
}

export const presets: Preset[] = [
  {
    name: "aurora",
    description: "Shimmering northern lights",
    config: {
      version: 1,
      layers: [
        noise("base glow", {
          noiseType: "fbm",
          scale: 2.5,
          octaves: 5,
          speed: 0.15,
          direction: [0.3, 1.0],
          flowType: "linear",
          contrast: 1.4,
          brightness: -0.1,
          palette: [
            [0.0, 0.02, 0.08],
            [0.0, 0.6, 0.4],
            [0.1, 0.9, 0.7],
            [0.0, 0.3, 0.6],
          ],
          animate: true,
          warp: 0.4,
          curlStrength: 0.0,
        }),
        noise(
          "shimmer",
          {
            noiseType: "simplex",
            scale: 6.0,
            octaves: 4,
            speed: 0.4,
            direction: [0.0, 1.0],
            flowType: "turbulent",
            contrast: 2.0,
            brightness: -0.15,
            palette: [
              [0.0, 0.0, 0.0],
              [0.2, 0.8, 1.0],
              [0.0, 0.4, 0.8],
            ],
            animate: true,
            warp: 0.2,
            curlStrength: 0.0,
          },
          { opacity: 0.5, blendMode: "screen" }
        ),
      ],
    },
  },
  {
    name: "fire",
    description: "Roaring flames",
    config: {
      version: 1,
      layers: [
        noise("embers", {
          noiseType: "fbm",
          scale: 3.0,
          octaves: 6,
          speed: 0.6,
          direction: [0.0, -1.0],
          flowType: "turbulent",
          contrast: 1.8,
          brightness: -0.05,
          palette: [
            [0.05, 0.0, 0.0],
            [0.6, 0.1, 0.0],
            [1.0, 0.4, 0.0],
            [1.0, 0.85, 0.2],
          ],
          animate: true,
          warp: 0.5,
          curlStrength: 0.0,
        }),
        noise(
          "heat distortion",
          {
            noiseType: "curl",
            scale: 4.0,
            octaves: 4,
            speed: 0.8,
            direction: [0.0, -1.0],
            flowType: "linear",
            contrast: 1.2,
            brightness: 0.0,
            palette: [
              [0.0, 0.0, 0.0],
              [0.8, 0.2, 0.0],
              [1.0, 0.6, 0.1],
            ],
            animate: true,
            warp: 0.3,
            curlStrength: 0.6,
          },
          { opacity: 0.4, blendMode: "screen" }
        ),
      ],
    },
  },
  {
    name: "ocean",
    description: "Deep sea currents",
    config: {
      version: 1,
      layers: [
        noise("deep water", {
          noiseType: "fbm",
          scale: 2.0,
          octaves: 5,
          speed: 0.12,
          direction: [1.0, 0.2],
          flowType: "linear",
          contrast: 1.2,
          brightness: 0.0,
          palette: [
            [0.0, 0.02, 0.1],
            [0.0, 0.15, 0.35],
            [0.0, 0.3, 0.5],
            [0.05, 0.5, 0.7],
          ],
          animate: true,
          warp: 0.3,
          curlStrength: 0.0,
        }),
        noise(
          "caustics",
          {
            noiseType: "worley",
            scale: 5.0,
            octaves: 4,
            speed: 0.25,
            direction: [0.5, 0.5],
            flowType: "spiral",
            contrast: 2.2,
            brightness: -0.2,
            palette: [
              [0.0, 0.0, 0.0],
              [0.1, 0.5, 0.8],
              [0.3, 0.8, 1.0],
            ],
            animate: true,
            warp: 0.15,
            curlStrength: 0.0,
          },
          { opacity: 0.35, blendMode: "screen" }
        ),
      ],
    },
  },
  {
    name: "smoke",
    description: "Wispy smoke tendrils",
    config: {
      version: 1,
      layers: [
        noise("smoke", {
          noiseType: "fbm",
          scale: 2.5,
          octaves: 6,
          speed: 0.2,
          direction: [0.2, -0.8],
          flowType: "turbulent",
          contrast: 1.6,
          brightness: -0.1,
          palette: [
            [0.0, 0.0, 0.0],
            [0.15, 0.15, 0.18],
            [0.35, 0.35, 0.4],
            [0.6, 0.6, 0.65],
          ],
          animate: true,
          warp: 0.8,
          curlStrength: 0.3,
        }),
      ],
    },
  },
  {
    name: "neon",
    description: "Electric neon glow",
    config: {
      version: 1,
      layers: [
        noise("neon base", {
          noiseType: "simplex",
          scale: 3.5,
          octaves: 4,
          speed: 0.35,
          direction: [1.0, 0.0],
          flowType: "vortex",
          contrast: 2.5,
          brightness: -0.1,
          palette: [
            [0.0, 0.0, 0.05],
            [0.8, 0.0, 1.0],
            [0.0, 0.0, 0.1],
            [0.0, 0.8, 1.0],
          ],
          animate: true,
          warp: 0.2,
          curlStrength: 0.0,
        }),
        noise(
          "glow lines",
          {
            noiseType: "worley",
            scale: 8.0,
            octaves: 4,
            speed: 0.5,
            direction: [0.0, 1.0],
            flowType: "spiral",
            contrast: 3.0,
            brightness: -0.3,
            palette: [
              [0.0, 0.0, 0.0],
              [1.0, 0.0, 0.6],
              [0.0, 0.0, 0.0],
              [0.0, 1.0, 0.8],
            ],
            animate: true,
            warp: 0.0,
            curlStrength: 0.0,
          },
          { opacity: 0.45, blendMode: "screen" }
        ),
      ],
    },
  },
  {
    name: "lava",
    description: "Molten lava flow",
    config: {
      version: 1,
      layers: [
        noise("magma", {
          noiseType: "worley",
          scale: 3.0,
          octaves: 4,
          speed: 0.08,
          direction: [0.5, -0.5],
          flowType: "linear",
          contrast: 1.5,
          brightness: 0.0,
          palette: [
            [0.1, 0.0, 0.0],
            [0.5, 0.05, 0.0],
            [1.0, 0.3, 0.0],
            [1.0, 0.8, 0.1],
          ],
          animate: true,
          warp: 0.6,
          curlStrength: 0.4,
        }),
        noise(
          "crust",
          {
            noiseType: "fbm",
            scale: 4.5,
            octaves: 7,
            speed: 0.04,
            direction: [1.0, 0.0],
            flowType: "linear",
            contrast: 2.0,
            brightness: -0.15,
            palette: [
              [0.0, 0.0, 0.0],
              [0.15, 0.05, 0.0],
              [0.0, 0.0, 0.0],
            ],
            animate: true,
            warp: 0.3,
            curlStrength: 0.0,
          },
          { opacity: 0.6, blendMode: "multiply" }
        ),
      ],
    },
  },
  {
    name: "galaxy",
    description: "Cosmic nebula swirl",
    config: {
      version: 1,
      layers: [
        noise("nebula", {
          noiseType: "fbm",
          scale: 2.0,
          octaves: 6,
          speed: 0.1,
          direction: [1.0, 0.0],
          flowType: "vortex",
          contrast: 1.3,
          brightness: -0.05,
          palette: [
            [0.0, 0.0, 0.05],
            [0.3, 0.0, 0.5],
            [0.1, 0.0, 0.3],
            [0.6, 0.2, 0.8],
            [0.9, 0.5, 1.0],
          ],
          animate: true,
          warp: 0.35,
          curlStrength: 0.0,
        }),
        noise(
          "stars",
          {
            noiseType: "worley",
            scale: 12.0,
            octaves: 4,
            speed: 0.02,
            direction: [0.0, 0.0],
            flowType: "linear",
            contrast: 3.5,
            brightness: -0.4,
            palette: [
              [0.0, 0.0, 0.0],
              [0.0, 0.0, 0.0],
              [1.0, 1.0, 1.0],
            ],
            animate: true,
            warp: 0.0,
            curlStrength: 0.0,
          },
          { opacity: 0.5, blendMode: "screen" }
        ),
      ],
    },
  },
  {
    name: "matrix",
    description: "Digital rain cascade",
    config: {
      version: 1,
      layers: [
        noise("rain", {
          noiseType: "simplex",
          scale: 8.0,
          octaves: 4,
          speed: 1.2,
          direction: [0.0, -1.0],
          flowType: "linear",
          contrast: 3.0,
          brightness: -0.3,
          palette: [
            [0.0, 0.02, 0.0],
            [0.0, 1.0, 0.3],
            [0.0, 0.15, 0.0],
          ],
          animate: true,
          warp: 0.0,
          curlStrength: 0.0,
        }),
        noise(
          "glow",
          {
            noiseType: "fbm",
            scale: 3.0,
            octaves: 4,
            speed: 0.3,
            direction: [0.0, -0.5],
            flowType: "linear",
            contrast: 1.0,
            brightness: 0.0,
            palette: [
              [0.0, 0.0, 0.0],
              [0.0, 0.4, 0.1],
            ],
            animate: true,
            warp: 0.1,
            curlStrength: 0.0,
          },
          { opacity: 0.4, blendMode: "screen" }
        ),
      ],
    },
  },
];
