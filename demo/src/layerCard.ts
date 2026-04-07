// ══════════════════════════════════════════════════════════
// LAYER CARD
// ══════════════════════════════════════════════════════════

import type { NoiseLayer, NoiseType, BlendMode, FlowType } from '../../src/types';
import { swatchGradient } from './color';
import {
  makeChipGroup,
  makeToggleRow,
  makeSlider,
  makeDial,
  makePaletteEditor,
} from './widgets';

interface LayerCardDeps {
  layerList: HTMLElement;
  renderer: {
    getLayers: () => NoiseLayer[];
    updateLayer: (id: string, patch: Partial<NoiseLayer>) => void;
    removeLayer:  (id: string) => void;
    reorderLayers: (ids: string[]) => void;
  };
  onSync: () => void; // callback to re-sync node graph
}

export function makeLayerCard(
  id: string,
  layerNum: number,
  { layerList, renderer, onSync }: LayerCardDeps
): HTMLElement {
  const layer = renderer.getLayers().find(l => l.id === id)!;
  let visible  = true;

  const card = document.createElement('div');
  card.className  = 'layer-card open';
  card.dataset.id = id;

  // ── Patch helper ─────────────────────────────────────────
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
  badge.className   = 'layer-badge';
  badge.textContent = String(layerNum);

  const swatch = document.createElement('div');
  swatch.className        = 'layer-swatch';
  swatch.style.background = swatchGradient(layer.palette);

  const nameInput = document.createElement('input');
  nameInput.className   = 'layer-name-input';
  nameInput.value       = layer.name;
  nameInput.placeholder = 'layer name';
  nameInput.addEventListener('change', () => {
    patch({ name: nameInput.value.trim() || `layer ${layerNum}` });
    onSync();
  });
  nameInput.addEventListener('click', e => e.stopPropagation());
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') nameInput.blur();
  });

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

  const arrow = document.createElement('span');
  arrow.className   = 'layer-toggle';
  arrow.textContent = '▶';

  const removeBtn = document.createElement('button');
  removeBtn.className   = 'layer-remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderer.removeLayer(id);
    card.remove();
    onSync();
  });

  header.append(badge, swatch, nameInput, visBtn, arrow, removeBtn);
  header.addEventListener('click', () => card.classList.toggle('open'));

  // ── BODY ─────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'layer-body';

  const noiseTypes: NoiseType[] = ['simplex', 'perlin', 'worley', 'fbm', 'curl'];
  body.appendChild(makeChipGroup('noise type', noiseTypes, layer.noiseType, (v) => {
    patch({ noiseType: v as NoiseType });
    const og = body.querySelector<HTMLElement>('.octaves-group');
    if (og) og.classList.toggle('disabled', v !== 'fbm');
    onSync();
  }));

  const blendModes: BlendMode[] = ['add', 'multiply', 'screen', 'overlay'];
  body.appendChild(makeChipGroup('blend mode', blendModes, layer.blendMode, (v) => {
    patch({ blendMode: v as BlendMode });
  }));

  const flowGroup = document.createElement('div');

  body.appendChild(makeToggleRow('animate', layer.animate, (v) => {
    patch({ animate: v });
    flowGroup.style.display = v ? 'block' : 'none';
  }));

  const flowTypes: FlowType[] = ['linear', 'radial', 'spiral', 'vortex', 'turbulent'];
  flowGroup.appendChild(makeChipGroup('flow type', flowTypes, layer.flowType, (v) => {
    patch({ flowType: v as FlowType });
    const dd = body.querySelector<HTMLElement>('.dir-group');
    if (dd) dd.classList.toggle('disabled', !['linear', 'turbulent'].includes(v));
    onSync();
  }));
  flowGroup.style.display = layer.animate ? 'block' : 'none';
  body.appendChild(flowGroup);

  body.appendChild(makeSlider('scale', 0.1, 12, 0.1, layer.scale, 1, (v) => patch({ scale: v })));
  body.appendChild(makeSlider('speed', 0, 3, 0.01, layer.speed, 2, (v) => patch({ speed: v })));

  const dialGroup = document.createElement('div');
  dialGroup.className = 'dir-group';
  if (!['linear', 'turbulent'].includes(layer.flowType)) dialGroup.classList.add('disabled');
  dialGroup.appendChild(makeDial(layer.direction, (dir) => patch({ direction: dir })));
  body.appendChild(dialGroup);

  const octGroup = makeSlider('octaves', 1, 8, 1, layer.octaves, 0, (v) => patch({ octaves: v }));
  octGroup.classList.add('octaves-group');
  if (layer.noiseType !== 'fbm') octGroup.classList.add('disabled');
  body.appendChild(octGroup);

  body.appendChild(makeSlider('contrast',   0.1, 4,  0.05, layer.contrast,      2, (v) => patch({ contrast: v })));
  body.appendChild(makeSlider('brightness', -1,  1,  0.01, layer.brightness,    2, (v) => patch({ brightness: v })));
  body.appendChild(makeSlider('domain warp', 0,  2,  0.01, layer.warp,          2, (v) => patch({ warp: v })));
  body.appendChild(makeSlider('curl flow',   0,  2,  0.01, layer.curlStrength,  2, (v) => patch({ curlStrength: v })));

  body.appendChild(makeSlider('opacity', 0, 1, 0.01, layer.opacity, 2, (v) => {
    patch({ opacity: v });
    visible = v > 0.01;
    visBtn.classList.toggle('active', visible);
    card.classList.toggle('layer-hidden', !visible);
  }));

  body.appendChild(makePaletteEditor(layer.palette, (pal) => {
    patch({ palette: pal });
    onSync();
  }));

  // ── Drag handle ──────────────────────────────────────────
  const dragHandle = document.createElement('span');
  dragHandle.className   = 'layer-drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title       = 'Drag to reorder';
  header.insertBefore(dragHandle, header.firstChild);

  dragHandle.addEventListener('mousedown', () => { card.draggable = true; });
  document.addEventListener('mouseup', () => { card.draggable = false; }, { capture: true });

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', id);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    card.draggable = false;
    document.querySelectorAll('.layer-card').forEach(c => {
      c.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    const rect  = card.getBoundingClientRect();
    const isTop = e.clientY < rect.top + rect.height / 2;

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

    if (isTop) {
      layerList.insertBefore(fromCard, card);
    } else {
      layerList.insertBefore(fromCard, card.nextSibling);
    }

    card.classList.remove('drag-over-top', 'drag-over-bottom');

    const orderedIds = [...layerList.querySelectorAll<HTMLElement>('.layer-card')]
      .map(c => c.dataset.id!)
      .reverse();

    renderer.reorderLayers(orderedIds);
    onSync();
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}