import { createRenderer, defaultLayer } from '../src/index';
import type { NoiseLayer, PaletteStop, NoiseType, BlendMode, FlowType } from '../src/types';

// ── Setup renderer ────────────────────────────────────────
const canvas   = document.getElementById('glCanvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

const fpsEl     = document.getElementById('fps')!;
const layerList = document.getElementById('layerList')!;

renderer.onFps = (fps: number) => { fpsEl.textContent = `${fps} fps`; };

// ── Colour helpers ────────────────────────────────────────
function hexToRgb(hex: string): PaletteStop {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgbToHex([r, g, b]: PaletteStop): string {
  const c = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function swatchGradient(palette: PaletteStop[]): string {
  if (palette.length === 1) {
    const [r, g, b] = palette[0];
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  }
  const stops = palette.map((s, i) => {
    const pct = (i / (palette.length - 1)) * 100;
    return `rgb(${s.map(x => Math.round(x * 255)).join(',')}) ${pct}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// ══════════════════════════════════════════════════════════
// TOOLTIP SYSTEM
// ══════════════════════════════════════════════════════════

const tooltipEl    = document.getElementById('tooltip')!;
const tooltipTitle = document.getElementById('tooltipTitle')!;
const tooltipBody  = document.getElementById('tooltipBody')!;

interface TooltipDef {
  title: string;
  body:  string;
}

const TOOLTIPS: Record<string, TooltipDef> = {
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
      'Maps the 0 – 1 noise output to a colour gradient. Each colour stop is linearly interpolated. You can have 2 – 8 stops. Click a swatch to change its colour. The + stop button appends a new stop. Stops can be removed once you have more than 2.',
  },
};

let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

function showTooltip(btn: HTMLElement, key: string) {
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

function positionTooltip(anchor: HTMLElement) {
  const rect   = anchor.getBoundingClientRect();
  const tipW   = 220;
  const margin = 8;

  let left = rect.right + margin;
  let top  = rect.top;

  // Flip left if it would overflow
  if (left + tipW > window.innerWidth - margin) {
    left = rect.left - tipW - margin;
  }

  // Clamp vertically
  const tipH = tooltipEl.offsetHeight || 120;
  top = Math.min(top, window.innerHeight - tipH - margin);
  top = Math.max(top, margin);

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top  = `${top}px`;
}

function hideTooltip() {
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

function makeInfoBtn(key: string): HTMLButtonElement {
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

// ══════════════════════════════════════════════════════════
// WIDGET FACTORIES
// ══════════════════════════════════════════════════════════

function makeChipGroup(
  label: string,
  options: string[],
  current: string,
  onChange: (v: string) => void
): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';

  const labelEl = document.createElement('div');
  labelEl.className = 'group-label';
  labelEl.textContent = label;
  labelEl.appendChild(makeInfoBtn(label));

  const row = document.createElement('div');
  row.className = 'chip-group';

  g.append(labelEl, row);

  options.forEach(o => {
    const btn = document.createElement('button');
    btn.className   = `chip${o === current ? ' active' : ''}`;
    btn.dataset.value = o;
    btn.textContent = o;
    btn.addEventListener('click', () => {
      row.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(o);
    });
    row.appendChild(btn);
  });

  return g;
}

function makeToggleRow(
  label: string,
  initial: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';

  const labelEl = document.createElement('span');
  labelEl.className = 'group-label';
  labelEl.style.margin = '0';
  labelEl.textContent = label;
  labelEl.appendChild(makeInfoBtn(label));

  const toggle = document.createElement('label');
  toggle.className = 'toggle';
  toggle.innerHTML = `
    <input type="checkbox" ${initial ? 'checked' : ''} />
    <div class="toggle-track"><div class="toggle-thumb"></div></div>`;
  toggle.querySelector('input')!.addEventListener('change', (e) => {
    onChange((e.target as HTMLInputElement).checked);
  });

  const row = document.createElement('div');
  row.className = 'toggle-row';
  row.append(labelEl, toggle);
  g.appendChild(row);

  return g;
}

// ── makeSlider — clickable value display ──────────────────
function makeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  decimals: number,
  onChange: (v: number) => void
): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';

  // ── Label row ────────────────────────────────────────────
  const labelEl = document.createElement('div');
  labelEl.className = 'group-label';

  const labelLeft = document.createElement('span');
  labelLeft.style.cssText = 'display:flex;align-items:center;gap:4px;';
  labelLeft.textContent = label;
  labelLeft.appendChild(makeInfoBtn(label));

  // Span shown normally
  const valueDisplay = document.createElement('span');
  valueDisplay.className   = 'value-display';
  valueDisplay.textContent = value.toFixed(decimals);
  valueDisplay.title       = 'Click to enter a value';
  valueDisplay.style.cursor = 'text';

  // Number input shown on click
  const valueInput = document.createElement('input');
  valueInput.type      = 'number';
  valueInput.className = 'value-input';
  valueInput.min       = String(min);
  valueInput.max       = String(max);
  valueInput.step      = String(step);
  valueInput.value     = value.toFixed(decimals);
  valueInput.style.display = 'none';

  labelEl.append(labelLeft, valueDisplay, valueInput);

  // ── Range slider ─────────────────────────────────────────
  const rangeInput = document.createElement('input');
  rangeInput.type      = 'range';
  rangeInput.className = 'slider';
  rangeInput.min       = String(min);
  rangeInput.max       = String(max);
  rangeInput.step      = String(step);
  rangeInput.value     = String(value);

  g.append(labelEl, rangeInput);

  // ── Shared update ─────────────────────────────────────────
  function applyValue(v: number) {
    // Clamp to slider bounds
    v = Math.min(max, Math.max(min, v));
    // Round to step precision to avoid floating-point drift
    const factor = Math.pow(10, decimals);
    v = Math.round(v * factor) / factor;

    valueDisplay.textContent = v.toFixed(decimals);
    valueInput.value         = v.toFixed(decimals);
    rangeInput.value         = String(v);
    onChange(v);
  }

  // Range drag
  rangeInput.addEventListener('input', () => {
    applyValue(parseFloat(rangeInput.value));
  });

  // Click the display span → switch to input
  valueDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    valueDisplay.style.display = 'none';
    valueInput.style.display   = 'inline-block';
    valueInput.focus();
    valueInput.select();
  });

  // Commit on blur
  valueInput.addEventListener('blur', () => {
    const v = parseFloat(valueInput.value);
    if (!isNaN(v)) applyValue(v);
    valueInput.style.display   = 'none';
    valueDisplay.style.display = 'inline';
  });

  // Commit on Enter, cancel on Escape
  valueInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      valueInput.blur();
    } else if (e.key === 'Escape') {
      valueInput.value         = valueDisplay.textContent!;
      valueInput.style.display = 'none';
      valueDisplay.style.display = 'inline';
    }
  });

  // Prevent panel collapse when clicking into the number field
  valueInput.addEventListener('click', e => e.stopPropagation());

  return g;
}

function makeDial(
  initial: [number, number],
  onChange: (dir: [number, number]) => void
): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';

  let angle = Math.atan2(initial[1], initial[0]);

  const dialEl = document.createElement('div');
  dialEl.className = 'dial';
  const needle = document.createElement('div');
  needle.className = 'dial-needle';
  dialEl.appendChild(needle);

  const dxEl = document.createElement('span');
  const dyEl = document.createElement('span');
  dxEl.className = 'accent';
  dyEl.className = 'accent';
  dxEl.textContent = initial[0].toFixed(2);
  dyEl.textContent = initial[1].toFixed(2);

  const vals = document.createElement('div');
  vals.className = 'dir-values';
  vals.append('dx ', dxEl, document.createElement('br'), 'dy ', dyEl);

  const row = document.createElement('div');
  row.className = 'dir-row';
  row.append(dialEl, vals);

  const lbl = document.createElement('div');
  lbl.className = 'group-label';
  lbl.textContent = 'direction';
  lbl.appendChild(makeInfoBtn('direction'));

  g.append(lbl, row);

  function setAngle(a: number) {
    angle = a;
    needle.style.transform = `translateY(-50%) rotate(${a}rad)`;
    const dx = parseFloat(Math.cos(a).toFixed(2));
    const dy = parseFloat(Math.sin(a).toFixed(2));
    dxEl.textContent = dx.toFixed(2);
    dyEl.textContent = dy.toFixed(2);
    onChange([dx, dy]);
  }
  setAngle(angle);

  function angleFromPointer(e: PointerEvent): number {
    const rect = dialEl.getBoundingClientRect();
    return Math.atan2(
      e.clientY - (rect.top  + rect.height / 2),
      e.clientX - (rect.left + rect.width  / 2)
    );
  }

  let dragging = false;
  dialEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    dialEl.setPointerCapture(e.pointerId);
    setAngle(angleFromPointer(e));
  });
  dialEl.addEventListener('pointermove', (e) => { if (dragging) setAngle(angleFromPointer(e)); });
  dialEl.addEventListener('pointerup',   () => { dragging = false; });

  return g;
}

function makePaletteEditor(
  initial: PaletteStop[],
  onChange: (pal: PaletteStop[]) => void
): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';

  const labelEl = document.createElement('div');
  labelEl.className = 'group-label';
  labelEl.textContent = 'palette';
  labelEl.appendChild(makeInfoBtn('palette'));

  const stopsRow = document.createElement('div');
  stopsRow.className = 'palette-stops';

  const addBtn = document.createElement('button');
  addBtn.className = 'palette-add';
  addBtn.textContent = '+ stop';

  const preview = document.createElement('div');
  preview.className = 'palette-preview';

  g.append(labelEl, stopsRow, addBtn, preview);

  let stops: PaletteStop[] = [...initial];

  function renderStops() {
    stopsRow.innerHTML = '';
    stops.forEach((stop, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'palette-stop';

      const picker = document.createElement('input');
      picker.type  = 'color';
      picker.value = rgbToHex(stop);
      picker.addEventListener('input', () => {
        stops[i] = hexToRgb(picker.value);
        preview.style.background = swatchGradient(stops);
        onChange(stops);
      });
      wrap.appendChild(picker);

      if (stops.length > 2) {
        const del = document.createElement('button');
        del.className   = 'palette-stop-remove';
        del.textContent = '✕';
        del.addEventListener('click', () => {
          stops.splice(i, 1);
          renderStops();
          onChange(stops);
        });
        wrap.appendChild(del);
      }

      stopsRow.appendChild(wrap);
    });

    preview.style.background = swatchGradient(stops);
    (addBtn as HTMLButtonElement).disabled = stops.length >= 8;
  }

  addBtn.addEventListener('click', () => {
    if (stops.length >= 8) return;
    const last = stops[stops.length - 1];
    stops.push([
      Math.min(1, last[0] + 0.1 + Math.random() * 0.4),
      Math.min(1, last[1] + 0.1 + Math.random() * 0.4),
      Math.min(1, last[2] + 0.1 + Math.random() * 0.4),
    ]);
    renderStops();
    onChange(stops);
  });

  renderStops();
  return g;
}

// ══════════════════════════════════════════════════════════
// LAYER CARD
// ══════════════════════════════════════════════════════════

function makeLayerCard(id: string, layerNum: number): HTMLElement {
  const layer = renderer.getLayers().find(l => l.id === id)!;
  let visible  = true;

  const card = document.createElement('div');
  card.className = 'layer-card open';
  card.dataset.id = id;

  // ── Patch helper ────────────────────────────────────────
  function patch(p: Partial<NoiseLayer>) {
    renderer.updateLayer(id, p);
    updateSwatch();
  }

  function updateSwatch() {
    const l = renderer.getLayers().find(x => x.id === id);
    if (!l) return;
    const swatch = card.querySelector<HTMLElement>('.layer-swatch');
    if (swatch) swatch.style.background = swatchGradient(l.palette);
    const preview = card.querySelector<HTMLElement>('.palette-preview');
    if (preview) preview.style.background = swatchGradient(l.palette);
  }

  // ── HEADER ───────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'layer-header';

  const badge = document.createElement('span');
  badge.className = 'layer-badge';
  badge.textContent = String(layerNum);

  const swatch = document.createElement('div');
  swatch.className = 'layer-swatch';
  swatch.style.background = swatchGradient(layer.palette);

  // Editable name input
  const nameInput = document.createElement('input');
  nameInput.className   = 'layer-name-input';
  nameInput.value       = layer.name;
  nameInput.placeholder = 'layer name';
  nameInput.addEventListener('change', () => {
    patch({ name: nameInput.value.trim() || `layer ${layerNum}` });
    nodeGraph.syncFromRenderer();
  });
  // Prevent header collapse when clicking into the text field
  nameInput.addEventListener('click', e => e.stopPropagation());
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') nameInput.blur();
  });

  // Visibility toggle
  const visBtn = document.createElement('button');
  visBtn.className = 'layer-vis active';
  visBtn.title     = 'Toggle visibility';
  visBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    visible = !visible;
    visBtn.classList.toggle('active', visible);
    const currentOpacity = renderer.getLayers().find(l => l.id === id)?.opacity ?? 1;
    patch({ opacity: visible ? currentOpacity : 0 });
    card.classList.toggle('layer-hidden', !visible);
  });

  // Collapse arrow
  const arrow = document.createElement('span');
  arrow.className = 'layer-toggle';
  arrow.textContent = '▶';

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className   = 'layer-remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderer.removeLayer(id);
    card.remove();
    nodeGraph.syncFromRenderer();
  });

  header.append(badge, swatch, nameInput, visBtn, arrow, removeBtn);
  header.addEventListener('click', () => card.classList.toggle('open'));

  // ── BODY ─────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'layer-body';

  // Noise type
  const noiseTypes: NoiseType[] = ['simplex', 'perlin', 'worley', 'fbm', 'curl'];
  body.appendChild(makeChipGroup('noise type', noiseTypes, layer.noiseType, (v) => {
    patch({ noiseType: v as NoiseType });
    const og = body.querySelector<HTMLElement>('.octaves-group');
    if (og) og.classList.toggle('disabled', v !== 'fbm');
    nodeGraph.syncFromRenderer();
  }));

  // Blend mode
  const blendModes: BlendMode[] = ['add', 'multiply', 'screen', 'overlay'];
  body.appendChild(makeChipGroup('blend mode', blendModes, layer.blendMode, (v) => {
    patch({ blendMode: v as BlendMode });
  }));

  // ── Animate toggle ───────────────────────────────────────
  const flowGroup = document.createElement('div'); // forward-declare so animate can reference it

  body.appendChild(makeToggleRow('animate', layer.animate, (v) => {
    patch({ animate: v });
    flowGroup.style.display = v ? 'block' : 'none';
  }));

  // ── Flow type (shown only when animate is on) ────────────
  const flowTypes: FlowType[] = ['linear', 'radial', 'spiral', 'vortex', 'turbulent'];
  flowGroup.appendChild(makeChipGroup('flow type', flowTypes, layer.flowType, (v) => {
    patch({ flowType: v as FlowType });
    const dd = body.querySelector<HTMLElement>('.dir-group');
    if (dd) dd.classList.toggle('disabled', !['linear', 'turbulent'].includes(v));
    nodeGraph.syncFromRenderer();
  }));
  flowGroup.style.display = layer.animate ? 'block' : 'none';
  body.appendChild(flowGroup);
  // Scale
  body.appendChild(makeSlider('scale', 0.1, 12, 0.1, layer.scale, 1, (v) => patch({ scale: v })));

  // Speed
  body.appendChild(makeSlider('speed', 0, 3, 0.01, layer.speed, 2, (v) => patch({ speed: v })));

  // Direction dial (wrapped so we can dim it for non-linear flows)
  const dialGroup = document.createElement('div');
  dialGroup.className = 'dir-group';
  if (!['linear', 'turbulent'].includes(layer.flowType)) dialGroup.classList.add('disabled');
  dialGroup.appendChild(makeDial(layer.direction, (dir) => patch({ direction: dir })));
  body.appendChild(dialGroup);

  // Octaves (fbm only)
  const octGroup = makeSlider('octaves', 1, 8, 1, layer.octaves, 0, (v) => patch({ octaves: v }));
  octGroup.classList.add('octaves-group');
  if (layer.noiseType !== 'fbm') octGroup.classList.add('disabled');
  body.appendChild(octGroup);

  // Contrast
  body.appendChild(makeSlider('contrast', 0.1, 4, 0.05, layer.contrast, 2, (v) => patch({ contrast: v })));

  // Brightness
  body.appendChild(makeSlider('brightness', -1, 1, 0.01, layer.brightness, 2, (v) => patch({ brightness: v })));

  // Domain warp
  body.appendChild(makeSlider('domain warp', 0, 2, 0.01, layer.warp, 2, (v) => patch({ warp: v })));

  // Curl flow
  body.appendChild(makeSlider('curl flow', 0, 2, 0.01, layer.curlStrength, 2, (v) => patch({ curlStrength: v })));

  // Opacity
  body.appendChild(makeSlider('opacity', 0, 1, 0.01, layer.opacity, 2, (v) => {
    patch({ opacity: v });
    visible = v > 0.01;
    visBtn.classList.toggle('active', visible);
    card.classList.toggle('layer-hidden', !visible);
  }));

  // Palette
  body.appendChild(makePaletteEditor(layer.palette, (pal) => {
    patch({ palette: pal });
    nodeGraph.syncFromRenderer();
  }));

  const dragHandle = document.createElement('span');
  dragHandle.className   = 'layer-drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title       = 'Drag to reorder';
  // Insert at the very start of the header
  header.insertBefore(dragHandle, header.firstChild);

  // Make the card draggable, but only when grabbing the handle
  dragHandle.addEventListener('mousedown', () => { card.draggable = true; });
  document.addEventListener('mouseup', () => { card.draggable = false; }, { capture: true });

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', id);
    // Use a short delay so the drag image captures the non-dimmed card
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    card.draggable = false;
    // Clear any leftover indicators
    document.querySelectorAll('.layer-card').forEach(c => {
      c.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    const rect   = card.getBoundingClientRect();
    const midY   = rect.top + rect.height / 2;
    const isTop  = e.clientY < midY;

    // Clear siblings first, then apply to this card
    document.querySelectorAll('.layer-card').forEach(c => {
      c.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    card.classList.add(isTop ? 'drag-over-top' : 'drag-over-bottom');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    const fromId = e.dataTransfer!.getData('text/plain');
    if (fromId === id) return;

    const fromCard = layerList.querySelector<HTMLElement>(`[data-id="${fromId}"]`);
    if (!fromCard) return;

    const rect  = card.getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;

    // Reorder in the DOM
    if (isTop) {
      layerList.insertBefore(fromCard, card);
    } else {
      layerList.insertBefore(fromCard, card.nextSibling);
    }

    card.classList.remove('drag-over-top', 'drag-over-bottom');

    // Sync renderer layer order to match DOM order
    // layerList shows newest at top, renderer composites index 0 first (bottom)
    // so DOM top = last in renderer array
    const orderedIds = [...layerList.querySelectorAll<HTMLElement>('.layer-card')]
      .map(c => c.dataset.id!)
      .reverse(); // DOM is top→bottom, renderer is bottom→top

    renderer.reorderLayers(orderedIds);
    nodeGraph.syncFromRenderer();
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

// ══════════════════════════════════════════════════════════
// NODE GRAPH EDITOR
// ══════════════════════════════════════════════════════════

interface GraphNode {
  id:    string;
  x:     number;
  y:     number;
  label: string;
  color: string;
}

interface GraphEdge {
  from: string;
  to:   string;
}

const nodeGraph = (() => {
  const modal      = document.getElementById('nodeModal')!;
  const closeBtn   = document.getElementById('nodeModalClose')!;
  const nodeCanvas = document.getElementById('nodeCanvas') as HTMLCanvasElement;
  const ctx        = nodeCanvas.getContext('2d')!;

  let nodes: GraphNode[] = [];
  let edges: GraphEdge[] = [];
  let drag:       { id: string; ox: number; oy: number } | null = null;
  let connecting: { fromId: string } | null = null;

  const NODE_W = 150;
  const NODE_H = 58;
  const PORT_R  = 5;

  // ── Sync from renderer ───────────────────────────────────
  function syncFromRenderer() {
    const layers = renderer.getLayers();

    // Update existing / add missing nodes
    layers.forEach((l, i) => {
      const existing = nodes.find(n => n.id === l.id);
      const midStop  = l.palette[Math.floor(l.palette.length / 2)];
      const color    = midStop ? rgbToHex(midStop) : '#ffffff';

      if (!existing) {
        nodes.push({
          id:    l.id,
          x:     60 + (i % 4) * 190,
          y:     60 + Math.floor(i / 4) * 140,
          label: l.name,
          color,
        });
      } else {
        existing.label = l.name;
        existing.color = color;
      }
    });

    // Remove stale nodes and their edges
    const liveIds = new Set(layers.map(l => l.id));
    nodes = nodes.filter(n => liveIds.has(n.id));
    edges = edges.filter(e => liveIds.has(e.from) && liveIds.has(e.to));

    draw();
  }

  function open() {
    syncFromRenderer();
    resize();
    modal.classList.remove('hidden');
  }

  // ── Resize canvas to physical pixels ────────────────────
  function resize() {
    const dpr = devicePixelRatio || 1;
    const w   = nodeCanvas.clientWidth;
    const h   = nodeCanvas.clientHeight;
    nodeCanvas.width  = w * dpr;
    nodeCanvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // ── Port positions ───────────────────────────────────────
  function portPos(node: GraphNode, side: 'in' | 'out'): [number, number] {
    return side === 'in'
      ? [node.x,          node.y + NODE_H / 2]
      : [node.x + NODE_W, node.y + NODE_H / 2];
  }

  // ── Rounded rect helper ──────────────────────────────────
  function roundRect(
    c: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    r: number | [number, number, number, number]
  ) {
    const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    c.beginPath();
    c.moveTo(x + tl, y);
    c.lineTo(x + w - tr, y);       c.arcTo(x + w, y,     x + w, y + h, tr);
    c.lineTo(x + w, y + h - br);   c.arcTo(x + w, y + h, x,     y + h, br);
    c.lineTo(x + bl, y + h);       c.arcTo(x,     y + h, x,     y,     bl);
    c.lineTo(x, y + tl);           c.arcTo(x,     y,     x + w, y,     tl);
    c.closePath();
  }

  // ── Draw ─────────────────────────────────────────────────
  function draw() {
    const W = nodeCanvas.clientWidth;
    const H = nodeCanvas.clientHeight;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth   = 1;
    const GRID = 36;
    for (let x = 0; x < W; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += GRID) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Edges — bezier curves
    edges.forEach(e => {
      const from = nodes.find(n => n.id === e.from);
      const to   = nodes.find(n => n.id === e.to);
      if (!from || !to) return;
      const [fx, fy] = portPos(from, 'out');
      const [tx, ty] = portPos(to,   'in');
      const cx = (fx + tx) / 2;

      const grad = ctx.createLinearGradient(fx, fy, tx, ty);
      grad.addColorStop(0, from.color + 'aa');
      grad.addColorStop(1, to.color   + 'aa');

      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.bezierCurveTo(cx, fy, cx, ty, tx, ty);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });

    // Nodes
    nodes.forEach(n => {
      const layer = renderer.getLayers().find(l => l.id === n.id);

      // Drop shadow
      ctx.shadowColor   = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur    = 16;
      ctx.shadowOffsetY = 4;

      // Card body
      ctx.fillStyle = 'rgba(16, 16, 28, 0.94)';
      roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 8);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
      ctx.shadowOffsetY = 0;

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth   = 1;
      roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 8);
      ctx.stroke();

      // Left colour accent bar
      ctx.fillStyle = n.color;
      roundRect(ctx, n.x, n.y, 4, NODE_H, [8, 0, 0, 8]);
      ctx.fill();

      // Layer name
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font      = '600 12px system-ui, sans-serif';
      ctx.fillText(n.label, n.x + 14, n.y + 22, NODE_W - 20);

      // Sub-label
      if (layer) {
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.font      = '10px system-ui, sans-serif';
        ctx.fillText(`${layer.noiseType} · ${layer.flowType}`, n.x + 14, n.y + 38, NODE_W - 20);
      }

      // Ports
      (['in', 'out'] as const).forEach(side => {
        const [px, py] = portPos(n, side);
        ctx.beginPath();
        ctx.arc(px, py, PORT_R, 0, Math.PI * 2);
        ctx.fillStyle   = 'rgba(255,255,255,0.10)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      });
    });
  }

  // ── Hit testing ──────────────────────────────────────────
  function hitNode(px: number, py: number): GraphNode | null {
    // Reverse so topmost (last drawn? actually positionally) node wins
    return [...nodes].reverse().find(
      n => px >= n.x && px <= n.x + NODE_W && py >= n.y && py <= n.y + NODE_H
    ) ?? null;
  }

  function hitPort(px: number, py: number): { node: GraphNode; side: 'in' | 'out' } | null {
    for (const n of nodes) {
      for (const side of ['in', 'out'] as const) {
        const [px2, py2] = portPos(n, side);
        if (Math.hypot(px - px2, py - py2) < PORT_R + 6) return { node: n, side };
      }
    }
    return null;
  }

  function toCanvas(e: MouseEvent): [number, number] {
    const rect = nodeCanvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  // ── Pointer events ───────────────────────────────────────
  nodeCanvas.addEventListener('mousedown', (e) => {
    const [px, py] = toCanvas(e);

    const port = hitPort(px, py);
    if (port) {
      connecting = { fromId: port.node.id };
      return;
    }

    const n = hitNode(px, py);
    if (n) {
      drag = { id: n.id, ox: px - n.x, oy: py - n.y };
      nodeCanvas.style.cursor = 'grabbing';
    }
  });

  nodeCanvas.addEventListener('mousemove', (e) => {
    const [px, py] = toCanvas(e);
    if (drag) {
      const n = nodes.find(n => n.id === drag!.id);
      if (n) { n.x = px - drag.ox; n.y = py - drag.oy; draw(); }
      return;
    }
    // Cursor hints
    const port = hitPort(px, py);
    const node = hitNode(px, py);
    nodeCanvas.style.cursor = port ? 'crosshair' : node ? 'grab' : 'default';
  });

  nodeCanvas.addEventListener('mouseup', (e) => {
    const [px, py] = toCanvas(e);

    if (connecting) {
      const port = hitPort(px, py);
      if (port && port.node.id !== connecting.fromId) {
        const from = connecting.fromId;
        const to   = port.node.id;
        // Toggle the edge
        const idx = edges.findIndex(edge => edge.from === from && edge.to === to);
        if (idx >= 0) edges.splice(idx, 1);
        else edges.push({ from, to });
        draw();
      }
      connecting = null;
    }

    drag = null;
    nodeCanvas.style.cursor = 'default';
  });

  // Close modal
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // Re-size when modal becomes visible
  new ResizeObserver(() => {
    if (!modal.classList.contains('hidden')) resize();
  }).observe(nodeCanvas);

  return { open, syncFromRenderer };
})();

// ── Open node graph ───────────────────────────────────────
document.getElementById('openNodeGraph')!.addEventListener('click', () => nodeGraph.open());

// ══════════════════════════════════════════════════════════
// ADD LAYER
// ══════════════════════════════════════════════════════════
let layerCount = 0;

document.getElementById('addLayerBtn')!.addEventListener('click', () => {
  layerCount++;

  const hue = Math.random();
  const starterPalette: PaletteStop[] = [
    [0, 0, 0],
    [
      0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28)),
      0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 2)),
      0.3 + 0.7 * Math.abs(Math.sin(hue * 6.28 + 4)),
    ],
  ];

  const id = renderer.addLayer({
    ...defaultLayer(),
    name:    `layer ${layerCount}`,
    palette: starterPalette,
  });

  const card = makeLayerCard(id, layerCount);
  layerList.prepend(card);
  nodeGraph.syncFromRenderer();
});