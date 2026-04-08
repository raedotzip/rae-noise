// ── Curl noise (requires simplex) ────────────────────────
// Computes the 2D curl of the simplex noise field.
// curl(F) = (dFy/dx - dFx/dy) — gives a divergence-free flow vector.
vec2 curlNoise(vec2 p) {
  const float eps = 0.001;
  float n1 = simplex(p + vec2(0.0,  eps));
  float n2 = simplex(p - vec2(0.0,  eps));
  float n3 = simplex(p + vec2(eps,  0.0));
  float n4 = simplex(p - vec2(eps,  0.0));
  float dNdx = (n3 - n4) / (2.0 * eps);
  float dNdy = (n1 - n2) / (2.0 * eps);
  // Rotate gradient 90° to get the curl
  return vec2(dNdy, -dNdx);
}

// Returns a scalar for palette mapping: magnitude of curl vector
float curl(vec2 p) {
  vec2 c = curlNoise(p);
  return length(c) * 2.0 - 1.0; // remap to roughly [-1, 1]
}