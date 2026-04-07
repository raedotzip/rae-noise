import Handlebars from 'handlebars';
import type { PaletteStop } from '../../src/types';
import { makeInfoBtn } from './tooltip';
import { rgbToHex, swatchGradient } from './color';

// ── Handlebars eq helper (needed by chip-group active check) ──
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

// ── Lazy partial compiler cache ───────────────────────────────
// We compile the partials that were registered by views/index.ts
function partial(name: string): Handlebars.TemplateDelegate {
  const src = (Handlebars.partials as Record<string, string>)[name];
  if (typeof src !== 'string') throw new Error(`Partial not found: ${name}`);
  return Handlebars.compile(src);
}

// ── Shared: wire info-btn events on an element ─────────────────
function wireInfoBtns(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.info-btn').forEach(btn => {
    const key = btn.title;
    // Replace the static btn with a fully-wired one from makeInfoBtn
    const wired = makeInfoBtn(key);
    btn.replaceWith(wired);
  });
}

// ── chip group ────────────────────────────────────────────────
export function makeChipGroup(
  label: string,
  options: string[],
  current: string,
  onChange: (v: string) => void
): HTMLElement {
  const html = partial('widgets/chip-group')({ label, options, current });
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const g = wrap.firstElementChild as HTMLElement;

  wireInfoBtns(g);

  g.querySelectorAll<HTMLButtonElement>('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      g.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value!);
    });
  });

  return g;
}

// ── toggle row ────────────────────────────────────────────────
export function makeToggleRow(
  label: string,
  initial: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  const html = partial('widgets/toggle-row')({ label, checked: initial });
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const g = wrap.firstElementChild as HTMLElement;

  wireInfoBtns(g);

  g.querySelector('input')!.addEventListener('change', (e) => {
    onChange((e.target as HTMLInputElement).checked);
  });

  return g;
}

// ── slider ────────────────────────────────────────────────────
export function makeSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  decimals: number,
  onChange: (v: number) => void
): HTMLElement {
  const html = partial('widgets/slider')({
    label,
    min,
    max,
    step,
    value: value.toFixed(decimals),
  });
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const g = wrap.firstElementChild as HTMLElement;

  wireInfoBtns(g);

  const rangeInput    = g.querySelector<HTMLInputElement>('input[type="range"]')!;
  const valueDisplay  = g.querySelector<HTMLElement>('.value-display')!;
  const valueInput    = g.querySelector<HTMLInputElement>('.value-input')!;

  function applyValue(v: number) {
    v = Math.min(max, Math.max(min, v));
    const factor = Math.pow(10, decimals);
    v = Math.round(v * factor) / factor;
    valueDisplay.textContent = v.toFixed(decimals);
    valueInput.value         = v.toFixed(decimals);
    rangeInput.value         = String(v);
    onChange(v);
  }

  rangeInput.addEventListener('input', () => applyValue(parseFloat(rangeInput.value)));

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

// ── dial ──────────────────────────────────────────────────────
export function makeDial(
  initial: [number, number],
  onChange: (dir: [number, number]) => void
): HTMLElement {
  let angle = Math.atan2(initial[1], initial[0]);

  const html = partial('widgets/dial')({
    dx: initial[0].toFixed(2),
    dy: initial[1].toFixed(2),
  });
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const g = wrap.firstElementChild as HTMLElement;

  wireInfoBtns(g);

  const dialEl = g.querySelector<HTMLElement>('.dial')!;
  const needle = g.querySelector<HTMLElement>('.dial-needle')!;
  const dxEl   = g.querySelector<HTMLElement>('[data-dir="dx"]')!;
  const dyEl   = g.querySelector<HTMLElement>('[data-dir="dy"]')!;

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

// ── palette editor ────────────────────────────────────────────
export function makePaletteEditor(
  initial: PaletteStop[],
  onChange: (pal: PaletteStop[]) => void
): HTMLElement {
  let stops: PaletteStop[] = [...initial];

  function hexToRgbLocal(hex: string): PaletteStop {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function render(): HTMLElement {
    const html = partial('widgets/palette-editor')({
      stops:            stops.map(s => rgbToHex(s)),
      canRemove:        stops.length > 2,
      maxReached:       stops.length >= 8,
    });
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const g = wrap.firstElementChild as HTMLElement;

    wireInfoBtns(g);

    const preview   = g.querySelector<HTMLElement>('.palette-preview')!;
    const stopsRow  = g.querySelector<HTMLElement>('.palette-stops')!;
    const addBtn    = g.querySelector<HTMLButtonElement>('.palette-add')!;

    preview.style.background = swatchGradient(stops);

    stopsRow.querySelectorAll<HTMLInputElement>('input[type="color"]').forEach((picker, i) => {
      picker.addEventListener('input', () => {
        stops[i] = hexToRgbLocal(picker.value);
        preview.style.background = swatchGradient(stops);
        onChange(stops);
      });
    });

    stopsRow.querySelectorAll<HTMLButtonElement>('.palette-stop-remove').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        stops.splice(i, 1);
        const newG = render();
        g.replaceWith(newG);
        onChange(stops);
      });
    });

    addBtn.addEventListener('click', () => {
      if (stops.length >= 8) return;
      const last = stops[stops.length - 1];
      stops.push([
        Math.min(1, last[0] + 0.1 + Math.random() * 0.4),
        Math.min(1, last[1] + 0.1 + Math.random() * 0.4),
        Math.min(1, last[2] + 0.1 + Math.random() * 0.4),
      ]);
      const newG = render();
      g.replaceWith(newG);
      onChange(stops);
    });

    return g;
  }

  return render();
}