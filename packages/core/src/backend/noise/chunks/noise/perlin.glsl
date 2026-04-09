// ── Perlin noise ──────────────────────────────────────────
float _phash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float perlin(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = _phash(i);
  float b = _phash(i + vec2(1.0, 0.0));
  float c = _phash(i + vec2(0.0, 1.0));
  float d = _phash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}
