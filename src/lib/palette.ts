/**
 * The heat-map palette: blue → cyan → green → yellow → red, as in CFD post-processors.
 * One definition, emitted for GLSL, CSS and JS.
 */
export const STOPS: [number, [number, number, number]][] = [
  [0.0, [0.05, 0.1, 0.55]],
  [0.18, [0.08, 0.35, 1.0]],
  [0.38, [0.0, 0.85, 0.95]],
  [0.55, [0.15, 0.95, 0.35]],
  [0.72, [1.0, 0.92, 0.1]],
  [0.87, [1.0, 0.45, 0.05]],
  [1.0, [0.92, 0.06, 0.08]],
];

export function paletteJS(t: number, out: [number, number, number]) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    if (t <= p1) {
      const [p0, c0] = STOPS[i - 1];
      const f = (t - p0) / (p1 - p0);
      out[0] = c0[0] + (c1[0] - c0[0]) * f;
      out[1] = c0[1] + (c1[1] - c0[1]) * f;
      out[2] = c0[2] + (c1[2] - c0[2]) * f;
      return out;
    }
  }
  const c = STOPS[STOPS.length - 1][1];
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
  return out;
}

const f = (n: number) => n.toFixed(3);

export const PALETTE_GLSL = /* glsl */ `
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = vec3(${STOPS[0][1].map(f).join(",")});
${STOPS.slice(1)
  .map(([p, col], i) => {
    const p0 = STOPS[i][0];
    return `  c = mix(c, vec3(${col.map(f).join(",")}), clamp((t - ${f(p0)}) / ${f(p - p0)}, 0.0, 1.0));`;
  })
  .join("\n")}
  return c;
}
`;

export const PALETTE_CSS = `linear-gradient(90deg, ${STOPS.map(
  ([p, c]) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")}) ${Math.round(p * 100)}%`,
).join(", ")})`;
