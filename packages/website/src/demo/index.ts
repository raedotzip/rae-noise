import { type PaletteStop, createRenderer, defaultLayer } from "rae-noise";
import { makeLayerCard } from "./layerCard";
import { createNodeGraph } from "./nodeGraph";
import { presets } from "./presets";

export default function initDemo() {
  // ── Initialize renderer AFTER route/template is rendered ──
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('Canvas element with id "glCanvas" not found in the current route!');
    return;
  }

  const renderer = createRenderer(canvas);

  // FPS display
  const fpsEl = document.getElementById("fps");
  if (fpsEl) {
    renderer.onFps = (fps: number) => {
      fpsEl.textContent = `${fps} fps`;
    };
  }

  // Layer list
  const layerList = document.getElementById("layerList");
  if (!layerList) {
    console.warn("Layer list element not found; skipping layer UI setup.");
  }

  // Node graph
  const nodeGraph = createNodeGraph({ getRenderer: () => renderer });
  const openNodeGraphBtn = document.getElementById("openNodeGraph");
  if (openNodeGraphBtn) {
    openNodeGraphBtn.addEventListener("click", () => nodeGraph.open());
  }

  // ── Layer management helpers ──────────────────────────────
  let layerCount = 0;

  function addLayerWithCard(partial: Partial<Parameters<typeof renderer.addLayer>[0]> = {}) {
    if (!layerList) return;
    layerCount++;

    const hue = Math.random();
    const starterPalette: PaletteStop[] = partial.palette ?? [
      [0, 0, 0],
      [
        0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28)),
        0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 2)),
        0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 4)),
      ],
    ];

    const id = renderer.addLayer({
      ...defaultLayer(),
      name: `layer ${layerCount}`,
      ...partial,
      palette: starterPalette,
    });

    const card = makeLayerCard(id, layerCount, {
      layerList,
      renderer,
      onSync: () => nodeGraph.syncFromRenderer(),
    });

    layerList.prepend(card);
    nodeGraph.syncFromRenderer();
  }

  function clearAllLayers() {
    for (const layer of renderer.getLayers()) {
      renderer.removeLayer(layer.id);
    }
    if (layerList) layerList.innerHTML = "";
    layerCount = 0;
    nodeGraph.syncFromRenderer();
  }

  // ── Add layer button ──────────────────────────────────────
  const addLayerBtn = document.getElementById("addLayerBtn");
  if (addLayerBtn && layerList) {
    addLayerBtn.addEventListener("click", () => addLayerWithCard());
  }

  // ── Randomize button ──────────────────────────────────────
  const randomizeBtn = document.getElementById("randomizeBtn");
  if (randomizeBtn && layerList) {
    randomizeBtn.addEventListener("click", () => {
      clearAllLayers();
      const count = 2 + Math.floor(Math.random() * 2); // 2-3 layers
      const noiseTypes = ["simplex", "perlin", "worley", "fbm", "curl"] as const;
      const blendModes = ["add", "screen", "multiply", "overlay"] as const;
      const flowTypes = ["linear", "radial", "spiral", "vortex", "turbulent"] as const;

      for (let i = 0; i < count; i++) {
        const hue = Math.random();
        const stops = 2 + Math.floor(Math.random() * 4);
        const palette: PaletteStop[] = [];
        for (let s = 0; s < stops; s++) {
          const t = s / (stops - 1);
          palette.push([
            Math.abs(Math.sin((hue + t) * 6.28)) * 0.8 + Math.random() * 0.2,
            Math.abs(Math.sin((hue + t) * 6.28 + 2)) * 0.8 + Math.random() * 0.2,
            Math.abs(Math.sin((hue + t) * 6.28 + 4)) * 0.8 + Math.random() * 0.2,
          ]);
        }
        // First stop dark for depth
        if (i === 0) palette[0] = [0, 0, 0];

        addLayerWithCard({
          noiseType: noiseTypes[Math.floor(Math.random() * noiseTypes.length)],
          blendMode: i === 0 ? "add" : blendModes[Math.floor(Math.random() * blendModes.length)],
          flowType: flowTypes[Math.floor(Math.random() * flowTypes.length)],
          scale: 1 + Math.random() * 8,
          speed: 0.05 + Math.random() * 0.8,
          contrast: 0.8 + Math.random() * 2.0,
          brightness: -0.2 + Math.random() * 0.3,
          warp: Math.random() * 0.8,
          curlStrength: Math.random() > 0.6 ? Math.random() * 0.5 : 0,
          octaves: 2 + Math.floor(Math.random() * 5),
          opacity: i === 0 ? 1.0 : 0.3 + Math.random() * 0.5,
          animate: true,
          palette,
        });
      }
    });
  }

  // ── Export / Import config ────────────────────────────────
  const configModal = document.getElementById("configModal");
  const configTextarea = document.getElementById("configTextarea") as HTMLTextAreaElement | null;
  const configCopyBtn = document.getElementById("configCopyBtn");
  const configApplyBtn = document.getElementById("configApplyBtn");
  const configStatus = document.getElementById("configStatus");
  const configModalTitle = document.getElementById("configModalTitle");
  const configModalClose = document.getElementById("configModalClose");

  function openConfigModal(mode: "export" | "import") {
    if (!configModal || !configTextarea || !configCopyBtn || !configApplyBtn || !configModalTitle) {
      return;
    }
    configModal.classList.remove("hidden");

    if (mode === "export") {
      configModalTitle.textContent = "export config";
      const config = renderer.exportConfig();
      configTextarea.value = JSON.stringify(config, null, 2);
      configTextarea.readOnly = true;
      configCopyBtn.classList.remove("hidden");
      configApplyBtn.classList.add("hidden");
    } else {
      configModalTitle.textContent = "import config";
      configTextarea.value = "";
      configTextarea.readOnly = false;
      configTextarea.placeholder = "Paste your JSON config here...";
      configCopyBtn.classList.add("hidden");
      configApplyBtn.classList.remove("hidden");
    }
    if (configStatus) {
      configStatus.textContent = "";
      configStatus.className = "config-status";
    }
  }

  function closeConfigModal() {
    configModal?.classList.add("hidden");
  }

  const exportBtn = document.getElementById("exportConfigBtn");
  if (exportBtn) exportBtn.addEventListener("click", () => openConfigModal("export"));

  const importBtn = document.getElementById("importConfigBtn");
  if (importBtn) importBtn.addEventListener("click", () => openConfigModal("import"));

  if (configModalClose) configModalClose.addEventListener("click", closeConfigModal);
  if (configModal) {
    configModal.addEventListener("click", (e) => {
      if (e.target === configModal) closeConfigModal();
    });
  }

  if (configCopyBtn && configTextarea) {
    configCopyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(configTextarea.value).then(() => {
        if (configStatus) {
          configStatus.textContent = "copied to clipboard!";
          configStatus.className = "config-status config-status-ok";
        }
      });
    });
  }

  if (configApplyBtn && configTextarea) {
    configApplyBtn.addEventListener("click", () => {
      try {
        const raw = JSON.parse(configTextarea.value);
        clearAllLayers();
        renderer.importConfig(raw);
        // Rebuild cards for imported layers
        for (const layer of renderer.getLayers()) {
          layerCount++;
          if (layerList) {
            const card = makeLayerCard(layer.id, layerCount, {
              layerList,
              renderer,
              onSync: () => nodeGraph.syncFromRenderer(),
            });
            layerList.prepend(card);
          }
        }
        nodeGraph.syncFromRenderer();
        if (configStatus) {
          configStatus.textContent = `loaded ${renderer.getLayers().length} layer(s)`;
          configStatus.className = "config-status config-status-ok";
        }
        setTimeout(closeConfigModal, 800);
      } catch (err) {
        if (configStatus) {
          configStatus.textContent = err instanceof Error ? err.message : "invalid JSON";
          configStatus.className = "config-status config-status-err";
        }
      }
    });
  }

  // ── Preset gallery ────────────────────────────────────────
  const presetModal = document.getElementById("presetModal");
  const presetGrid = document.getElementById("presetGrid");
  const presetModalClose = document.getElementById("presetModalClose");
  const openPresetsBtn = document.getElementById("openPresets");

  if (presetGrid) {
    for (const preset of presets) {
      const card = document.createElement("button");
      card.className = "preset-card";

      // Create a mini palette preview from the first layer
      const firstLayer = preset.config.layers[0];
      const pal = (firstLayer as { palette?: PaletteStop[] }).palette ?? [
        [0, 0, 0],
        [1, 1, 1],
      ];
      const gradStops = pal
        .map((s, i) => {
          const pct = pal.length === 1 ? 0 : (i / (pal.length - 1)) * 100;
          return `rgb(${Math.round(s[0] * 255)},${Math.round(s[1] * 255)},${Math.round(s[2] * 255)}) ${pct}%`;
        })
        .join(", ");

      card.innerHTML = `
        <div class="preset-swatch" style="background: linear-gradient(135deg, ${gradStops})"></div>
        <div class="preset-info">
          <span class="preset-name">${preset.name}</span>
          <span class="preset-desc">${preset.description}</span>
          <span class="preset-layers">${preset.config.layers.length} layer${preset.config.layers.length > 1 ? "s" : ""}</span>
        </div>
      `;

      card.addEventListener("click", () => {
        clearAllLayers();
        renderer.importConfig(JSON.parse(JSON.stringify(preset.config)));
        for (const layer of renderer.getLayers()) {
          layerCount++;
          if (layerList) {
            const lc = makeLayerCard(layer.id, layerCount, {
              layerList,
              renderer,
              onSync: () => nodeGraph.syncFromRenderer(),
            });
            layerList.prepend(lc);
          }
        }
        nodeGraph.syncFromRenderer();
        presetModal?.classList.add("hidden");
      });

      presetGrid.appendChild(card);
    }
  }

  if (openPresetsBtn) {
    openPresetsBtn.addEventListener("click", () => presetModal?.classList.remove("hidden"));
  }
  if (presetModalClose) {
    presetModalClose.addEventListener("click", () => presetModal?.classList.add("hidden"));
  }
  if (presetModal) {
    presetModal.addEventListener("click", (e) => {
      if (e.target === presetModal) presetModal.classList.add("hidden");
    });
  }

  // ── Viewport toolbar: pause, screenshot, fullscreen ───────
  const pauseBtn = document.getElementById("pauseBtn");
  const screenshotBtn = document.getElementById("screenshotBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");

  let paused = false;

  if (pauseBtn) {
    pauseBtn.textContent = "⏸";
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      if (paused) {
        for (const layer of renderer.getLayers()) {
          renderer.updateLayer(layer.id, { speed: 0 });
        }
        pauseBtn.textContent = "▶";
        pauseBtn.classList.add("toolbar-btn-active");
      } else {
        for (const layer of renderer.getLayers()) {
          // Restore speed from defaults or stored — we re-read the card slider values
          // The simplest approach: just set animate back (layers store their own speed)
          renderer.updateLayer(layer.id, { animate: true });
        }
        pauseBtn.textContent = "⏸";
        pauseBtn.classList.remove("toolbar-btn-active");
        // Force recompile to restore animation
        for (const layer of renderer.getLayers()) {
          renderer.updateLayer(layer.id, { speed: layer.speed });
        }
      }
    });
  }

  if (screenshotBtn) {
    screenshotBtn.addEventListener("click", () => {
      // Need to read the canvas on the next frame after render
      requestAnimationFrame(() => {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `rae-noise-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
      });
    });
  }

  if (fullscreenBtn) {
    const viewport = document.getElementById("viewport");
    fullscreenBtn.addEventListener("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        fullscreenBtn.textContent = "⛶";
      } else {
        viewport?.requestFullscreen();
        fullscreenBtn.textContent = "⛶";
      }
    });
  }
}
