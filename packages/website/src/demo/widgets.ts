import $ from "jquery";
import Handlebars from "handlebars";
import type { PaletteStop } from "rae-noise";
import { rgbToHex, swatchGradient } from "./color";
import { makeInfoBtn } from "./tooltip";

// ── Handlebars eq helper (needed by chip-group active check) ──
Handlebars.registerHelper("eq", (a: unknown, b: unknown): boolean => a === b);

// ── Lazy partial compiler cache ───────────────────────────────
/**
 * Compile a registered Handlebars partial by name.
 * Throws if the partial has not been registered.
 */
function partial(name: string): Handlebars.TemplateDelegate {
  const src: string | undefined = (Handlebars.partials as Record<string, string>)[name];
  if (typeof src !== "string") throw new Error(`Partial not found: ${name}`);
  return Handlebars.compile(src);
}

// ── Shared: wire info-btn events on an element ─────────────────
/**
 * Replace all static `.info-btn` elements within `$root` with fully-wired
 * tooltip buttons created by {@link makeInfoBtn}.
 */
function wireInfoBtns($root: JQuery<HTMLElement>): void {
  $root.find(".info-btn").each(function (this: HTMLElement): void {
    const key: string = (this as HTMLButtonElement).title;
    const wired: HTMLButtonElement = makeInfoBtn(key);
    $(this).replaceWith(wired);
  });
}

// ── chip group ────────────────────────────────────────────────
/**
 * Build a chip-group widget from a Handlebars partial.
 * Returns the root DOM element containing all chip buttons.
 */
export function makeChipGroup(
  label: string,
  options: string[],
  current: string,
  onChange: (v: string) => void
): HTMLElement {
  const html: string = partial("widgets/chip-group")({ label, options, current });
  const $g: JQuery<HTMLElement> = $(html).first();

  wireInfoBtns($g);

  $g.find(".chip").on("click", function (this: HTMLButtonElement): void {
    const $btn: JQuery<HTMLButtonElement> = $(this);
    $g.find(".chip").removeClass("active");
    $btn.addClass("active");
    onChange($btn.attr("data-value") ?? "");
  });

  return $g[0];
}

// ── toggle row ────────────────────────────────────────────────
/**
 * Build a toggle-row widget (label + checkbox).
 * Returns the root DOM element.
 */
export function makeToggleRow(
  label: string,
  initial: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const html: string = partial("widgets/toggle-row")({ label, checked: initial });
  const $g: JQuery<HTMLElement> = $(html).first();

  wireInfoBtns($g);

  $g.find("input").on("change", function (this: HTMLInputElement): void {
    onChange(this.checked);
  });

  return $g[0];
}

// ── slider ────────────────────────────────────────────────────
/**
 * Build a slider widget with range input, numeric display, and inline editing.
 * Returns the root DOM element.
 */
export function makeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  decimals: number,
  onChange: (v: number) => void
): HTMLElement {
  const html: string = partial("widgets/slider")({
    label,
    min,
    max,
    step,
    value: value.toFixed(decimals),
  });
  const $g: JQuery<HTMLElement> = $(html).first();

  wireInfoBtns($g);

  const $range: JQuery<HTMLInputElement> = $g.find<HTMLInputElement>('input[type="range"]');
  const $display: JQuery<HTMLElement> = $g.find(".value-display");
  const $input: JQuery<HTMLInputElement> = $g.find<HTMLInputElement>(".value-input");

  if (!$range.length || !$display.length || !$input.length) {
    throw new Error(`Missing slider elements for "${label}"`);
  }

  /**
   * Clamp and apply a numeric value — syncs the range slider,
   * display label, and input field, then fires the callback.
   */
  function applyValue(raw: number): void {
    const factor: number = 10 ** decimals;
    const v: number = Math.round(Math.min(max, Math.max(min, raw)) * factor) / factor;
    $display.text(v.toFixed(decimals));
    $input.val(v.toFixed(decimals));
    $range.val(String(v));
    onChange(v);
  }

  $range.on("input", function (this: HTMLInputElement): void {
    applyValue(Number.parseFloat(this.value));
  });

  $display.on("click", (e: JQuery.ClickEvent): void => {
    e.stopPropagation();
    $display.hide();
    $input.css("display", "inline-block").trigger("focus").trigger("select");
  });

  $input.on("blur", function (this: HTMLInputElement): void {
    const v: number = Number.parseFloat(this.value);
    if (!Number.isNaN(v)) applyValue(v);
    $input.hide();
    $display.css("display", "inline");
  });

  $input.on("keydown", function (this: HTMLInputElement, e: JQuery.KeyDownEvent): void {
    if (e.key === "Enter") {
      $(this).trigger("blur");
    } else if (e.key === "Escape") {
      $(this).val($display.text() ?? "");
      $input.hide();
      $display.css("display", "inline");
    }
  });

  $input.on("click", (e: JQuery.ClickEvent): void => e.stopPropagation());

  return $g[0];
}

// ── dial ──────────────────────────────────────────────────────
/**
 * Build a direction dial widget.
 * The dial is a circular handle that the user can drag to set a 2D direction vector.
 * Returns the root DOM element.
 */
