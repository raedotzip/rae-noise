// ── Compositor: samples a layer texture and outputs with opacity ──
// Blend mode is controlled via GL blend state, except overlay which
// needs the destination color and is handled by the overlay variant.

vec3 overlayBlend(vec3 base, vec3 blend) {
  return vec3(
    base.r < 0.5
      ? (2.0 * base.r * blend.r)
      : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r)),
    base.g < 0.5
      ? (2.0 * base.g * blend.g)
      : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g)),
    base.b < 0.5
      ? (2.0 * base.b * blend.b)
      : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b))
  );
}
