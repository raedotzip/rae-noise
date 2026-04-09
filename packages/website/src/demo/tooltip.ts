import TOOLTIPS from "../data/tooltips.json";

export { TOOLTIPS };

// Helper to get elements safely after Handlebars renders
const getElements = () => ({
  container: document.getElementById("raenoise-app"),
  tooltip: document.getElementById("tooltip"),
  title: document.getElementById("tooltipTitle"),
  body: document.getElementById("tooltipBody"),
});

let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

function positionTooltip(anchor: HTMLElement) {
  const { container, tooltip } = getElements();
  if (!container || !tooltip) return;

  const rect = anchor.getBoundingClientRect();
  const contRect = container.getBoundingClientRect();

  const tipW = 220;
  const margin = 8;

  // Calculate position RELATIVE to the container (the sandbox)
  let left = rect.right - contRect.left + margin;
  let top = rect.top - contRect.top;

  // Flip to left side if hitting the right edge of the container
  if (left + tipW > contRect.width - margin) {
    left = rect.left - contRect.left - tipW - margin;
  }

  // Constrain Y within the container height
  const tipH = tooltip.offsetHeight || 120;
  top = Math.min(top, contRect.height - tipH - margin);
  top = Math.max(top, margin);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function showTooltip(btn: HTMLElement, key: string) {
  const { tooltip, title, body } = getElements();
  const def = (TOOLTIPS as Record<string, { title: string; body: string }>)[key];

  if (!def || !tooltip || !title || !body) return;

  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }

  title.textContent = def.title;
  body.innerHTML = def.body.replace(/\n/g, "<br>");

  tooltip.classList.add("visible");
  positionTooltip(btn);
}

export function hideTooltip() {
  const { tooltip } = getElements();
  if (!tooltip) return;

  tooltipHideTimer = setTimeout(() => {
    tooltip.classList.remove("visible");
  }, 120);
}

// Global click to close
document.addEventListener("click", (e) => {
  const { tooltip } = getElements();
  if (tooltip && !(e.target as HTMLElement).closest(".info-btn")) {
    tooltip.classList.remove("visible");
  }
});

/**
 * Creates an info button.
 * Note: If using Handlebars templates for the button,
 * you can call showTooltip(this, 'key') in your event delegation instead.
 */
export function makeInfoBtn(key: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "info-btn";
  btn.textContent = "i";
  btn.title = key;

  btn.addEventListener("click", (e) => {
    const { tooltip, title } = getElements();
    e.stopPropagation();

    const isOpen =
      tooltip?.classList.contains("visible") &&
      title?.textContent ===
        (TOOLTIPS as Record<string, { title: string; body: string }>)[key]?.title;

    if (isOpen) {
      hideTooltip();
    } else {
      showTooltip(btn, key);
    }
  });

  return btn;
}
