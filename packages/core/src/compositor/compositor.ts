/**
 * @file FBO-based layer compositor for rae-noise.
 *
 * The {@link Compositor} blends individual layer FBO textures onto the canvas
 * using the correct blend modes. It is the final stage of the rendering pipeline,
 * sitting between per-layer plugin rendering and the visible canvas output.
 *
 * ## Pipeline
 *
 * ```
 * [Layer FBOs]  →  Compositor  →  Canvas
 *                    ├─ accumulate layers with blend state (add/multiply/screen)
 *                    ├─ two-pass overlay blend (needs destination color)
 *                    └─ final gamma correction pass (γ = 0.8)
 * ```
 *
 * ## Blend modes
 *
 * | Mode       | Implementation                                         |
 * |------------|--------------------------------------------------------|
 * | `add`      | `blendFunc(SRC_ALPHA, ONE)` — additive                 |
 * | `multiply` | `blendFunc(DST_COLOR, ZERO)` — multiplicative          |
 * | `screen`   | `blendFunc(ONE, ONE_MINUS_SRC_COLOR)` — inverse mult   |
 * | `overlay`  | Custom two-pass shader using ping-pong FBOs             |
 *
 * ## Ping-pong accumulation
 *
 * Most blend modes use a single accumulation FBO with GL blend state. The
 * `overlay` mode needs to read the destination color, which requires a
 * separate read/write pair of FBOs. The compositor maintains two accumulators
 * (A and B) and swaps them after each overlay pass.
 *
 * @see {@link Renderer} for the orchestrator that drives the compositor.
 * @see {@link FBO} for the framebuffer object wrapper.
 */

import type { BlendMode, Layer } from "../types";
import { FBO } from "../webgl/fbo";
import { UniformCache, linkProgram } from "../webgl/program";
import { FULLSCREEN_VERT, bindQuadToProgram, createFullscreenQuad } from "../webgl/quad";

import overlayChunk from "./composite.glsl?raw";

/** Simple composite fragment shader — samples a layer texture and outputs with opacity. */
const COMPOSITE_FRAG_SIMPLE = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_layer;
uniform float u_opacity;

void main() {
  vec4 color = texture(u_layer, v_uv);
  fragColor = vec4(color.rgb, color.a * u_opacity);
}
`;

/** Overlay composite fragment shader — blends source over destination using overlay math. */
const COMPOSITE_FRAG_OVERLAY = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_layer;
uniform sampler2D u_dest;
uniform float u_opacity;

${overlayChunk}

void main() {
  vec4 src = texture(u_layer, v_uv);
  vec4 dst = texture(u_dest, v_uv);
  vec3 blended = overlayBlend(dst.rgb, src.rgb);
  fragColor = vec4(mix(dst.rgb, blended, u_opacity), 1.0);
}
`;

/** Final gamma correction fragment shader — applied to the accumulated scene. */
const GAMMA_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;

