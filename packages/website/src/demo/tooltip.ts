import $ from "jquery";
import TOOLTIPS from "../data/tooltips.json";

export { TOOLTIPS };

/** Tooltip definition loaded from the JSON data file. */
interface TooltipDef {
  title: string;
  body: string;
}

/** Typed reference to the tooltips dictionary. */
const tooltipData: Record<string, TooltipDef> = TOOLTIPS as Record<string, TooltipDef>;

/** Cached jQuery handles for tooltip DOM elements — resolved lazily after Handlebars renders. */
interface TooltipElements {
  $container: JQuery<HTMLElement>;
  $tooltip: JQuery<HTMLElement>;
  $title: JQuery<HTMLElement>;
  $body: JQuery<HTMLElement>;
}

/** Retrieve the tooltip-related elements from the DOM (lazily, since they appear after render). */
function getElements(): TooltipElements {
  return {
    $container: $("#raenoise-app"),
    $tooltip: $("#tooltip"),
    $title: $("#tooltipTitle"),
    $body: $("#tooltipBody"),
  };
}

let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Position the tooltip panel adjacent to the given anchor element,
 * flipping horizontally if it would overflow the container.
 */
function positionTooltip(anchor: HTMLElement): void {
  const { $container, $tooltip } = getElements();
  if (!$container.length || !$tooltip.length) return;

  const rect: DOMRect = anchor.getBoundingClientRect();
  const contRect: DOMRect = $container[0].getBoundingClientRect();

  const tipW: number = 220;
  const margin: number = 8;

  // Calculate position RELATIVE to the container (the sandbox)
  let left: number = rect.right - contRect.left + margin;
  let top: number = rect.top - contRect.top;

  // Flip to left side if hitting the right edge of the container
  if (left + tipW > contRect.width - margin) {
    left = rect.left - contRect.left - tipW - margin;
  }

  // Constrain Y within the container height
  const tipH: number = $tooltip[0].offsetHeight || 120;
  top = Math.min(top, contRect.height - tipH - margin);
  top = Math.max(top, margin);

  $tooltip.css({ left: `${left}px`, top: `${top}px` });
}

/**
 * Show the tooltip for the given key, anchored to `btn`.
 * Cancels any pending hide timer.
 */
export function showTooltip(btn: HTMLElement, key: string): void {
  const { $tooltip, $title, $body } = getElements();
  const def: TooltipDef | undefined = tooltipData[key];

  if (!def || !$tooltip.length || !$title.length || !$body.length) return;

  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }

  $title.text(def.title);
  $body.html(def.body.replace(/\n/g, "<br>"));

  $tooltip.addClass("visible");
  positionTooltip(btn);
}

/**
 * Hide the tooltip after a short delay (allows moving cursor into the tooltip).
 */
export function hideTooltip(): void {
  const { $tooltip } = getElements();
  if (!$tooltip.length) return;

  tooltipHideTimer = setTimeout((): void => {
    $tooltip.removeClass("visible");
  }, 120);
}

// Global click to close — dismiss tooltip when clicking outside an info button
$(document).on("click", (e: JQuery.ClickEvent): void => {
  const { $tooltip } = getElements();
  if ($tooltip.length && !$(e.target as HTMLElement).closest(".info-btn").length) {
    $tooltip.removeClass("visible");
  }
});

/**
 * Creates an info button (`<button class="info-btn">`) with click-to-toggle tooltip behaviour.
 */
export function makeInfoBtn(key: string): HTMLButtonElement {
  const $btn: JQuery<HTMLButtonElement> = $('<button class="info-btn">i</button>') as JQuery<HTMLButtonElement>;
  $btn.attr("title", key);

  $btn.on("click", function (this: HTMLButtonElement, e: JQuery.ClickEvent): void {
    const { $tooltip, $title } = getElements();
    e.stopPropagation();

    const isOpen: boolean =
      $tooltip.hasClass("visible") &&
      $title.text() === tooltipData[key]?.title;

    if (isOpen) {
      hideTooltip();
    } else {
      showTooltip(this, key);
    }
  });

  return $btn[0];
}
