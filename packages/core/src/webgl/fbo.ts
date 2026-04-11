/**
 * @file Framebuffer Object (FBO) wrapper for rae-noise.
 *
 * Encapsulates a WebGL framebuffer with an attached RGBA texture, used for
 * off-screen rendering. The renderer allocates one FBO per visible layer
 * (for plugin rendering) and two ping-pong FBOs for compositor accumulation.
 *
 * ## Texture format
 *
 * - Format: `RGBA` / `UNSIGNED_BYTE` (8 bits per channel)
 * - Filtering: `LINEAR` (bilinear for smooth compositing)
 * - Wrapping: `CLAMP_TO_EDGE` (no tiling artifacts)
 *
 * ## Resizing
 *
 * {@link FBO.resize} reallocates the texture storage without recreating the
 * framebuffer or texture objects. This avoids the overhead of `deleteTexture`
 * / `createTexture` on every canvas resize.
 *
 * @example
 * ```ts
 * const fbo = new FBO(gl, 1920, 1080);
 * fbo.bind();
 * // Draw into the FBO...
 * fbo.unbind();
 *
 * // Use the texture:
 * gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
 * ```
 *
 * @see {@link Compositor} which manages FBO lifecycle for layers and accumulators.
 */

/**
 * Framebuffer Object wrapper — a render target backed by an RGBA texture.
 *
 * Create via `new FBO(gl, width, height)`. The framebuffer and texture are
 * created immediately. Call {@link destroy} when done to free GPU resources.
 */
export class FBO {
  /** The underlying WebGL framebuffer object. */
  framebuffer: WebGLFramebuffer;

  /** The RGBA texture attached to this FBO's color attachment 0. */
  texture: WebGLTexture;

  /** Current texture width in physical pixels. */
  width: number;

  /** Current texture height in physical pixels. */
  height: number;

  /**
   * Create a new FBO with a texture of the given dimensions.
   *
   * @param gl     - The WebGL2 rendering context.
   * @param width  - Initial texture width in physical pixels.
   * @param height - Initial texture height in physical pixels.
   * @throws If texture or framebuffer creation fails.
   */
  constructor(
    private gl: WebGL2RenderingContext,
    width: number,
    height: number
  ) {
    this.width = width;
    this.height = height;

    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create texture");
    this.texture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer();
    if (!fb) throw new Error("Failed to create framebuffer");
    this.framebuffer = fb;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Bind this FBO as the current render target. All subsequent draw calls
   * will render into this FBO's texture until {@link unbind} is called.
   */
  bind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
  }

  /**
   * Unbind this FBO, restoring the default framebuffer (canvas) as the
   * render target.
   */
  unbind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  /**
   * Resize the texture backing this FBO. No-op if dimensions haven't changed.
   * Reuses the existing texture and framebuffer objects — only the texture
   * storage is reallocated.
   *
   * @param width  - New width in physical pixels.
   * @param height - New height in physical pixels.
   */
  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Delete the framebuffer and texture, freeing GPU memory.
   * The FBO must not be used after this call.
   */
  destroy(): void {
    this.gl.deleteFramebuffer(this.framebuffer);
    this.gl.deleteTexture(this.texture);
  }
}
