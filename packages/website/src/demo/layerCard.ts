import Handlebars from "handlebars";
import type { BlendMode, FlowType, NoiseLayer, NoiseType } from "rae-noise";
import { swatchGradient } from "./color";
import { makeChipGroup, makeDial, makePaletteEditor, makeSlider, makeToggleRow } from "./widgets";

export interface LayerCardDeps {
  layerList: HTMLElement;
  renderer: {
    getLayers: () => NoiseLayer[];
    updateLayer: (id: string, patch: Partial<NoiseLayer>) => void;
    removeLayer: (id: string) => void;
    reorderLayers: (ids: string[]) => void;
  };
  onSync: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

// ── Hierarchy item (left panel) ─────────────────────────

/**
 * Creates a compact hierarchy row for a layer — swatch, name, visibility,
 * drag handle. Clicking selects it (delegates to deps.onSelect).
 */
export function makeHierarchyItem(
  id: string,
  layerNum: number,
  deps: LayerCardDeps
): HTMLElement {
  const { renderer, onSync, onSelect, onRemove } = deps;
  const layer = renderer.getLayers().find((l) => l.id === id);
  if (!layer) throw new Error(`Layer ${id} not found`);
  let visible = layer.visible;

  const item = document.createElement("div");
  item.className = "hierarchy-item";
  item.dataset.id = id;

  // Build from the existing layer-header partial if available,
  // otherwise construct manually for reliability.
  const headerSrc = (Handlebars.partials as Record<string, string>)["layer/layer-header"];
  const headerHtml = Handlebars.compile(headerSrc)({
    layerNum,
    name: layer.name,
    swatchGradient: swatchGradient(layer.palette),
  });
  item.innerHTML = headerHtml;

  // Replace the outer .layer-header wrapper's class
  const headerEl = item.querySelector<HTMLElement>(".layer-header");
  if (headerEl) headerEl.className = "hierarchy-row";

  // Wire name input
  const nameInput = item.querySelector<HTMLInputElement>(".layer-name-input");
  if (nameInput) {
    nameInput.addEventListener("change", () => {
      renderer.updateLayer(id, { name: nameInput.value.trim() || `layer ${layerNum}` });
      onSync();
    });
    nameInput.addEventListener("click", (e) => e.stopPropagation());
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") nameInput.blur();
    });
  }

  // Wire visibility toggle
  const visBtn = item.querySelector<HTMLButtonElement>(".layer-vis");
  if (visBtn) {
    visBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      visible = !visible;
      visBtn.classList.toggle("active", visible);
      const currentOpacity = renderer.getLayers().find((l) => l.id === id)?.opacity ?? 1;
      renderer.updateLayer(id, { opacity: visible ? currentOpacity : 0 });
      item.classList.toggle("hierarchy-item-hidden", !visible);
    });
  }

  // Wire remove button
  const removeBtn = item.querySelector<HTMLButtonElement>(".layer-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renderer.removeLayer(id);
      item.remove();
      onRemove(id);
      onSync();
    });
  }

  // Click to select
  const row = item.querySelector<HTMLElement>(".hierarchy-row") ?? item;
  row.addEventListener("click", () => onSelect(id));

  // ── Drag reordering ──────────────────────────────────
  const dragHandle = item.querySelector<HTMLElement>(".layer-drag-handle");
  if (dragHandle) {
    dragHandle.addEventListener("mousedown", () => {
      item.draggable = true;
    });
    document.addEventListener("mouseup", () => {
      item.draggable = false;
    }, { capture: true });
  }

  item.addEventListener("dragstart", (e) => {
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    e.dataTransfer?.setData("text/plain", id);
    requestAnimationFrame(() => item.classList.add("dragging"));
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
    item.draggable = false;
    for (const c of document.querySelectorAll(".hierarchy-item")) {
      c.classList.remove("drag-over-top", "drag-over-bottom");
    }
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const rect = item.getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;
    for (const c of document.querySelectorAll(".hierarchy-item")) {
      c.classList.remove("drag-over-top", "drag-over-bottom");
    }
    item.classList.add(isTop ? "drag-over-top" : "drag-over-bottom");
  });

  item.addEventListener("dragleave", () => {
    item.classList.remove("drag-over-top", "drag-over-bottom");
  });

  item.addEventListener("drop", (e) => {
    e.preventDefault();
    const fromId = e.dataTransfer?.getData("text/plain");
    if (fromId === id) return;
    const { layerList } = deps;
    const fromItem = layerList.querySelector<HTMLElement>(`[data-id="${fromId}"]`);
    if (!fromItem) return;
    const rect = item.getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;
    if (isTop) layerList.insertBefore(fromItem, item);
    else layerList.insertBefore(fromItem, item.nextSibling);
    item.classList.remove("drag-over-top", "drag-over-bottom");
    const orderedIds = [...layerList.querySelectorAll<HTMLElement>(".hierarchy-item")]
      .map((c) => c.dataset.id ?? "")
      .filter(Boolean)
      .reverse();
    renderer.reorderLayers(orderedIds);
    onSync();
  });

  return item;
}

/**
 * Update the swatch on a hierarchy item to reflect current palette.
 */
export function updateHierarchySwatch(layerList: HTMLElement, id: string, palette: NoiseLayer["palette"]) {
  const item = layerList.querySelector<HTMLElement>(`[data-id="${id}"]`);
  if (!item) return;
  const swatch = item.querySelector<HTMLElement>(".layer-swatch");
  if (swatch) swatch.style.background = swatchGradient(palette);
}

