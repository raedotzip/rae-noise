import $ from "jquery";
import { type PaletteStop, createRenderer, defaultLayer } from "rae-noise";
import type { RaeNoiseRenderer, NoiseLayerConfig } from "rae-noise";
import { makeHierarchyItem, populateInspector } from "./layerCard";
import type { LayerCardDeps } from "./layerCard";
import { createNodeGraph } from "./nodeGraph";
import { presets } from "./presets";

/**
 * Initialise the editor demo — creates the WebGL renderer, wires up the
 * hierarchy / inspector panels, toolbar buttons, presets, and config modals.
 */
export default function initDemo(): void {
  const canvasEl: HTMLCanvasElement | null = document.getElementById("glCanvas") as HTMLCanvasElement | null;
  if (!canvasEl) return;

  const renderer: RaeNoiseRenderer = createRenderer(canvasEl);

  // ── FPS display ──────────────────────────────────────────
  const $fps: JQuery<HTMLElement> = $("#fps");
  if ($fps.length) {
    renderer.onFps = (fps: number): void => {
      $fps.text(`${fps} fps`);
    };
  }

  // ── Panels ───────────────────────────────────────────────
  const $layerList: JQuery<HTMLElement> = $("#layerList");
  if (!$layerList.length) return;
  const layerListEl: HTMLElement = $layerList[0];

  // ── Node graph ───────────────────────────────────────────
  const nodeGraph: ReturnType<typeof createNodeGraph> = createNodeGraph({ getRenderer: () => renderer });
  $("#openNodeGraph").on("click", (): void => {
    nodeGraph.open();
  });

  // ── Selection state ──────────────────────────────────────
  let selectedId: string | null = null;

  /**
   * Select a layer by id — highlights the hierarchy row and
   * populates the inspector panel with that layer's controls.
   */
  function selectLayer(id: string): void {
    selectedId = id;
    // Update hierarchy highlight
    $layerList.find(".hierarchy-item").each(function (this: HTMLElement): void {
      const $item: JQuery<HTMLElement> = $(this);
      $item.toggleClass("selected", $item.attr("data-id") === id);
    });
    // Populate inspector
    populateInspector(id, deps);
  }

  /**
   * Deselect all layers and reset the inspector to its empty state.
   */
  function clearInspector(): void {
    selectedId = null;
    const $container: JQuery<HTMLElement> = $("#inspectorContent");
    if ($container.length) {
      $container.html('<div class="inspector-empty"><p>select a layer to inspect</p></div>');
    }
    $layerList.find(".hierarchy-item").removeClass("selected");
  }

  // ── Shared deps passed to hierarchy items + inspector ────
  const deps: LayerCardDeps = {
    layerList: layerListEl,
    renderer,
    onSync: (): void => nodeGraph.syncFromRenderer(),
    onSelect: selectLayer,
    onRemove: (id: string): void => {
      if (selectedId === id) clearInspector();
    },
  };

  // ── Layer management helpers ─────────────────────────────
  let layerCount: number = 0;

  /**
   * Add a new noise layer to the renderer and create its hierarchy card.
   * Optionally accepts partial config overrides (e.g. from randomise or presets).
   */
  function addLayerWithCard(partial: Partial<NoiseLayerConfig> = {}): string {
    layerCount++;

    const hue: number = Math.random();
    const starterPalette: PaletteStop[] = partial.palette ?? [
      [0, 0, 0],
      [
        0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28)),
        0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 2)),
        0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 4)),
      ],
    ];

    const id: string = renderer.addLayer({
      ...defaultLayer(),
      name: `layer ${layerCount}`,
      ...partial,
      palette: starterPalette,
    });

    const item: HTMLElement = makeHierarchyItem(id, layerCount, deps);
    $layerList.prepend(item);
    nodeGraph.syncFromRenderer();

    // Auto-select the newly added layer
    selectLayer(id);
    return id;
  }

  /**
   * Remove every layer from the renderer, clear the hierarchy panel,
   * and reset the inspector.
   */
  function clearAllLayers(): void {
    for (const layer of renderer.getLayers()) {
      renderer.removeLayer(layer.id);
    }
    $layerList.empty();
    layerCount = 0;
    clearInspector();
    nodeGraph.syncFromRenderer();
  }

  // ── Add layer button ─────────────────────────────────────
  $("#addLayerBtn").on("click", (): void => {
    addLayerWithCard();
  });

  // ── Randomize button ─────────────────────────────────────
  $("#randomizeBtn").on("click", (): void => {
    clearAllLayers();
    const count: number = 2 + Math.floor(Math.random() * 2);
    const noiseTypes = ["simplex", "perlin", "worley", "fbm", "curl"] as const;
    const blendModes = ["add", "screen", "multiply", "overlay"] as const;
    const flowTypes = ["linear", "radial", "spiral", "vortex", "turbulent"] as const;

    for (let i: number = 0; i < count; i++) {
      const hue: number = Math.random();
      const stops: number = 2 + Math.floor(Math.random() * 4);
      const palette: PaletteStop[] = [];
      for (let s: number = 0; s < stops; s++) {
        const t: number = s / (stops - 1);
        palette.push([
          Math.abs(Math.sin((hue + t) * 6.28)) * 0.8 + Math.random() * 0.2,
          Math.abs(Math.sin((hue + t) * 6.28 + 2)) * 0.8 + Math.random() * 0.2,
          Math.abs(Math.sin((hue + t) * 6.28 + 4)) * 0.8 + Math.random() * 0.2,
        ]);
      }
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

  // ── Export / Import config ───────────────────────────────
  const $configModal: JQuery<HTMLElement> = $("#configModal");
  const $configTextarea: JQuery<HTMLTextAreaElement> = $("#configTextarea") as JQuery<HTMLTextAreaElement>;
  const $configCopyBtn: JQuery<HTMLElement> = $("#configCopyBtn");
  const $configApplyBtn: JQuery<HTMLElement> = $("#configApplyBtn");
  const $configStatus: JQuery<HTMLElement> = $("#configStatus");
  const $configModalTitle: JQuery<HTMLElement> = $("#configModalTitle");
  const $configModalClose: JQuery<HTMLElement> = $("#configModalClose");

  /**
   * Open the config modal in either export (read-only) or import (editable) mode.
   */
  function openConfigModal(mode: "export" | "import"): void {
    if (!$configModal.length || !$configTextarea.length || !$configCopyBtn.length || !$configApplyBtn.length || !$configModalTitle.length) {
      return;
    }
    $configModal.removeClass("hidden");

    if (mode === "export") {
      $configModalTitle.text("export config");
      const config = renderer.exportConfig();
      $configTextarea.val(JSON.stringify(config, null, 2));
      $configTextarea.prop("readOnly", true);
      $configCopyBtn.removeClass("hidden");
      $configApplyBtn.addClass("hidden");
    } else {
      $configModalTitle.text("import config");
      $configTextarea.val("");
      $configTextarea.prop("readOnly", false);
      $configTextarea.attr("placeholder", "Paste your JSON config here...");
      $configCopyBtn.addClass("hidden");
      $configApplyBtn.removeClass("hidden");
    }
    $configStatus.text("").attr("class", "config-status");
  }

  /** Close the config modal. */
  function closeConfigModal(): void {
    $configModal.addClass("hidden");
  }

  $("#exportConfigBtn").on("click", (): void => openConfigModal("export"));
  $("#importConfigBtn").on("click", (): void => openConfigModal("import"));
  $configModalClose.on("click", closeConfigModal);
  $configModal.on("click", function (this: HTMLElement, e: JQuery.ClickEvent): void {
    if (e.target === this) closeConfigModal();
  });

  $configCopyBtn.on("click", (): void => {
    const value: string = ($configTextarea.val() as string) ?? "";
    navigator.clipboard.writeText(value).then((): void => {
      $configStatus.text("copied to clipboard!").attr("class", "config-status config-status-ok");
    });
  });

  $configApplyBtn.on("click", (): void => {
    try {
      const raw: unknown = JSON.parse(($configTextarea.val() as string) ?? "");
      clearAllLayers();
      renderer.importConfig(raw);
      for (const layer of renderer.getLayers()) {
        layerCount++;
        const item: HTMLElement = makeHierarchyItem(layer.id, layerCount, deps);
        $layerList.prepend(item);
      }
      nodeGraph.syncFromRenderer();
      $configStatus
        .text(`loaded ${renderer.getLayers().length} layer(s)`)
        .attr("class", "config-status config-status-ok");
      setTimeout(closeConfigModal, 800);
    } catch (err: unknown) {
      const message: string = err instanceof Error ? err.message : "invalid JSON";
      $configStatus.text(message).attr("class", "config-status config-status-err");
    }
  });

  // ── Preset gallery ───────────────────────────────────────
  const $presetModal: JQuery<HTMLElement> = $("#presetModal");
  const $presetGrid: JQuery<HTMLElement> = $("#presetGrid");
  const $presetModalClose: JQuery<HTMLElement> = $("#presetModalClose");

  if ($presetGrid.length) {
    for (const preset of presets) {
      const $card: JQuery<HTMLElement> = $('<button class="preset-card"></button>');

      const firstLayer = preset.config.layers[0];
      const layerData = (firstLayer.data ?? {}) as { palette?: PaletteStop[] };
      const pal: PaletteStop[] = layerData.palette ?? [
        [0, 0, 0],
        [1, 1, 1],
      ];
      const gradStops: string = pal
        .map((s: PaletteStop, i: number): string => {
          const pct: number = pal.length === 1 ? 0 : (i / (pal.length - 1)) * 100;
          return `rgb(${Math.round(s[0] * 255)},${Math.round(s[1] * 255)},${Math.round(s[2] * 255)}) ${pct}%`;
        })
        .join(", ");

      $card.html(`
        <div class="preset-swatch" style="background: linear-gradient(135deg, ${gradStops})"></div>
        <div class="preset-info">
          <span class="preset-name">${preset.name}</span>
          <span class="preset-desc">${preset.description}</span>
          <span class="preset-layers">${preset.config.layers.length} layer${preset.config.layers.length > 1 ? "s" : ""}</span>
        </div>
      `);

      $card.on("click", (): void => {
        clearAllLayers();
        renderer.importConfig(JSON.parse(JSON.stringify(preset.config)));
        for (const layer of renderer.getLayers()) {
          layerCount++;
          const item: HTMLElement = makeHierarchyItem(layer.id, layerCount, deps);
          $layerList.prepend(item);
        }
        nodeGraph.syncFromRenderer();
        $presetModal.addClass("hidden");
      });

      $presetGrid.append($card);
    }
  }

  $("#openPresets").on("click", (): void => {
    $presetModal.removeClass("hidden");
  });
  $presetModalClose.on("click", (): void => {
    $presetModal.addClass("hidden");
  });
  $presetModal.on("click", function (this: HTMLElement, e: JQuery.ClickEvent): void {
    if (e.target === this) $presetModal.addClass("hidden");
  });

  // ── Viewport toolbar: pause, screenshot, fullscreen ──────
  const $pauseBtn: JQuery<HTMLElement> = $("#pauseBtn");
  const $screenshotBtn: JQuery<HTMLElement> = $("#screenshotBtn");
  const $fullscreenBtn: JQuery<HTMLElement> = $("#fullscreenBtn");

  let paused: boolean = false;

  if ($pauseBtn.length) {
    $pauseBtn.text("\u23F8");
    $pauseBtn.on("click", (): void => {
      paused = !paused;
      if (paused) {
        for (const layer of renderer.getLayers()) {
          renderer.updateLayer(layer.id, { speed: 0 });
        }
        $pauseBtn.text("\u25B6").addClass("toolbar-btn-active");
      } else {
        for (const layer of renderer.getLayers()) {
          renderer.updateLayer(layer.id, { animate: true });
        }
        $pauseBtn.text("\u23F8").removeClass("toolbar-btn-active");
        for (const layer of renderer.getLayers()) {
          renderer.updateLayer(layer.id, { speed: layer.speed });
        }
      }
    });
  }

  if ($screenshotBtn.length) {
    $screenshotBtn.on("click", (): void => {
      requestAnimationFrame((): void => {
        canvasEl.toBlob((blob: Blob | null): void => {
          if (!blob) return;
          const url: string = URL.createObjectURL(blob);
          const $a: JQuery<HTMLAnchorElement> = $("<a></a>") as JQuery<HTMLAnchorElement>;
          $a.attr({ href: url, download: `rae-noise-${Date.now()}.png` });
          $a[0].click();
          URL.revokeObjectURL(url);
        });
      });
    });
  }

  if ($fullscreenBtn.length) {
    $fullscreenBtn.on("click", (): void => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        $("#viewport")[0]?.requestFullscreen();
      }
    });
  }
}
