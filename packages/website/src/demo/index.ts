import $ from "jquery";
import { createRenderer } from "rae-noise";
import type { PaletteStop, NoiseLayerConfig, NoiseType, BlendMode, FlowType } from "rae-noise";
import { dispatch, getState, registerRenderer, subscribe } from "../store";
import { makeHierarchyItem, populateInspector, updateHierarchySwatch } from "./layerCard";
import { createNodeGraph } from "./nodeGraph";
import { presets } from "./presets";

/**
 * Initialise the noise editor.
 *
 * Creates the WebGL renderer, registers it with the store, wires up every
 * toolbar button and modal to dispatch intents, and subscribes to state
 * changes to keep the hierarchy / inspector panels in sync.
 */
export default function initDemo(): void {
  const canvasEl = document.getElementById("glCanvas") as HTMLCanvasElement | null;
  if (!canvasEl) return;

  // ── Renderer ─────────────────────────────────────────────────────────────
  const renderer = createRenderer(canvasEl);
  registerRenderer(renderer);

  // ── FPS display ───────────────────────────────────────────────────────────
  const $fps = $("#fps");
  if ($fps.length) {
    renderer.onFps = (fps: number) => $fps.text(`${fps} fps`);
  }

  // ── Hierarchy panel ───────────────────────────────────────────────────────
  const $layerList = $("#layerList");
  if (!$layerList.length) return;
  const layerListEl = $layerList[0];

  // ── Node graph ────────────────────────────────────────────────────────────
  const nodeGraph = createNodeGraph();

  // ── Inspector sync ────────────────────────────────────────────────────────
  /**
   * Refresh the inspector to show the currently selected layer.
   * Called on every state change that affects selection or layer data.
   */
  function syncInspector(): void {
    const { activeLayerId, layers } = getState();
    if (!activeLayerId) {
      $("#inspectorContent").html('<div class="inspector-empty"><p>select a layer to inspect</p></div>');
      return;
    }
    const layer = layers.find((l) => l.id === activeLayerId);
    if (layer) populateInspector(layer);
  }

  /**
   * Rebuild the hierarchy panel from scratch to match state.
   * Only called for bulk operations (import, clear, preset load).
   */
  function rebuildHierarchy(): void {
    const { layers } = getState();
    $layerList.empty();
    for (const layer of [...layers].reverse()) {
      $layerList.append(makeHierarchyItem(layer, layerListEl));
    }
    nodeGraph.sync();
  }

  // ── State subscriber ──────────────────────────────────────────────────────
  subscribe((nextState, intent) => {
    switch (intent.type) {
      case "LAYER_ADD": {
        // Read from getState() — not nextState — to get the real renderer-assigned ID
        const currentState = getState();
        const added = currentState.layers[currentState.layers.length - 1];
        $layerList.prepend(makeHierarchyItem(added, layerListEl));
        highlightSelected(currentState.activeLayerId);
        syncInspector();
        nodeGraph.sync();
        break;
      }
      case "LAYER_REMOVE": {
        $layerList.find(`[data-id="${intent.payload.id}"]`).remove();
        highlightSelected(nextState.activeLayerId);
        syncInspector();
        nodeGraph.sync();
        break;
      }
      case "LAYER_UPDATE": {
        const { id, patch } = intent.payload;
        // Targeted DOM updates — never re-render the whole inspector on a patch
        if (patch.palette) updateHierarchySwatch(layerListEl, id, patch.palette);
        if (patch.name !== undefined) {
          $layerList.find(`[data-id="${id}"] .layer-name-input`).val(patch.name);
        }
        if (patch.visible !== undefined) {
          $layerList.find(`[data-id="${id}"]`).toggleClass("hierarchy-item-hidden", !patch.visible);
          $layerList.find(`[data-id="${id}"] .layer-vis`).toggleClass("active", patch.visible);
        }
        // Only sync node graph on structural changes, not on every slider tick
        if (patch.name !== undefined || patch.palette !== undefined) nodeGraph.sync();
        break;
      }
      case "LAYER_REORDER":
        nodeGraph.sync();
        break;
      case "LAYER_SELECT":
        highlightSelected(nextState.activeLayerId);
        syncInspector();
        break;
      case "LAYERS_CLEAR":
      case "LAYERS_IMPORT":
        rebuildHierarchy();
        syncInspector();
        break;
      case "PLAYBACK_TOGGLE":
        $pauseBtn.text(nextState.paused ? "\u25B6" : "\u23F8").toggleClass("toolbar-btn-active", nextState.paused);
        break;
      case "MODAL_OPEN":
        openModal(nextState);
        break;
      case "MODAL_CLOSE":
        closeAllModals();
        break;
    }
  });

  /** Highlight the selected hierarchy row and deselect the rest. */
  function highlightSelected(id: string | null): void {
    $layerList.find(".hierarchy-item").each(function (this: HTMLElement) {
      $(this).toggleClass("selected", $(this).attr("data-id") === id);
    });
  }

  // ── Add layer button ──────────────────────────────────────────────────────
  $("#addLayerBtn").on("click", () => dispatch({ type: "LAYER_ADD" }));

  // ── Randomise button ──────────────────────────────────────────────────────
  $("#randomizeBtn").on("click", () => {
    dispatch({ type: "LAYERS_CLEAR" });

    const noiseTypes: NoiseType[] = ["simplex", "perlin", "worley", "fbm", "curl"];
    const blendModes: BlendMode[] = ["add", "screen", "multiply", "overlay"];
    const flowTypes: FlowType[] = ["linear", "radial", "spiral", "vortex", "turbulent"];
    const count = 2 + Math.floor(Math.random() * 2);

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
      if (i === 0) palette[0] = [0, 0, 0];

      dispatch({
        type: "LAYER_ADD",
        payload: {
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
        } satisfies Partial<NoiseLayerConfig>,
      });
    }
  });

  // ── Export / Import modals ────────────────────────────────────────────────
  const $configModal = $("#configModal");
  const $configTextarea = $("#configTextarea") as JQuery<HTMLTextAreaElement>;
  const $configCopyBtn = $("#configCopyBtn");
  const $configApplyBtn = $("#configApplyBtn");
  const $configStatus = $("#configStatus");
  const $configModalTitle = $("#configModalTitle");
  const $configModalClose = $("#configModalClose");

  function openModal(s: ReturnType<typeof getState>): void {
    if (s.openModal === "config-export") {
      $configModalTitle.text("export config");
      $configTextarea.val(JSON.stringify(renderer.exportConfig(), null, 2)).prop("readOnly", true);
      $configCopyBtn.removeClass("hidden");
      $configApplyBtn.addClass("hidden");
      $configStatus.text("").attr("class", "config-status");
      $configModal.removeClass("hidden");
    } else if (s.openModal === "config-import") {
      $configModalTitle.text("import config");
      $configTextarea.val("").prop("readOnly", false).attr("placeholder", "Paste your JSON config here...");
      $configCopyBtn.addClass("hidden");
      $configApplyBtn.removeClass("hidden");
      $configStatus.text("").attr("class", "config-status");
      $configModal.removeClass("hidden");
    } else if (s.openModal === "node-graph") {
      nodeGraph.open();
    } else if (s.openModal === "presets") {
      $("#presetModal").removeClass("hidden");
    }
  }

  function closeAllModals(): void {
    $configModal.addClass("hidden");
    $("#presetModal").addClass("hidden");
    $("#nodeModal").addClass("hidden");
  }

  $("#exportConfigBtn").on("click", () => dispatch({ type: "MODAL_OPEN", payload: { id: "config-export" } }));
  $("#importConfigBtn").on("click", () => dispatch({ type: "MODAL_OPEN", payload: { id: "config-import" } }));
  $configModalClose.on("click", () => dispatch({ type: "MODAL_CLOSE" }));
  $configModal.on("click", function (this: HTMLElement, e: JQuery.ClickEvent) {
    if (e.target === this) dispatch({ type: "MODAL_CLOSE" });
  });

  $configCopyBtn.on("click", () => {
    const value = ($configTextarea.val() as string) ?? "";
    navigator.clipboard.writeText(value).then(() => {
      $configStatus.text("copied to clipboard!").attr("class", "config-status config-status-ok");
    });
  });

  $configApplyBtn.on("click", () => {
    try {
      const raw = JSON.parse(($configTextarea.val() as string) ?? "");
      dispatch({ type: "LAYERS_IMPORT", payload: { config: raw } });
      $configStatus
        .text(`loaded ${getState().layers.length} layer(s)`)
        .attr("class", "config-status config-status-ok");
      setTimeout(() => dispatch({ type: "MODAL_CLOSE" }), 800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "invalid JSON";
      $configStatus.text(msg).attr("class", "config-status config-status-err");
    }
  });

  // ── Preset gallery ────────────────────────────────────────────────────────
  const $presetGrid = $("#presetGrid");
  const $presetModalClose = $("#presetModalClose");
  const $presetModal = $("#presetModal");

  if ($presetGrid.length) {
    for (const preset of presets) {
      const $card = $('<button class="preset-card"></button>');
      const firstLayer = preset.config.layers[0];
      const layerData = (firstLayer?.data ?? {}) as { palette?: PaletteStop[] };
      const pal: PaletteStop[] = layerData.palette ?? [[0, 0, 0], [1, 1, 1]];
      const gradStops = pal
        .map((s, i) => {
          const pct = pal.length === 1 ? 0 : (i / (pal.length - 1)) * 100;
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

      $card.on("click", () => {
        dispatch({ type: "LAYERS_IMPORT", payload: { config: JSON.parse(JSON.stringify(preset.config)) } });
        dispatch({ type: "MODAL_CLOSE" });
      });

      $presetGrid.append($card);
    }
  }

  $("#openPresets").on("click", () => dispatch({ type: "MODAL_OPEN", payload: { id: "presets" } }));
  $presetModalClose.on("click", () => dispatch({ type: "MODAL_CLOSE" }));
  $presetModal.on("click", function (this: HTMLElement, e: JQuery.ClickEvent) {
    if (e.target === this) dispatch({ type: "MODAL_CLOSE" });
  });

  // ── Node graph ────────────────────────────────────────────────────────────
  $("#openNodeGraph").on("click", () => dispatch({ type: "MODAL_OPEN", payload: { id: "node-graph" } }));

  // ── Viewport toolbar ──────────────────────────────────────────────────────
  const $pauseBtn = $("#pauseBtn");
  const $screenshotBtn = $("#screenshotBtn");
  const $fullscreenBtn = $("#fullscreenBtn");

  if ($pauseBtn.length) {
    $pauseBtn.text("\u23F8");
    $pauseBtn.on("click", () => dispatch({ type: "PLAYBACK_TOGGLE" }));
  }

  if ($screenshotBtn.length) {
    $screenshotBtn.on("click", () => {
      requestAnimationFrame(() => {
        canvasEl.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const $a = $("<a></a>") as JQuery<HTMLAnchorElement>;
          $a.attr({ href: url, download: `rae-noise-${Date.now()}.png` });
          $a[0].click();
          URL.revokeObjectURL(url);
        });
      });
    });
  }

  if ($fullscreenBtn.length) {
    $fullscreenBtn.on("click", () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        $("#viewport")[0]?.requestFullscreen();
      }
    });
  }
}