export function makeDial(
  initial: [number, number],
  onChange: (dir: [number, number]) => void
): HTMLElement {
  let angle: number = Math.atan2(initial[1], initial[0]);

  const html: string = partial("widgets/dial")({
    dx: initial[0].toFixed(2),
    dy: initial[1].toFixed(2),
  });
  const $g: JQuery<HTMLElement> = $(html).first();

  wireInfoBtns($g);

  const $dial: JQuery<HTMLElement> = $g.find(".dial");
  const $needle: JQuery<HTMLElement> = $g.find(".dial-needle");
  const $dx: JQuery<HTMLElement> = $g.find('[data-dir="dx"]');
  const $dy: JQuery<HTMLElement> = $g.find('[data-dir="dy"]');

  if (!$dial.length || !$needle.length || !$dx.length || !$dy.length) {
    throw new Error("Missing dial elements");
  }

  /** Update the needle rotation and dx/dy labels for a given angle. */
  function setAngle(a: number): void {
    angle = a;
    $needle.css("transform", `translateY(-50%) rotate(${a}rad)`);
    const dx: number = Number.parseFloat(Math.cos(a).toFixed(2));
    const dy: number = Number.parseFloat(Math.sin(a).toFixed(2));
    $dx.text(dx.toFixed(2));
    $dy.text(dy.toFixed(2));
    onChange([dx, dy]);
  }
  setAngle(angle);

  /** Calculate the angle from the dial centre to a pointer event. */
  function angleFromPointer(e: PointerEvent): number {
    const rect: DOMRect = $dial[0].getBoundingClientRect();
    return Math.atan2(
      e.clientY - (rect.top + rect.height / 2),
      e.clientX - (rect.left + rect.width / 2)
    );
  }

  let dragging: boolean = false;

  $dial.on("pointerdown", function (this: HTMLElement, e: JQuery.TriggeredEvent): void {
    dragging = true;
    const pe: PointerEvent = e.originalEvent as PointerEvent;
    this.setPointerCapture(pe.pointerId);
    setAngle(angleFromPointer(pe));
  });

  $dial.on("pointermove", (_e: JQuery.TriggeredEvent): void => {
    if (dragging) {
      const pe: PointerEvent = _e.originalEvent as PointerEvent;
      setAngle(angleFromPointer(pe));
    }
  });

  $dial.on("pointerup", (): void => {
    dragging = false;
  });

  return $g[0];
}

// ── palette editor ────────────────────────────────────────────
/**
 * Build a palette editor widget — a row of colour pickers with add/remove,
 * and a gradient preview strip. Re-renders itself when stops change.
 * Returns the root DOM element.
 */
export function makePaletteEditor(
  initial: PaletteStop[],
  onChange: (pal: PaletteStop[]) => void
): HTMLElement {
  const stops: PaletteStop[] = [...initial];

  /** Convert a hex colour string to an RGB [0-1] palette stop. */
  function hexToRgbLocal(hex: string): PaletteStop {
    const n: number = Number.parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /** Render (or re-render) the palette editor DOM. */
  function render(): HTMLElement {
    const html: string = partial("widgets/palette-editor")({
      stops: stops.map((s: PaletteStop): string => rgbToHex(s)),
      canRemove: stops.length > 2,
      maxReached: stops.length >= 8,
    });
    const $g: JQuery<HTMLElement> = $(html).first();

    wireInfoBtns($g);

    const $preview: JQuery<HTMLElement> = $g.find(".palette-preview");
    const $stopsRow: JQuery<HTMLElement> = $g.find(".palette-stops");
    const $addBtn: JQuery<HTMLButtonElement> = $g.find<HTMLButtonElement>(".palette-add");

    if (!$preview.length || !$stopsRow.length || !$addBtn.length) {
      throw new Error("Missing palette editor elements");
    }

    $preview.css("background", swatchGradient(stops));

    // Wire colour pickers
    $stopsRow.find('input[type="color"]').each(function (this: HTMLElement, i: number): void {
      $(this).on("input", function (this: HTMLElement): void {
        stops[i] = hexToRgbLocal((this as HTMLInputElement).value);
        $preview.css("background", swatchGradient(stops));
        onChange(stops);
      });
    });

    // Wire remove buttons
    $stopsRow.find(".palette-stop-remove").each(function (this: HTMLElement, i: number): void {
      $(this).on("click", (): void => {
        stops.splice(i, 1);
        const newEl: HTMLElement = render();
        $g.replaceWith(newEl);
        onChange(stops);
      });
    });

    // Wire add button
    $addBtn.on("click", (): void => {
      if (stops.length >= 8) return;
      const last: PaletteStop = stops[stops.length - 1];
      stops.push([
        Math.min(1, last[0] + 0.1 + Math.random() * 0.4),
        Math.min(1, last[1] + 0.1 + Math.random() * 0.4),
        Math.min(1, last[2] + 0.1 + Math.random() * 0.4),
      ]);
      const newEl: HTMLElement = render();
      $g.replaceWith(newEl);
      onChange(stops);
    });

    return $g[0];
  }

  return render();
}
