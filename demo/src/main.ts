import { createRenderer, defaultLayer } from '../../src/index';
import type { PaletteStop } from '../../src/types';
import { hexToRgb } from './color';
import { makeLayerCard } from './layerCard';
import { createNodeGraph } from './nodeGraph';
import "./../styles/styles.css";

// ── Renderer setup ────────────────────────────────────────
const canvas   = document.getElementById('glCanvas') as HTMLCanvasElement;
const renderer = createRenderer(canvas);

const fpsEl     = document.getElementById('fps')!;
const layerList = document.getElementById('layerList')!;

renderer.onFps = (fps: number) => { fpsEl.textContent = `${fps} fps`; };

// ── Node graph ────────────────────────────────────────────
const nodeGraph = createNodeGraph({ getRenderer: () => renderer });

document.getElementById('openNodeGraph')!.addEventListener('click', () => nodeGraph.open());

// ── Add layer ─────────────────────────────────────────────
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

  const card = makeLayerCard(id, layerCount, {
    layerList,
    renderer,
    onSync: () => nodeGraph.syncFromRenderer(),
  });

  layerList.prepend(card);
  nodeGraph.syncFromRenderer();
});