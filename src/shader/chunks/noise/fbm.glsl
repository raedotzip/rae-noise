// ── Fractional Brownian Motion (requires simplex) ─────────
float fbm(vec2 p, int octaves) {
  float value     = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    value     += amplitude * simplex(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