void main() {
  vec3 col = texture(u_scene, v_uv).rgb;
  fragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.8)), 1.0);
}
`;

/**
 * FBO-based layer compositor.
 *
 * Manages per-layer framebuffer objects, ping-pong accumulation buffers, and
 * three shader programs (simple blend, overlay blend, gamma correction).
 * Called by the renderer at the end of each frame to composite all layer
 * textures onto the canvas.
 *
 * @see {@link Renderer} for the orchestrator that owns this compositor.
 */
export class Compositor {
  /** WebGL2 context shared with the renderer and all plugins. */
  private gl: WebGL2RenderingContext;

  /** Per-layer FBOs, keyed by layer id. Each layer renders into its own FBO. */
  private layerFBOs = new Map<string, FBO>();

  /** Shared fullscreen quad VAO for all compositor draw calls. */
  private quad: WebGLVertexArrayObject;

  /** Program for simple blend modes (add, multiply, screen). */
  private simpleProgram: WebGLProgram;
  /** Uniform cache for the simple blend program. */
  private simpleUniforms: UniformCache;

  /** Program for overlay blend mode (needs destination texture). */
  private overlayProgram: WebGLProgram;
  /** Uniform cache for the overlay blend program. */
  private overlayUniforms: UniformCache;

  /** Program for the final gamma correction pass. */
  private gammaProgram: WebGLProgram;
  /** Uniform cache for the gamma correction program. */
  private gammaUniforms: UniformCache;

  /** Ping-pong accumulation FBO A. */
  private accumA: FBO | null = null;
  /** Ping-pong accumulation FBO B. */
  private accumB: FBO | null = null;

  /**
   * Create a new compositor.
   *
   * @param gl - The shared WebGL2 rendering context.
   */
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.quad = createFullscreenQuad(gl);

    this.simpleProgram = linkProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG_SIMPLE);
    this.simpleUniforms = new UniformCache(gl, this.simpleProgram);

    this.overlayProgram = linkProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG_OVERLAY);
    this.overlayUniforms = new UniformCache(gl, this.overlayProgram);

    this.gammaProgram = linkProgram(gl, FULLSCREEN_VERT, GAMMA_FRAG);
    this.gammaUniforms = new UniformCache(gl, this.gammaProgram);
  }

  /**
   * Get or create the FBO for a given layer, resizing if needed.
   *
   * @param layerId - The layer id to look up.
   * @param width   - Required FBO width in physical pixels.
   * @param height  - Required FBO height in physical pixels.
   * @returns The layer's FBO, ready to be bound for rendering.
   */
  ensureFBO(layerId: string, width: number, height: number): FBO {
    let fbo = this.layerFBOs.get(layerId);
    if (!fbo) {
      fbo = new FBO(this.gl, width, height);
      this.layerFBOs.set(layerId, fbo);
    } else {
      fbo.resize(width, height);
    }
    return fbo;
  }

  /**
   * Remove and destroy the FBO for a given layer.
   *
   * @param layerId - The layer id whose FBO should be cleaned up.
   */
  removeFBO(layerId: string): void {
    const fbo = this.layerFBOs.get(layerId);
    if (fbo) {
      fbo.destroy();
      this.layerFBOs.delete(layerId);
    }
  }

  /**
   * Composite all visible layer FBO textures onto the canvas.
   *
   * Uses ping-pong accumulation buffers so overlay blend can read the
   * destination. Finishes with a gamma correction pass to the default
   * framebuffer (canvas).
   *
   * @param layers - The full layer stack (visibility is checked per-layer).
   * @param width  - Canvas width in physical pixels.
   * @param height - Canvas height in physical pixels.
   */
  composite(layers: Layer[], width: number, height: number): void {
    const gl = this.gl;

    // Ensure accum buffers exist at the right size
    if (!this.accumA) this.accumA = new FBO(gl, width, height);
    else this.accumA.resize(width, height);
    if (!this.accumB) this.accumB = new FBO(gl, width, height);
    else this.accumB.resize(width, height);

    let readAccum = this.accumA;
    let writeAccum = this.accumB;

    // Clear the first accumulator to black
    readAccum.bind();
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    readAccum.unbind();

    const visibleLayers = layers.filter((l) => l.visible !== false);

    for (const layer of visibleLayers) {
      const layerFbo = this.layerFBOs.get(layer.id);
      if (!layerFbo) continue;

      if (layer.blendMode === "overlay") {
        this.compositeOverlay(layerFbo, readAccum, writeAccum, layer.opacity, width, height);
        // Swap ping-pong
        const tmp = readAccum;
        readAccum = writeAccum;
        writeAccum = tmp;
      } else {
        // Blend directly into readAccum using GL blend state
        readAccum.bind();
        gl.viewport(0, 0, width, height);
        gl.enable(gl.BLEND);
        this.setBlendFunc(layer.blendMode);

        gl.useProgram(this.simpleProgram);
        bindQuadToProgram(gl, this.simpleProgram, this.quad);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, layerFbo.texture);
        gl.uniform1i(this.simpleUniforms.get("u_layer"), 0);
        gl.uniform1f(this.simpleUniforms.get("u_opacity"), layer.opacity);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND);
        readAccum.unbind();
      }
    }

    // Final gamma pass to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.gammaProgram);
    bindQuadToProgram(gl, this.gammaProgram, this.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readAccum.texture);
    gl.uniform1i(this.gammaUniforms.get("u_scene"), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Composite a single layer using the overlay blend mode. Requires reading
   * the destination color, so it renders to a separate write FBO.
   */
  private compositeOverlay(
    layerFbo: FBO,
    destAccum: FBO,
    writeAccum: FBO,
    opacity: number,
    width: number,
    height: number
  ): void {
    const gl = this.gl;

    writeAccum.bind();
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.overlayProgram);
    bindQuadToProgram(gl, this.overlayProgram, this.quad);

    // Layer texture on unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, layerFbo.texture);
    gl.uniform1i(this.overlayUniforms.get("u_layer"), 0);

    // Destination (accumulated so far) on unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, destAccum.texture);
    gl.uniform1i(this.overlayUniforms.get("u_dest"), 1);

    gl.uniform1f(this.overlayUniforms.get("u_opacity"), opacity);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    writeAccum.unbind();
  }

  /**
   * Set the WebGL blend function for a given blend mode.
   *
   * @param mode - The blend mode to configure.
   */
  private setBlendFunc(mode: BlendMode): void {
    const gl = this.gl;
    gl.blendEquation(gl.FUNC_ADD);
    switch (mode) {
      case "add":
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      case "multiply":
        gl.blendFunc(gl.DST_COLOR, gl.ZERO);
        break;
      case "screen":
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        break;
      case "overlay":
        // Handled separately via compositeOverlay
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        break;
    }
  }

  /**
   * Resize all managed FBOs to match new canvas dimensions.
   *
   * @param width  - New width in physical pixels.
   * @param height - New height in physical pixels.
   */
  resize(width: number, height: number): void {
    for (const fbo of this.layerFBOs.values()) {
      fbo.resize(width, height);
    }
    this.accumA?.resize(width, height);
    this.accumB?.resize(width, height);
  }

  /**
   * Release all GPU resources owned by the compositor.
   * Called when the renderer is destroyed.
   */
  destroy(): void {
    for (const fbo of this.layerFBOs.values()) {
      fbo.destroy();
    }
    this.layerFBOs.clear();
    this.accumA?.destroy();
    this.accumB?.destroy();
    this.gl.deleteProgram(this.simpleProgram);
    this.gl.deleteProgram(this.overlayProgram);
    this.gl.deleteProgram(this.gammaProgram);
    this.gl.deleteVertexArray(this.quad);
  }
}
