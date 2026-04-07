// ── Domain warp (requires simplex) ───────────────────────
vec2 warpDomain(vec2 p, float t) {
  return vec2(
    simplex(p + vec2(0.0, 0.0) + t * 0.1),
    simplex(p + vec2(5.2, 1.3) + t * 0.1)
  );
}