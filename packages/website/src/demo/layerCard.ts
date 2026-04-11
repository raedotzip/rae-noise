import $ from "jquery";
import Handlebars from "handlebars";
import type { BlendMode, FlowType, NoiseLayer, NoiseType } from "rae-noise";
import { swatchGradient } from "./color";
import { makeChipGroup, makeDial, makePaletteEditor, makeSlider, makeToggleRow } from "./widgets";

/** Dependencies shared between hierarchy items and the inspector panel. */
export interface LayerCardDeps {
  /** The raw DOM element for the layer list (hierarchy panel). */
  layerList: HTMLElement;
  /** Subset of the renderer API needed by layer cards. */
  renderer: {
    getLayers: () => NoiseLayer[];
    updateLayer: (id: string, patch: Partial<NoiseLayer>) => void;
    removeLayer: (id: string) => void;
    reorderLayers: (ids: string[]) => void;
  };
  /** Called after any mutation so the node graph stays in sync. */
  onSync: () => void;
  /** Called when a layer is selected in the hierarchy. */
  onSelect: (id: string) => void;
  /** Called when a layer is removed from the hierarchy. */
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
  const layer: NoiseLayer | undefined = renderer.getLayers().find((l: NoiseLayer) => l.id === id);
  if (!layer) throw new Error(`Layer ${id} not found`);
  let visible: boolean = layer.visible;

  const $item: JQuery<HTMLElement> = $('<div class="hierarchy-item"></div>');
  $item.attr("data-id", id);

  // Build from the existing layer-header partial
  const headerSrc: string = (Handlebars.partials as Record<string, string>)["layer/layer-header"];
  const headerHtml: string = Handlebars.compile(headerSrc)({
    layerNum,
    name: layer.name,
    swatchGradient: swatchGradient(layer.palette),
  });
  $item.html(headerHtml);

  // Replace the outer .layer-header wrapper's class
  $item.find(".layer-header").removeClass("layer-header").addClass("hierarchy-row");

  // Wire name input
  const $nameInput: JQuery<HTMLInputElement> = $item.find<HTMLInputElement>(".layer-name-input");
  $nameInput.on("change", function (this: HTMLInputElement): void {
    renderer.updateLayer(id, { name: $(this).val() as string || `layer ${layerNum}` });
    onSync();
  });
  $nameInput.on("click", (e: JQuery.ClickEvent): void => {
    e.stopPropagation();
  });
  $nameInput.on("keydown", function (this: HTMLInputElement, e: JQuery.KeyDownEvent): void {
    if (e.key === "Enter") $(this).trigger("blur");
  });

  // Wire visibility toggle
  const $visBtn: JQuery<HTMLButtonElement> = $item.find<HTMLButtonElement>(".layer-vis");
  $visBtn.on("click", function (this: HTMLButtonElement, e: JQuery.ClickEvent): void {
    e.stopPropagation();
    visible = !visible;
    $(this).toggleClass("active", visible);
    const currentOpacity: number = renderer.getLayers().find((l: NoiseLayer) => l.id === id)?.opacity ?? 1;
    renderer.updateLayer(id, { opacity: visible ? currentOpacity : 0 });
    $item.toggleClass("hierarchy-item-hidden", !visible);
  });

  // Wire remove button
  const $removeBtn: JQuery<HTMLButtonElement> = $item.find<HTMLButtonElement>(".layer-remove");
  $removeBtn.on("click", (e: JQuery.ClickEvent): void => {
    e.stopPropagation();
    renderer.removeLayer(id);
    $item.remove();
    onRemove(id);
    onSync();
  });

  // Click to select
  const $row: JQuery<HTMLElement> = $item.find(".hierarchy-row").length
    ? $item.find(".hierarchy-row")
    : $item;
  $row.on("click", (): void => onSelect(id));

  // ── Drag reordering ──────────────────────────────────
  const itemEl: HTMLElement = $item[0];

  $item.find(".layer-drag-handle").on("mousedown", (): void => {
    itemEl.draggable = true;
  });
  $(document).on("mouseup.drag", (): void => {
    itemEl.draggable = false;
  });

