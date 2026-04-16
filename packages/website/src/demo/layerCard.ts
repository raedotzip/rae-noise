import $ from "jquery";
import Handlebars from "handlebars";
import type { BlendMode, FlowType, NoiseLayerConfig, NoiseType, PaletteStop } from "rae-noise";
import { dispatch } from "../store";
import { swatchGradient } from "./color";
import { makeChipGroup, makeDial, makePaletteEditor, makeSlider, makeToggleRow } from "./widgets";

// ── Hierarchy item (left panel) ─────────────────────────────────────────────

/**
 * Create a compact hierarchy row for a layer.
 *
 * All mutations go through dispatch() — this element never calls the
 * renderer directly. It reads the layer's initial values from the
 * state snapshot passed in and stays in sync via the store subscriber
 * in demo/index.ts.
 */
export function makeHierarchyItem(layer: NoiseLayerConfig, layerListEl: HTMLElement): HTMLElement {
  const { id } = layer;
  const $item = $('<div class="hierarchy-item"></div>');
  $item.attr("data-id", id);

  const headerSrc = (Handlebars.partials as Record<string, string>)["layer/layer-header"];
  // Extract the numeric suffix from the default name ("layer 3" → 3),
  // or fall back to the last 3 chars of the id for imported layers with custom names.
  const layerNum = layer.name.match(/\d+$/)?.[0] ?? id.slice(-3);
  const headerHtml = Handlebars.compile(headerSrc)({
    layerNum,
    name: layer.name,
    swatchGradient: swatchGradient(layer.palette),
  });
  $item.html(headerHtml);
  $item.find(".layer-header").removeClass("layer-header").addClass("hierarchy-row");

  // Name
  const $nameInput = $item.find<HTMLInputElement>(".layer-name-input");
  $nameInput.on("change", function (this: HTMLInputElement) {
    dispatch({ type: "LAYER_UPDATE", payload: { id, patch: { name: $(this).val() as string || layer.name } } });
  });
  $nameInput.on("click", (e) => e.stopPropagation());
  $nameInput.on("keydown", function (this: HTMLInputElement, e: JQuery.KeyDownEvent) {
    if (e.key === "Enter") $(this).trigger("blur");
  });

  // Visibility
  const $visBtn = $item.find<HTMLButtonElement>(".layer-vis");
  $visBtn.toggleClass("active", layer.visible);
  $visBtn.on("click", function (this: HTMLButtonElement, e: JQuery.ClickEvent) {
    e.stopPropagation();
    const current = !$(this).hasClass("active");
    dispatch({ type: "LAYER_UPDATE", payload: { id, patch: { visible: current } } });
  });

  // Remove
  const $removeBtn = $item.find<HTMLButtonElement>(".layer-remove");
  $removeBtn.on("click", (e) => {
    e.stopPropagation();
    dispatch({ type: "LAYER_REMOVE", payload: { id } });
  });

  // Select on row click
  const $row = $item.find(".hierarchy-row").length ? $item.find(".hierarchy-row") : $item;
  $row.on("click", () => dispatch({ type: "LAYER_SELECT", payload: { id } }));

  // ── Drag reordering ───────────────────────────────────────────────────────
  const itemEl = $item[0];

  $item.find(".layer-drag-handle").on("mousedown", () => { itemEl.draggable = true; });
  $(document).on("mouseup.drag", () => { itemEl.draggable = false; });

  $item.on("dragstart", (e) => {
    const dt = e.originalEvent?.dataTransfer;
    if (dt) dt.effectAllowed = "move";
    dt?.setData("text/plain", id);
    requestAnimationFrame(() => $item.addClass("dragging"));
  });

  $item.on("dragend", () => {
    $item.removeClass("dragging");
    itemEl.draggable = false;
    $(".hierarchy-item").removeClass("drag-over-top drag-over-bottom");
  });

  $item.on("dragover", (e) => {
    e.preventDefault();
    const dt = e.originalEvent?.dataTransfer;
    if (dt) dt.dropEffect = "move";
    const rect = itemEl.getBoundingClientRect();
    const clientY = e.originalEvent?.clientY ?? 0;
    const isTop = clientY < rect.top + rect.height / 2;
    $(".hierarchy-item").removeClass("drag-over-top drag-over-bottom");
    $item.addClass(isTop ? "drag-over-top" : "drag-over-bottom");
  });

  $item.on("dragleave", () => $item.removeClass("drag-over-top drag-over-bottom"));

  $item.on("drop", (e) => {
    e.preventDefault();
    const dt = e.originalEvent?.dataTransfer;
    const fromId = dt?.getData("text/plain");
    if (!fromId || fromId === id) return;

    const $list = $(layerListEl);
    const $from = $list.find(`[data-id="${fromId}"]`);
    if (!$from.length) return;

    const rect = itemEl.getBoundingClientRect();
    const clientY = e.originalEvent?.clientY ?? 0;
    if (clientY < rect.top + rect.height / 2) {
      $from.insertBefore($item);
    } else {
      $from.insertAfter($item);
    }
    $item.removeClass("drag-over-top drag-over-bottom");

    const orderedIds = $list
      .find(".hierarchy-item")
      .toArray()
      .map((el) => $(el).attr("data-id") ?? "")
      .filter(Boolean)
      .reverse();

    dispatch({ type: "LAYER_REORDER", payload: { ids: orderedIds } });
  });

  return itemEl;
}

