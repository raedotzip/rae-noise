import { createRenderer, PaletteStop, defaultLayer } from "../../../src";
import { makeLayerCard } from "./layerCard";
import { createNodeGraph } from "./nodeGraph";


export default function initDemo() {
  // ── Initialize renderer AFTER route/template is rendered ──
  const canvas = document.getElementById('glCanvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('Canvas element with id "glCanvas" not found in the current route!');
    return;
  }

  const renderer = createRenderer(canvas);

  // FPS display
  const fpsEl = document.getElementById('fps');
  if (fpsEl) {
    renderer.onFps = (fps: number) => { fpsEl.textContent = `${fps} fps`; };
  }

  // Layer list
  const layerList = document.getElementById('layerList');
  if (!layerList) {
    console.warn('Layer list element not found; skipping layer UI setup.');
  }

  // Node graph
  const nodeGraph = createNodeGraph({ getRenderer: () => renderer });
  const openNodeGraphBtn = document.getElementById('openNodeGraph');
  if (openNodeGraphBtn) {
    openNodeGraphBtn.addEventListener('click', () => nodeGraph.open());
  }

  // Add layer button
  const addLayerBtn = document.getElementById('addLayerBtn');
  if (addLayerBtn && layerList) {
    let layerCount = 0;
    addLayerBtn.addEventListener('click', () => {
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
  }
} 