  $item.on("dragstart", (e: JQuery.DragStartEvent): void => {
    const dt: DataTransfer | undefined = e.originalEvent?.dataTransfer ?? undefined;
    if (dt) dt.effectAllowed = "move";
    dt?.setData("text/plain", id);
    requestAnimationFrame((): void => {
      $item.addClass("dragging");
    });
  });

  $item.on("dragend", (): void => {
    $item.removeClass("dragging");
    itemEl.draggable = false;
    $(".hierarchy-item").removeClass("drag-over-top drag-over-bottom");
  });

  $item.on("dragover", (e: JQuery.DragOverEvent): void => {
    e.preventDefault();
    const dt: DataTransfer | undefined = e.originalEvent?.dataTransfer ?? undefined;
    if (dt) dt.dropEffect = "move";
    const rect: DOMRect = itemEl.getBoundingClientRect();
    const clientY: number = e.originalEvent?.clientY ?? 0;
    const isTop: boolean = clientY < rect.top + rect.height / 2;
    $(".hierarchy-item").removeClass("drag-over-top drag-over-bottom");
    $item.addClass(isTop ? "drag-over-top" : "drag-over-bottom");
  });

  $item.on("dragleave", (): void => {
    $item.removeClass("drag-over-top drag-over-bottom");
  });

  $item.on("drop", (e: JQuery.DropEvent): void => {
    e.preventDefault();
    const dt: DataTransfer | undefined = e.originalEvent?.dataTransfer ?? undefined;
    const fromId: string | undefined = dt?.getData("text/plain");
    if (fromId === id) return;

    const $layerList: JQuery<HTMLElement> = $(deps.layerList);
    const $fromItem: JQuery<HTMLElement> = $layerList.find(`[data-id="${fromId}"]`);
    if (!$fromItem.length) return;

    const rect: DOMRect = itemEl.getBoundingClientRect();
    const clientY: number = e.originalEvent?.clientY ?? 0;
    const isTop: boolean = clientY < rect.top + rect.height / 2;

    if (isTop) {
      $fromItem.insertBefore($item);
    } else {
      $fromItem.insertAfter($item);
    }
    $item.removeClass("drag-over-top drag-over-bottom");

    const orderedIds: string[] = $layerList
      .find(".hierarchy-item")
      .toArray()
      .map((el: HTMLElement): string => $(el).attr("data-id") ?? "")
      .filter(Boolean)
      .reverse();
    renderer.reorderLayers(orderedIds);
    onSync();
  });

  return itemEl;
}

/**
 * Update the swatch on a hierarchy item to reflect current palette.
 */
