import $ from "jquery";
import type { NoiseLayer } from "rae-noise";
import { rgbToHex } from "./color";

/** A node in the visual node graph — represents one layer. */
interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
}

/** A directed edge between two nodes in the graph. */
interface GraphEdge {
  from: string;
  to: string;
}

/** Dependencies required by the node graph. */
interface NodeGraphDeps {
  getRenderer: () => {
    getLayers: () => NoiseLayer[];
  };
}

/** Port hit-test result. */
interface PortHit {
  node: GraphNode;
  side: "in" | "out";
}

/** Dimension constants for node rendering. */
const NODE_W: number = 150;
const NODE_H: number = 58;
const PORT_R: number = 5;
const GRID_SIZE: number = 36;

/**
 * Create the interactive node graph visualisation.
 * Returns an object with `open` and `syncFromRenderer` methods.
 */
export function createNodeGraph({ getRenderer }: NodeGraphDeps) {
  const $modal: JQuery<HTMLElement> = $("#nodeModal");
  const $close: JQuery<HTMLElement> = $("#nodeModalClose");
  const $canvas: JQuery<HTMLCanvasElement> = $("#nodeCanvas") as JQuery<HTMLCanvasElement>;

  if (!$modal.length || !$close.length || !$canvas.length) {
    throw new Error("Node graph elements not found");
  }

  const canvas: HTMLCanvasElement = $canvas[0];
  const ctxResult: CanvasRenderingContext2D | null = canvas.getContext("2d");
  if (!ctxResult) throw new Error("Canvas 2d context not available");
  const ctx: CanvasRenderingContext2D = ctxResult;

  /* ── Graph state ──────────────────────────────────────── */

  const nodes: GraphNode[] = [];
  const nodeMap: Map<string, GraphNode> = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  let drag: { id: string; ox: number; oy: number } | null = null;
  let connecting: { fromId: string } | null = null;

  /* ── Graph sync ───────────────────────────────────────── */

  /** Synchronise the node graph state with the current renderer layers. */
  function syncFromRenderer(): void {
    const layers: NoiseLayer[] = getRenderer().getLayers();

    layers.forEach((layer: NoiseLayer, i: number): void => {
      const mid = layer.palette[Math.floor(layer.palette.length / 2)];
      const color: string = mid ? rgbToHex(mid) : "#ffffff";

      let node: GraphNode | undefined = nodeMap.get(layer.id);

      if (!node) {
        node = {
          id: layer.id,
          x: 60 + (i % 4) * 190,
          y: 60 + Math.floor(i / 4) * 140,
          label: layer.name,
          color,
        };
        nodes.push(node);
        nodeMap.set(node.id, node);
      } else {
        node.label = layer.name;
        node.color = color;
      }
    });

    const liveIds: Set<string> = new Set(layers.map((l: NoiseLayer): string => l.id));

    for (let i: number = nodes.length - 1; i >= 0; i--) {
      const n: GraphNode = nodes[i];
      if (!liveIds.has(n.id)) {
        nodes.splice(i, 1);
        nodeMap.delete(n.id);
      }
    }

    for (let i: number = edges.length - 1; i >= 0; i--) {
      const e: GraphEdge = edges[i];
      if (!liveIds.has(e.from) || !liveIds.has(e.to)) {
        edges.splice(i, 1);
      }
    }

    draw();
  }

  /** Open the node graph modal and sync state. */
  function open(): void {
    syncFromRenderer();
    resize();
    $modal.removeClass("hidden");
  }

  /* ── Canvas helpers ───────────────────────────────────── */

  /** Resize the canvas to match its CSS dimensions at the device pixel ratio. */
  function resize(): void {
    const dpr: number = window.devicePixelRatio || 1;
    const w: number = canvas.clientWidth;
    const h: number = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  /** Return the [x, y] position of a node's input or output port. */
  function portPos(node: GraphNode, side: "in" | "out"): [number, number] {
    return side === "in"
      ? [node.x, node.y + NODE_H / 2]
      : [node.x + NODE_W, node.y + NODE_H / 2];
  }

  /** Trace a rounded rectangle path onto the given 2D context. */
  function roundRect(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number | [number, number, number, number]
  ): void {
    const [tl, tr, br, bl]: [number, number, number, number] = Array.isArray(r)
      ? r
      : [r, r, r, r];
    c.beginPath();
    c.moveTo(x + tl, y);
    c.lineTo(x + w - tr, y);
    c.arcTo(x + w, y, x + w, y + h, tr);
    c.lineTo(x + w, y + h - br);
    c.arcTo(x + w, y + h, x, y + h, br);
    c.lineTo(x + bl, y + h);
    c.arcTo(x, y + h, x, y, bl);
    c.lineTo(x, y + tl);
    c.arcTo(x, y, x + w, y, tl);
    c.closePath();
  }

  /* ── Rendering ────────────────────────────────────────── */

  /** Redraw the entire node graph — background grid, edges, and nodes. */
  function draw(): void {
    const W: number = canvas.clientWidth;
    const H: number = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    drawGrid(W, H);
    drawEdges();
    drawNodes();
  }

  /** Draw the background dot grid. */
  function drawGrid(W: number, H: number): void {
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;

    for (let x: number = 0; x < W; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y: number = 0; y < H; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  /** Draw bezier edges between connected nodes. */
  function drawEdges(): void {
    for (const e of edges) {
      const from: GraphNode | undefined = nodeMap.get(e.from);
      const to: GraphNode | undefined = nodeMap.get(e.to);
      if (!from || !to) continue;

      const [fx, fy]: [number, number] = portPos(from, "out");
      const [tx, ty]: [number, number] = portPos(to, "in");
      const cx: number = (fx + tx) / 2;

      const grad: CanvasGradient = ctx.createLinearGradient(fx, fy, tx, ty);
      grad.addColorStop(0, `${from.color}aa`);
      grad.addColorStop(1, `${to.color}aa`);

      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.bezierCurveTo(cx, fy, cx, ty, tx, ty);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /** Draw all node cards with their labels and ports. */
  function drawNodes(): void {
    for (const n of nodes) {
      const layer: NoiseLayer | undefined = getRenderer()
        .getLayers()
        .find((l: NoiseLayer): boolean => l.id === n.id);

      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      ctx.fillStyle = "rgba(16,16,28,0.94)";
      roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 8);
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      roundRect(ctx, n.x, n.y, NODE_W, NODE_H, 8);
      ctx.stroke();

      ctx.fillStyle = n.color;
      roundRect(ctx, n.x, n.y, 4, NODE_H, [8, 0, 0, 8]);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText(n.label, n.x + 14, n.y + 22, NODE_W - 20);

      if (layer) {
        ctx.fillStyle = "rgba(255,255,255,0.38)";
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(`${layer.noiseType} · ${layer.flowType}`, n.x + 14, n.y + 38, NODE_W - 20);
      }

      for (const side of ["in", "out"] as const) {
        const [px, py]: [number, number] = portPos(n, side);
        ctx.beginPath();
        ctx.arc(px, py, PORT_R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.38)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  /* ── Hit testing ──────────────────────────────────────── */

  /** Find the topmost node under the given point, or null. */
  function hitNode(px: number, py: number): GraphNode | null {
    for (let i: number = nodes.length - 1; i >= 0; i--) {
      const n: GraphNode = nodes[i];
      if (px >= n.x && px <= n.x + NODE_W && py >= n.y && py <= n.y + NODE_H) {
        return n;
      }
    }
    return null;
  }

  /** Find the port (node + side) nearest to the given point, or null. */
  function hitPort(px: number, py: number): PortHit | null {
    for (const n of nodes) {
      for (const side of ["in", "out"] as const) {
        const [x, y]: [number, number] = portPos(n, side);
        if (Math.hypot(px - x, py - y) < PORT_R + 6) {
          return { node: n, side };
        }
      }
    }
    return null;
  }

  /** Convert a jQuery mouse event to canvas-local coordinates. */
  function toCanvas(e: JQuery.MouseEventBase): [number, number] {
    const rect: DOMRect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  /* ── Interaction ──────────────────────────────────────── */

  $canvas.on("mousedown", (e: JQuery.MouseDownEvent): void => {
    const [px, py]: [number, number] = toCanvas(e);

    const port: PortHit | null = hitPort(px, py);
    if (port) {
      connecting = { fromId: port.node.id };
      return;
    }

    const node: GraphNode | null = hitNode(px, py);
    if (node) {
      drag = { id: node.id, ox: px - node.x, oy: py - node.y };
      $canvas.css("cursor", "grabbing");
    }
  });

  $canvas.on("mousemove", (e: JQuery.MouseMoveEvent): void => {
    const [px, py]: [number, number] = toCanvas(e);

    if (drag) {
      const node: GraphNode | undefined = nodeMap.get(drag.id);
      if (node) {
        node.x = px - drag.ox;
        node.y = py - drag.oy;
        draw();
      }
      return;
    }

    const port: PortHit | null = hitPort(px, py);
    const node: GraphNode | null = hitNode(px, py);
    $canvas.css("cursor", port ? "crosshair" : node ? "grab" : "default");
  });

  $canvas.on("mouseup", (e: JQuery.MouseUpEvent): void => {
    const [px, py]: [number, number] = toCanvas(e);

    if (connecting) {
      const port: PortHit | null = hitPort(px, py);
      if (port && port.node.id !== connecting.fromId) {
        const from: string = connecting.fromId;
        const to: string = port.node.id;
        const idx: number = edges.findIndex(
          (edge: GraphEdge): boolean => edge.from === from && edge.to === to
        );
        if (idx >= 0) edges.splice(idx, 1);
        else edges.push({ from, to });
        draw();
      }
      connecting = null;
    }

    drag = null;
    $canvas.css("cursor", "default");
  });

  // Close modal
  $close.on("click", (): void => {
    $modal.addClass("hidden");
  });

  $modal.on("click", function (this: HTMLElement, e: JQuery.ClickEvent): void {
    if (e.target === $modal[0]) $modal.addClass("hidden");
  });

  new ResizeObserver((): void => {
    if (!$modal.hasClass("hidden")) resize();
  }).observe(canvas);

  return { open, syncFromRenderer };
}