/**
 * Update the gradient swatch on a hierarchy item when the palette changes.
 */
export function updateHierarchySwatch(
  layerListEl: HTMLElement,
  id: string,
  palette: PaletteStop[]
): void {
  $(layerListEl).find(`[data-id="${id}"] .layer-swatch`).css("background", swatchGradient(palette));
}

// ── Inspector panel (right panel) ────────────────────────────────────────────

/**
 * Populate the inspector panel with editable controls for `layer`.
 *
 * Every control fires dispatch() on change. The inspector is re-rendered
 * wholesale by demo/index.ts whenever the active layer's state changes.
 */
export function populateInspector(layer: NoiseLayerConfig): void {
  const $container = $("#inspectorContent");
  if (!$container.length) return;

  const { id } = layer;

  const noiseTypes: NoiseType[] = ["simplex", "perlin", "worley", "fbm", "curl"];
  const blendModes: BlendMode[] = ["add", "multiply", "screen", "overlay"];
  const flowTypes: FlowType[] = ["linear", "radial", "spiral", "vortex", "turbulent"];

  /** Dispatch a patch for this layer. */
  function patch(p: Partial<NoiseLayerConfig>): void {
    dispatch({ type: "LAYER_UPDATE", payload: { id, patch: p } });
  }

  $container.empty();
  const $body = $('<div class="inspector-body"></div>');

  // Name
  const $nameGroup = $('<div class="group"><div class="group-label">name</div></div>');
  const $nameInput = $('<input type="text" class="layer-name-input inspector-name-input" />') as JQuery<HTMLInputElement>;
  $nameInput.val(layer.name);
  $nameInput.on("change", function (this: HTMLInputElement) {
    patch({ name: ($(this).val() as string).trim() || "layer" });
  });
  $nameGroup.append($nameInput);
  $body.append($nameGroup);

  $body.append(
    makeChipGroup("noise type", noiseTypes, layer.noiseType, (v) => {
      patch({ noiseType: v as NoiseType });
      $body.find(".octaves-group").toggleClass("disabled", v !== "fbm");
    })
  );

  $body.append(
    makeChipGroup("blend mode", blendModes, layer.blendMode, (v) => patch({ blendMode: v as BlendMode }))
  );

  const $flowGroup = $("<div></div>");

  $body.append(
    makeToggleRow("animate", layer.animate, (v) => {
      patch({ animate: v });
      $flowGroup.css("display", v ? "block" : "none");
    })
  );

  $flowGroup.append(
    makeChipGroup("flow type", flowTypes, layer.flowType, (v) => {
      patch({ flowType: v as FlowType });
      $body.find(".dir-group").toggleClass("disabled", !["linear", "turbulent"].includes(v));
    })
  );
  $flowGroup.css("display", layer.animate ? "block" : "none");
  $body.append($flowGroup);

  $body.append(makeSlider("scale", 0.1, 12, 0.1, layer.scale, 1, (v) => patch({ scale: v })));
  $body.append(makeSlider("speed", 0, 3, 0.01, layer.speed, 2, (v) => patch({ speed: v })));

  const $dialGroup = $('<div class="dir-group"></div>');
  if (!["linear", "turbulent"].includes(layer.flowType)) $dialGroup.addClass("disabled");
  $dialGroup.append(makeDial(layer.direction, (dir) => patch({ direction: dir })));
  $body.append($dialGroup);

  const octGroup = makeSlider("octaves", 1, 8, 1, layer.octaves, 0, (v) => patch({ octaves: v }));
  const $octGroup = $(octGroup);
  $octGroup.addClass("octaves-group");
  if (layer.noiseType !== "fbm") $octGroup.addClass("disabled");
  $body.append($octGroup);

  $body.append(makeSlider("contrast", 0.1, 4, 0.05, layer.contrast, 2, (v) => patch({ contrast: v })));
  $body.append(makeSlider("brightness", -1, 1, 0.01, layer.brightness, 2, (v) => patch({ brightness: v })));
  $body.append(makeSlider("domain warp", 0, 2, 0.01, layer.warp, 2, (v) => patch({ warp: v })));
  $body.append(makeSlider("curl flow", 0, 2, 0.01, layer.curlStrength, 2, (v) => patch({ curlStrength: v })));
  $body.append(makeSlider("opacity", 0, 1, 0.01, layer.opacity, 2, (v) => patch({ opacity: v })));

  $body.append(
    makePaletteEditor(layer.palette, (pal) => patch({ palette: pal }))
  );

  $container.append($body);
}