export function updateHierarchySwatch(
  layerList: HTMLElement,
  id: string,
  palette: NoiseLayer["palette"]
): void {
  const $item: JQuery<HTMLElement> = $(layerList).find(`[data-id="${id}"]`);
  $item.find(".layer-swatch").css("background", swatchGradient(palette));
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
  const $container: JQuery<HTMLElement> = $("#inspectorContent");
  if (!$container.length) return;

  const layer: NoiseLayer | undefined = renderer.getLayers().find((l: NoiseLayer) => l.id === id);
  if (!layer) {
    $container.html('<div class="inspector-empty"><p>layer not found</p></div>');
    return;
  }

  const noiseTypes: NoiseType[] = ["simplex", "perlin", "worley", "fbm", "curl"];
  const blendModes: BlendMode[] = ["add", "multiply", "screen", "overlay"];
  const flowTypes: FlowType[] = ["linear", "radial", "spiral", "vortex", "turbulent"];

  /** Apply a partial update to the layer and refresh visual indicators. */
  function patch(p: Partial<NoiseLayer>): void {
    renderer.updateLayer(id, p);
    const l: NoiseLayer | undefined = renderer.getLayers().find((x: NoiseLayer) => x.id === id);
    if (l) {
      updateHierarchySwatch(layerList, id, l.palette);
      $container.find(".palette-preview").css("background", swatchGradient(l.palette));
    }
  }

  // Clear and rebuild
  $container.empty();

  const $body: JQuery<HTMLElement> = $('<div class="inspector-body"></div>');

  // Layer name at top of inspector
  const $nameGroup: JQuery<HTMLElement> = $('<div class="group"><div class="group-label">name</div></div>');
  const $nameInput: JQuery<HTMLInputElement> = $(
    '<input type="text" class="layer-name-input inspector-name-input" />'
  ) as JQuery<HTMLInputElement>;
  $nameInput.val(layer.name);
  $nameInput.on("change", function (this: HTMLInputElement): void {
    const newName: string = ($(this).val() as string).trim() || "layer";
    patch({ name: newName });
    // Also update the hierarchy item's name input
    $(layerList)
      .find(`[data-id="${id}"] .layer-name-input`)
      .val(newName);
    onSync();
  });
  $nameGroup.append($nameInput);
  $body.append($nameGroup);

  $body.append(
    makeChipGroup("noise type", noiseTypes, layer.noiseType, (v: string): void => {
      patch({ noiseType: v as NoiseType });
      $body.find(".octaves-group").toggleClass("disabled", v !== "fbm");
      onSync();
    })
  );

  $body.append(
    makeChipGroup("blend mode", blendModes, layer.blendMode, (v: string): void => {
      patch({ blendMode: v as BlendMode });
    })
  );

  const flowGroup: HTMLElement = document.createElement("div");
  const $flowGroup: JQuery<HTMLElement> = $(flowGroup);

  $body.append(
    makeToggleRow("animate", layer.animate, (v: boolean): void => {
      patch({ animate: v });
      $flowGroup.css("display", v ? "block" : "none");
    })
  );

  $flowGroup.append(
    makeChipGroup("flow type", flowTypes, layer.flowType, (v: string): void => {
      patch({ flowType: v as FlowType });
      $body.find(".dir-group").toggleClass("disabled", !["linear", "turbulent"].includes(v));
      onSync();
    })
  );
  $flowGroup.css("display", layer.animate ? "block" : "none");
  $body.append($flowGroup);

  $body.append(makeSlider("scale", 0.1, 12, 0.1, layer.scale, 1, (v: number): void => patch({ scale: v })));
  $body.append(makeSlider("speed", 0, 3, 0.01, layer.speed, 2, (v: number): void => patch({ speed: v })));

  const $dialGroup: JQuery<HTMLElement> = $('<div class="dir-group"></div>');
  if (!["linear", "turbulent"].includes(layer.flowType)) $dialGroup.addClass("disabled");
  $dialGroup.append(makeDial(layer.direction, (dir: [number, number]): void => patch({ direction: dir })));
  $body.append($dialGroup);

  const octGroup: HTMLElement = makeSlider("octaves", 1, 8, 1, layer.octaves, 0, (v: number): void => patch({ octaves: v }));
  const $octGroup: JQuery<HTMLElement> = $(octGroup);
  $octGroup.addClass("octaves-group");
  if (layer.noiseType !== "fbm") $octGroup.addClass("disabled");
  $body.append($octGroup);

  $body.append(makeSlider("contrast", 0.1, 4, 0.05, layer.contrast, 2, (v: number): void => patch({ contrast: v })));
  $body.append(makeSlider("brightness", -1, 1, 0.01, layer.brightness, 2, (v: number): void => patch({ brightness: v })));
  $body.append(makeSlider("domain warp", 0, 2, 0.01, layer.warp, 2, (v: number): void => patch({ warp: v })));
  $body.append(makeSlider("curl flow", 0, 2, 0.01, layer.curlStrength, 2, (v: number): void => patch({ curlStrength: v })));

  $body.append(
    makeSlider("opacity", 0, 1, 0.01, layer.opacity, 2, (v: number): void => {
      patch({ opacity: v });
    })
  );

  $body.append(
    makePaletteEditor(layer.palette, (pal: NoiseLayer["palette"]): void => {
      patch({ palette: pal });
      onSync();
    })
  );

  $container.append($body);
}