// ── Inspector panel (right panel) ───────────────────────

/**
 * Populate the inspector panel with all editable controls for a layer.
 * Returns nothing — it writes directly into `#inspectorContent`.
 */
export function populateInspector(
  id: string,
  deps: LayerCardDeps
): void {
  const { renderer, onSync, layerList } = deps;
  const container = document.getElementById("inspectorContent");
  if (!container) return;

  const layer = renderer.getLayers().find((l) => l.id === id);
  if (!layer) {
    container.innerHTML = '<div class="inspector-empty"><p>layer not found</p></div>';
    return;
  }

  const noiseTypes: NoiseType[] = ["simplex", "perlin", "worley", "fbm", "curl"];
  const blendModes: BlendMode[] = ["add", "multiply", "screen", "overlay"];
  const flowTypes: FlowType[] = ["linear", "radial", "spiral", "vortex", "turbulent"];

  function patch(p: Partial<NoiseLayer>) {
    renderer.updateLayer(id, p);
    // Update swatch in hierarchy
    const l = renderer.getLayers().find((x) => x.id === id);
    if (l) updateHierarchySwatch(layerList, id, l.palette);
    // Update palette preview in inspector
    if (l) {
      const preview = container?.querySelector<HTMLElement>(".palette-preview");
      if (preview) preview.style.background = swatchGradient(l.palette);
    }
  }

  // Clear and rebuild
  container.innerHTML = "";

  const body = document.createElement("div");
  body.className = "inspector-body";

  // Layer name at top of inspector
  const nameGroup = document.createElement("div");
  nameGroup.className = "group";
  nameGroup.innerHTML = `<div class="group-label">name</div>`;
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "layer-name-input inspector-name-input";
  nameInput.value = layer.name;
  nameInput.addEventListener("change", () => {
    patch({ name: nameInput.value.trim() || "layer" });
    // Also update the hierarchy item's name input
    const hierarchyItem = layerList.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const hierarchyName = hierarchyItem?.querySelector<HTMLInputElement>(".layer-name-input");
    if (hierarchyName) hierarchyName.value = nameInput.value;
    onSync();
  });
  nameGroup.appendChild(nameInput);
  body.appendChild(nameGroup);

  body.appendChild(
    makeChipGroup("noise type", noiseTypes, layer.noiseType, (v) => {
      patch({ noiseType: v as NoiseType });
      const og = body.querySelector<HTMLElement>(".octaves-group");
      if (og) og.classList.toggle("disabled", v !== "fbm");
      onSync();
    })
  );

  body.appendChild(
    makeChipGroup("blend mode", blendModes, layer.blendMode, (v) => {
      patch({ blendMode: v as BlendMode });
    })
  );

  const flowGroup = document.createElement("div");

  body.appendChild(
    makeToggleRow("animate", layer.animate, (v) => {
      patch({ animate: v });
      flowGroup.style.display = v ? "block" : "none";
    })
  );

  flowGroup.appendChild(
    makeChipGroup("flow type", flowTypes, layer.flowType, (v) => {
      patch({ flowType: v as FlowType });
      const dd = body.querySelector<HTMLElement>(".dir-group");
      if (dd) dd.classList.toggle("disabled", !["linear", "turbulent"].includes(v));
      onSync();
    })
  );
  flowGroup.style.display = layer.animate ? "block" : "none";
  body.appendChild(flowGroup);

  body.appendChild(makeSlider("scale", 0.1, 12, 0.1, layer.scale, 1, (v) => patch({ scale: v })));
  body.appendChild(makeSlider("speed", 0, 3, 0.01, layer.speed, 2, (v) => patch({ speed: v })));

  const dialGroup = document.createElement("div");
  dialGroup.className = "dir-group";
  if (!["linear", "turbulent"].includes(layer.flowType)) dialGroup.classList.add("disabled");
  dialGroup.appendChild(makeDial(layer.direction, (dir) => patch({ direction: dir })));
  body.appendChild(dialGroup);

  const octGroup = makeSlider("octaves", 1, 8, 1, layer.octaves, 0, (v) => patch({ octaves: v }));
  octGroup.classList.add("octaves-group");
  if (layer.noiseType !== "fbm") octGroup.classList.add("disabled");
  body.appendChild(octGroup);

  body.appendChild(
    makeSlider("contrast", 0.1, 4, 0.05, layer.contrast, 2, (v) => patch({ contrast: v }))
  );
  body.appendChild(
    makeSlider("brightness", -1, 1, 0.01, layer.brightness, 2, (v) => patch({ brightness: v }))
  );
  body.appendChild(makeSlider("domain warp", 0, 2, 0.01, layer.warp, 2, (v) => patch({ warp: v })));
  body.appendChild(
    makeSlider("curl flow", 0, 2, 0.01, layer.curlStrength, 2, (v) => patch({ curlStrength: v }))
  );

  body.appendChild(
    makeSlider("opacity", 0, 1, 0.01, layer.opacity, 2, (v) => {
      patch({ opacity: v });
    })
  );

  body.appendChild(
    makePaletteEditor(layer.palette, (pal) => {
      patch({ palette: pal });
      onSync();
    })
  );

  container.appendChild(body);
}
