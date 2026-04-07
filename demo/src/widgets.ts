import type { PaletteStop } from '../../src/types';
import { makeInfoBtn } from './tooltip';
import { rgbToHex, swatchGradient } from './color';

export function makeChipGroup(
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
    btn.className     = `chip${o === current ? ' active' : ''}`;
    btn.dataset.value = o;
    btn.textContent   = o;
    btn.addEventListener('click', () => {
      row.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(o);
    });
    row.appendChild(btn);
  });

  return g;
}

export function makeToggleRow(
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

export function makeSlider(
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

  // Label row
  const labelEl = document.createElement('div');
  labelEl.className = 'group-label';

  const labelLeft = document.createElement('span');
  labelLeft.style.cssText = 'display:flex;align-items:center;gap:4px;';
  labelLeft.textContent = label;
  labelLeft.appendChild(makeInfoBtn(label));

  const valueDisplay = document.createElement('span');
  valueDisplay.className    = 'value-display';
  valueDisplay.textContent  = value.toFixed(decimals);
  valueDisplay.title        = 'Click to enter a value';
  valueDisplay.style.cursor = 'text';

  const valueInput = document.createElement('input');
  valueInput.type          = 'number';
  valueInput.className     = 'value-input';
  valueInput.min           = String(min);
  valueInput.max           = String(max);
  valueInput.step          = String(step);
  valueInput.value         = value.toFixed(decimals);
  valueInput.style.display = 'none';

  labelEl.append(labelLeft, valueDisplay, valueInput);

  const rangeInput = document.createElement('input');
  rangeInput.type      = 'range';
  rangeInput.className = 'slider';
  rangeInput.min       = String(min);
  rangeInput.max       = String(max);
  rangeInput.step      = String(step);
  rangeInput.value     = String(value);

  g.append(labelEl, rangeInput);

  function applyValue(v: number) {
    v = Math.min(max, Math.max(min, v));
    const factor = Math.pow(10, decimals);
    v = Math.round(v * factor) / factor;

    valueDisplay.textContent = v.toFixed(decimals);
    valueInput.value         = v.toFixed(decimals);
    rangeInput.value         = String(v);
    onChange(v);
  }

  rangeInput.addEventListener('input', () => {
    applyValue(parseFloat(rangeInput.value));
  });

  valueDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    valueDisplay.style.display = 'none';
    valueInput.style.display   = 'inline-block';
    valueInput.focus();
    valueInput.select();
  });

  valueInput.addEventListener('blur', () => {
    const v = parseFloat(valueInput.value);
    if (!isNaN(v)) applyValue(v);
    valueInput.style.display   = 'none';
    valueDisplay.style.display = 'inline';
  });

  valueInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      valueInput.blur();
    } else if (e.key === 'Escape') {
      valueInput.value           = valueDisplay.textContent!;
      valueInput.style.display   = 'none';
      valueDisplay.style.display = 'inline';
    }
  });

  valueInput.addEventListener('click', e => e.stopPropagation());

  return g;
}

export function makeDial(
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

export function makePaletteEditor(
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

// Re-export hexToRgb for use inside makePaletteEditor
function hexToRgb(hex: string): PaletteStop {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}