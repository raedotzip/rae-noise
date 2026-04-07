import type { NoiseLayer } from '../../src/types';
import { rgbToHex } from './color';

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

interface NodeGraphDeps {
  getRenderer: () => {
    getLayers: () => NoiseLayer[];
  };
}

export function createNodeGraph({ getRenderer }: NodeGraphDeps) {
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

  // ── Sync from renderer ─────────────────────────────────
  function syncFromRenderer() {
    const layers = getRenderer().getLayers();

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

  // ── Resize canvas to physical pixels ──────────────────
  function resize() {
    const dpr = devicePixelRatio || 1;
    const w   = nodeCanvas.clientWidth;
    const h   = nodeCanvas.clientHeight;
    nodeCanvas.width  = w * dpr;
    nodeCanvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // ── Port positions ────────────────────────────────────
  function portPos(node: GraphNode, side: 'in' | 'out'): [number, number] {
    return side === 'in'
      ? [node.x,          node.y + NODE_H / 2]
      : [node.x + NODE_W, node.y + NODE_H / 2];
  }

  // ── Rounded rect helper ───────────────────────────────
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

  // ── Draw ─────────────────────────────────────────────
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

    // Edges
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
      const layer = getRenderer().getLayers().find(l => l.id === n.id);

      ctx.shadowColor   = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur    = 16;
      ctx.shadowOffsetY = 4;

      ctx.fillStyle = 'rgba(16, 16, 28, 0.94)';
      roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 8);
      ctx.fill();

      ctx.shadowColor   = 'transparent';
      ctx.shadowBlur    = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth   = 1;
      roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 8);
      ctx.stroke();

      ctx.fillStyle = n.color;
      roundRect(ctx, n.x, n.y, 4, NODE_H, [8, 0, 0, 8]);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font      = '600 12px system-ui, sans-serif';
      ctx.fillText(n.label, n.x + 14, n.y + 22, NODE_W - 20);

      if (layer) {
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.font      = '10px system-ui, sans-serif';
        ctx.fillText(`${layer.noiseType} · ${layer.flowType}`, n.x + 14, n.y + 38, NODE_W - 20);
      }

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

  // ── Hit testing ───────────────────────────────────────
  function hitNode(px: number, py: number): GraphNode | null {
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

  // ── Pointer events ────────────────────────────────────
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
        const idx  = edges.findIndex(edge => edge.from === from && edge.to === to);
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

  new ResizeObserver(() => {
    if (!modal.classList.contains('hidden')) resize();
  }).observe(nodeCanvas);

  return { open, syncFromRenderer };
}