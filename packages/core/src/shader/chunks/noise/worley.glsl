// ── Worley noise ─────────────────────────────────────────
float _whash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float worley(vec2 p) {
  vec2 i = floor(p);
  float minDist = 1e9;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 pt = neighbor + _whash(i + neighbor) - fract(p);
      minDist = min(minDist, dot(pt, pt));
    }
  }
  return 1.0 - sqrt(minDist);
}
