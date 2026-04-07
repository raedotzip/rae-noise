import Handlebars from 'handlebars';
import type { NoiseLayer, NoiseType, BlendMode, FlowType } from '../../../src/types';
import { swatchGradient, rgbToHex } from './color';
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
  onSync: () => void;
}

export function makeLayerCard(
  id: string,
  layerNum: number,
  { layerList, renderer, onSync }: LayerCardDeps
): HTMLElement {
  const layer = renderer.getLayers().find(l => l.id === id)!;
  let visible  = true;

  // ── Render card shell from Handlebars template ────────────
  const noiseTypes: NoiseType[]  = ['simplex', 'perlin', 'worley', 'fbm', 'curl'];
  const blendModes: BlendMode[]  = ['add', 'multiply', 'screen', 'overlay'];
  const flowTypes:  FlowType[]   = ['linear', 'radial', 'spiral', 'vortex', 'turbulent'];

  const templateSrc = (Handlebars.partials as Record<string, string>)['layer/layer-card'] ??
    // fallback: compile the template registered under templates key
    null;

  // Build the card element from scratch (the template gives us structure,
  // but all real widget bodies are still constructed by widget helpers so
  // interactivity is preserved exactly as before).
  const card = document.createElement('div');
  card.className  = 'layer-card open';
  card.dataset.id = id;

  // ── Patch helper ──────────────────────────────────────────
  function patch(p: Partial<NoiseLayer>) {
    renderer.updateLayer(id, p);
    updateSwatch();
  }

  function updateSwatch() {
    const l = renderer.getLayers().find(x => x.id === id);
    if (!l) return;
    const swatch  = card.querySelector<HTMLElement>('.layer-swatch');
    if (swatch) swatch.style.background = swatchGradient(l.palette);
    const preview = card.querySelector<HTMLElement>('.palette-preview');
    if (preview) preview.style.background = swatchGradient(l.palette);
  }

  // ── HEADER (from partial) ─────────────────────────────────
  const headerSrc = (Handlebars.partials as Record<string, string>)['layer/layer-header'];
  const headerHtml = Handlebars.compile(headerSrc)({
    layerNum,
    name:          layer.name,
    swatchGradient: swatchGradient(layer.palette),
  });

  const headerWrap = document.createElement('div');
  headerWrap.innerHTML = headerHtml;
  const header = headerWrap.firstElementChild as HTMLElement;

  // Wire header events
  const nameInput = header.querySelector<HTMLInputElement>('.layer-name-input')!;
  nameInput.addEventListener('change', () => {
    patch({ name: nameInput.value.trim() || `layer ${layerNum}` });
    onSync();
  });
  nameInput.addEventListener('click', e => e.stopPropagation());
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });

  const visBtn = header.querySelector<HTMLButtonElement>('.layer-vis')!;
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    visible = !visible;
    visBtn.classList.toggle('active', visible);
    const currentOpacity = renderer.getLayers().find(l => l.id === id)?.opacity ?? 1;
    patch({ opacity: visible ? currentOpacity : 0 });
    card.classList.toggle('layer-hidden', !visible);
  });

  const removeBtn = header.querySelector<HTMLButtonElement>('.layer-remove')!;
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    renderer.removeLayer(id);
    card.remove();
    onSync();
  });

  header.addEventListener('click', () => card.classList.toggle('open'));

  // ── BODY (widgets built programmatically, attached to a wrapper) ──
  const body = document.createElement('div');
  body.className = 'layer-body';

  body.appendChild(makeChipGroup('noise type', noiseTypes, layer.noiseType, (v) => {
    patch({ noiseType: v as NoiseType });
    const og = body.querySelector<HTMLElement>('.octaves-group');
    if (og) og.classList.toggle('disabled', v !== 'fbm');
    onSync();
  }));

  body.appendChild(makeChipGroup('blend mode', blendModes, layer.blendMode, (v) => {
    patch({ blendMode: v as BlendMode });
  }));

  const flowGroup = document.createElement('div');

  body.appendChild(makeToggleRow('animate', layer.animate, (v) => {
    patch({ animate: v });
    flowGroup.style.display = v ? 'block' : 'none';
  }));

  flowGroup.appendChild(makeChipGroup('flow type', flowTypes, layer.flowType, (v) => {
    patch({ flowType: v as FlowType });
    const dd = body.querySelector<HTMLElement>('.dir-group');
    if (dd) dd.classList.toggle('disabled', !['linear', 'turbulent'].includes(v));
    onSync();
  }));
  flowGroup.style.display = layer.animate ? 'block' : 'none';
  body.appendChild(flowGroup);

  body.appendChild(makeSlider('scale',  0.1, 12, 0.1,  layer.scale,   1, (v) => patch({ scale: v })));
  body.appendChild(makeSlider('speed',  0,   3,  0.01, layer.speed,   2, (v) => patch({ speed: v })));

  const dialGroup = document.createElement('div');
  dialGroup.className = 'dir-group';
  if (!['linear', 'turbulent'].includes(layer.flowType)) dialGroup.classList.add('disabled');
  dialGroup.appendChild(makeDial(layer.direction, (dir) => patch({ direction: dir })));
  body.appendChild(dialGroup);

  const octGroup = makeSlider('octaves', 1, 8, 1, layer.octaves, 0, (v) => patch({ octaves: v }));
  octGroup.classList.add('octaves-group');
  if (layer.noiseType !== 'fbm') octGroup.classList.add('disabled');
  body.appendChild(octGroup);

  body.appendChild(makeSlider('contrast',    0.1, 4,  0.05, layer.contrast,     2, (v) => patch({ contrast: v })));
  body.appendChild(makeSlider('brightness',  -1,  1,  0.01, layer.brightness,   2, (v) => patch({ brightness: v })));
  body.appendChild(makeSlider('domain warp', 0,   2,  0.01, layer.warp,         2, (v) => patch({ warp: v })));
  body.appendChild(makeSlider('curl flow',   0,   2,  0.01, layer.curlStrength, 2, (v) => patch({ curlStrength: v })));

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

  // ── Drag handle events ────────────────────────────────────
  const dragHandle = header.querySelector<HTMLElement>('.layer-drag-handle')!;

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
    if (isTop) layerList.insertBefore(fromCard, card);
    else       layerList.insertBefore(fromCard, card.nextSibling);
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