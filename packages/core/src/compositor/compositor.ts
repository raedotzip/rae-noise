import type { BlendMode, Layer } from "../types";
import { FBO } from "../webgl/fbo";
import { UniformCache, linkProgram } from "../webgl/program";
import { FULLSCREEN_VERT, bindQuadToProgram, createFullscreenQuad } from "../webgl/quad";

import overlayChunk from "./composite.glsl?raw";

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

export class Compositor {
  private gl: WebGL2RenderingContext;
  private layerFBOs = new Map<string, FBO>();
  private quad: WebGLVertexArrayObject;

  private simpleProgram: WebGLProgram;
  private simpleUniforms: UniformCache;

  private overlayProgram: WebGLProgram;
  private overlayUniforms: UniformCache;

  private gammaProgram: WebGLProgram;
  private gammaUniforms: UniformCache;

  // Ping-pong FBOs for multi-layer compositing
  private accumA: FBO | null = null;
  private accumB: FBO | null = null;

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

  removeFBO(layerId: string): void {
    const fbo = this.layerFBOs.get(layerId);
    if (fbo) {
      fbo.destroy();
      this.layerFBOs.delete(layerId);
    }
  }

  /**
   * Composites all layer FBO textures onto the default framebuffer (canvas).
   * Uses ping-pong accumulation buffers so overlay blend can read the destination.
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

  resize(width: number, height: number): void {
    for (const fbo of this.layerFBOs.values()) {
      fbo.resize(width, height);
    }
    this.accumA?.resize(width, height);
    this.accumB?.resize(width, height);
  }

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
