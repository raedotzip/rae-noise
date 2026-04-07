// ══════════════════════════════════════════════════════════
// TOOLTIP SYSTEM
// ══════════════════════════════════════════════════════════

interface TooltipDef {
  title: string;
  body:  string;
}

export const TOOLTIPS: Record<string, TooltipDef> = {
  'noise type': {
    title: 'Noise Type',
    body:
      'The algorithm used to generate the raw noise field.\n' +
      '<span class="opt">simplex</span> Smooth organic gradients. Fast and general-purpose.\n' +
      '<span class="opt">perlin</span> Classic lattice noise. Slightly blockier than simplex.\n' +
      '<span class="opt">worley</span> Cell / Voronoi noise. Creates cracked, bubbly or stone-like patterns.\n' +
      '<span class="opt">fbm</span> Fractal Brownian Motion — simplex layered at multiple frequencies. Rich, cloud-like detail. Controlled by Octaves.\n' +
      '<span class="opt">curl</span> Divergence-free vector field noise. Produces swirling smoke and fluid filaments.',
  },
  'blend mode': {
    title: 'Blend Mode',
    body:
      'How this layer composites onto the layers below it.\n' +
      '<span class="opt">add</span> Adds colour values. Brightens — good for glows and light effects.\n' +
      '<span class="opt">multiply</span> Multiplies values. Darkens — good for shadows and depth.\n' +
      '<span class="opt">screen</span> Inverse-multiply. Brightens while preserving highlights.\n' +
      '<span class="opt">overlay</span> Darkens darks and brightens lights. High-contrast punch.',
  },
  'flow type': {
    title: 'Flow Type',
    body:
      'Determines how the noise coordinate space moves over time.\n' +
      '<span class="opt">linear</span> Translates uniformly in the Direction vector.\n' +
      '<span class="opt">radial</span> Expands outward from the canvas centre — pulse or shockwave effect.\n' +
      '<span class="opt">spiral</span> Rotates around the centre at a constant angular speed.\n' +
      '<span class="opt">vortex</span> Rotates with 1/distance falloff — the centre spins far faster than the edges, like a drain.\n' +
      '<span class="opt">turbulent</span> Linear motion plus domain-warp jitter — organic, stormy movement.',
  },
  'animate': {
    title: 'Animate',
    body:
      'Toggles time-based movement for this layer. When off the noise is frozen in its initial state. Useful for static base layers or for baking in a particular frame.',
  },
  'scale': {
    title: 'Scale',
    body:
      'Zoom level of the noise field. Higher values zoom in, producing larger, chunkier features. Lower values zoom out, producing fine, high-frequency detail. Range 0.1 – 12.',
  },
  'speed': {
    title: 'Speed',
    body:
      'How fast the noise field moves through time (or rotates / expands, depending on Flow Type). At 0 the layer is frozen even if Animate is on. Range 0 – 3.',
  },
  'direction': {
    title: 'Direction',
    body:
      'The 2D unit vector that defines travel direction for Linear and Turbulent flow types. Drag the dial to point in any direction. Has no effect on Radial, Spiral or Vortex flows.',
  },
  'octaves': {
    title: 'Octaves (FBM only)',
    body:
      'Number of noise layers summed inside Fractional Brownian Motion. More octaves add finer, smaller-scale detail on top of the base shape, at a small GPU cost. Only active when Noise Type is fbm. Range 1 – 8.',
  },
  'contrast': {
    title: 'Contrast',
    body:
      'Scales the noise value around the midpoint before palette lookup. Values above 1 push the field toward black and white extremes, sharpening edges. Values below 1 collapse everything toward grey, softening the pattern. Range 0.1 – 4.',
  },
  'brightness': {
    title: 'Brightness',
    body:
      'Shifts the noise value up or down uniformly before palette lookup. Positive values pull the whole layer toward the bright end of the palette; negative values pull toward the dark end. Range −1 – 1.',
  },
  'domain warp': {
    title: 'Domain Warp',
    body:
      'Displaces the sample coordinate using a second simplex noise field before reading the main noise. Creates recursive self-similar folding — low values give gentle waviness, high values produce heavily knotted, marble-like distortion. Range 0 – 2.',
  },
  'curl flow': {
    title: 'Curl Flow',
    body:
      'Advects the sample point along a curl (divergence-free) vector field before sampling the noise. Unlike domain warp, curl flow preserves volume — produces smooth, swirling tendrils and never creates sources or sinks. Works on any noise type. Range 0 – 2.',
  },
  'opacity': {
    title: 'Opacity',
    body:
      'Master opacity for this layer\'s contribution to the composite. At 1 the layer blends at full strength; at 0 it is invisible. Dragging below 0.05 toggles the visibility icon off. Range 0 – 1.',
  },
  'palette': {
    title: 'Palette',
    body:
      'Maps the 0 - 1 noise output to a colour gradient. Each colour stop is linearly interpolated. You can have 2 - 8 stops. Click a swatch to change its colour. The + stop button appends a new stop. Stops can be removed once you have more than 2.',
  },
};

const tooltipEl    = document.getElementById('tooltip')!;
const tooltipTitle = document.getElementById('tooltipTitle')!;
const tooltipBody  = document.getElementById('tooltipBody')!;

let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

function positionTooltip(anchor: HTMLElement) {
  const rect   = anchor.getBoundingClientRect();
  const tipW   = 220;
  const margin = 8;

  let left = rect.right + margin;
  let top  = rect.top;

  if (left + tipW > window.innerWidth - margin) {
    left = rect.left - tipW - margin;
  }

  const tipH = tooltipEl.offsetHeight || 120;
  top = Math.min(top, window.innerHeight - tipH - margin);
  top = Math.max(top, margin);

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top  = `${top}px`;
}

export function showTooltip(btn: HTMLElement, key: string) {
  const def = TOOLTIPS[key];
  if (!def) return;

  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }

  tooltipTitle.textContent = def.title;
  tooltipBody.innerHTML    = def.body.replace(/\n/g, '<br>');

  tooltipEl.classList.add('visible');
  positionTooltip(btn);
}

export function hideTooltip() {
  tooltipHideTimer = setTimeout(() => {
    tooltipEl.classList.remove('visible');
  }, 120);
}

// Dismiss on outside click
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.info-btn')) {
    tooltipEl.classList.remove('visible');
  }
});

export function makeInfoBtn(key: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className   = 'info-btn';
  btn.textContent = 'i';
  btn.title       = key;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = tooltipEl.classList.contains('visible') &&
                   tooltipTitle.textContent === TOOLTIPS[key]?.title;
    if (isOpen) {
      hideTooltip();
    } else {
      showTooltip(btn, key);
    }
  });

  btn.addEventListener('mouseenter', () => {
    if (tooltipEl.classList.contains('visible')) positionTooltip(btn);
  });

  return btn;
}