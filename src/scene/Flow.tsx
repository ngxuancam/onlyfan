"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { DOMAIN, DOMAIN_SIZE, FAN_RADIUS, VMAX, type Vec3 } from "@/sim/config";
import { field, sampleVel } from "@/sim/field";
import { solidExact } from "@/sim/collide";
import type { LineSpec } from "@/sim/protocol";
import { PALETTE_GLSL } from "@/lib/palette";
import { useLab } from "@/lib/store";
import { sharedUniforms } from "./heatMaterial";

/* ========================================================= streamlines */

const lineVertex = /* glsl */ `
attribute vec3 aTangent;
attribute float aSide;
attribute float aSpeed;
attribute float aTof;
attribute float aFade;
uniform float uWidth;
varying float vSpeed;
varying float vTof;
varying float vFade;
varying float vSide;
void main() {
  vec3 viewDir = normalize(cameraPosition - position);
  vec3 off = normalize(cross(aTangent, viewDir) + 1e-6);
  vec3 p = position + off * aSide * uWidth * (0.7 + 0.5 * clamp(aSpeed / ${VMAX.toFixed(1)}, 0.0, 1.0));
  vSpeed = aSpeed; vTof = aTof; vFade = aFade; vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const lineFragment = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying float vSpeed;
varying float vTof;
varying float vFade;
varying float vSide;
${PALETTE_GLSL}
void main() {
  if (vFade <= 0.001) discard;
  vec3 c = heat(vSpeed / ${VMAX.toFixed(1)});
  // pulses travel along the line at the local flow speed (time-of-flight phase)
  float ph = fract(vTof * 0.9 - uTime * 0.9);
  float pulse = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.5, ph));
  float edge = 1.0 - vSide * vSide;
  float a = uAlpha * vFade * (0.38 + 0.62 * pulse) * (0.35 + 0.65 * edge);
  gl_FragColor = vec4(c * (0.75 + 0.6 * pulse), a);
  #include <colorspace_fragment>
}
`;

export function Streamlines({ spec }: { spec: LineSpec }) {
  const visible = useLab((s) => s.layers.streamlines);
  const { geometry, material } = useMemo(() => {
    const { lines, steps } = spec;
    const P = lines * steps;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(P * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aTangent", new THREE.BufferAttribute(new Float32Array(P * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSpeed", new THREE.BufferAttribute(new Float32Array(P * 2), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aTof", new THREE.BufferAttribute(new Float32Array(P * 2), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aFade", new THREE.BufferAttribute(new Float32Array(P * 2), 1).setUsage(THREE.DynamicDrawUsage));
    const side = new Float32Array(P * 2);
    for (let i = 0; i < P; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    const idx = new Uint32Array(lines * (steps - 1) * 6);
    let o = 0;
    for (let l = 0; l < lines; l++)
      for (let s = 0; s < steps - 1; s++) {
        const a = (l * steps + s) * 2;
        idx[o++] = a;
        idx[o++] = a + 1;
        idx[o++] = a + 2;
        idx[o++] = a + 1;
        idx[o++] = a + 3;
        idx[o++] = a + 2;
      }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(5, 3, 0), 40);
    const m = new THREE.ShaderMaterial({
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      uniforms: { uTime: sharedUniforms.uTime, uWidth: { value: 0.022 }, uAlpha: { value: 0.95 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, [spec]);

  const seen = useRef(-1);
  useFrame(() => {
    const L = field.lines;
    if (!L || field.linesVersion === seen.current) return;
    seen.current = field.linesVersion;
    const { lines, steps } = spec;
    const pos = geometry.attributes.position.array as Float32Array;
    const tan = geometry.attributes.aTangent.array as Float32Array;
    const spd = geometry.attributes.aSpeed.array as Float32Array;
    const tof = geometry.attributes.aTof.array as Float32Array;
    const fade = geometry.attributes.aFade.array as Float32Array;
    for (let l = 0; l < lines; l++) {
      const n = L.len[l];
      for (let s = 0; s < steps; s++) {
        const i = l * steps + s;
        const src = l * steps + Math.min(s, Math.max(0, n - 1));
        const nxt = l * steps + Math.min(s + 1, Math.max(0, n - 1));
        const prv = l * steps + Math.max(0, Math.min(s, n - 1) - 1);
        const x = L.pos[src * 3];
        const y = L.pos[src * 3 + 1];
        const z = L.pos[src * 3 + 2];
        let tx = L.pos[nxt * 3] - L.pos[prv * 3];
        let ty = L.pos[nxt * 3 + 1] - L.pos[prv * 3 + 1];
        let tz = L.pos[nxt * 3 + 2] - L.pos[prv * 3 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        // fade in near the fan, out towards the end of the line
        const u = n > 1 ? s / (n - 1) : 1;
        const f = s >= n || n < 3 ? 0 : Math.min(1, s / 4) * Math.min(1, (1 - u) * 5);
        for (let k = 0; k < 2; k++) {
          const v = i * 2 + k;
          pos[v * 3] = x;
          pos[v * 3 + 1] = y;
          pos[v * 3 + 2] = z;
          tan[v * 3] = tx;
          tan[v * 3 + 1] = ty;
          tan[v * 3 + 2] = tz;
          spd[v] = L.spd[src];
          tof[v] = L.tof[src];
          fade[v] = f;
        }
      }
    }
    for (const k of ["position", "aTangent", "aSpeed", "aTof", "aFade"]) geometry.attributes[k].needsUpdate = true;
  });

  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} visible={visible} frustumCulled={false} renderOrder={5} />;
}

/* =============================================================== smoke */

/**
 * Two kinds of smoke share one particle buffer:
 *  - the *rake* in front of the stand fan: thin streaklines, advected purely by the solver;
 *  - the *smoke machine* cloud: big, dense, slowly billowing puffs (think of a smoke
 *    grenade). Each puff leaves the nozzle with its own momentum that decays in a second or
 *    two, then rides the solver's wind, spreading and filling the space for ~11 s.
 * Puffs collide with the exact body shapes and fade near the floor so they never show a
 * hard line where a sprite cuts into the ground.
 */
const sVertex = /* glsl */ `
attribute float aAge;
attribute float aSeed;
attribute float aKind;
uniform float uSize;
varying float vAge;
varying float vSeed;
varying float vKind;
varying float vY;
varying float vGrow;
void main() {
  vAge = aAge; vSeed = aSeed; vKind = aKind; vY = position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // rake: a thin filament that widens; cloud: big puffs that keep billowing out
  float grow = aKind < 0.5 ? 0.04 + 0.42 * sqrt(aAge) : 0.4 + 1.25 * sqrt(aAge) + 0.08 * aAge;
  vGrow = grow;
  gl_PointSize = min(uSize * grow / -mv.z, 420.0);
  gl_Position = projectionMatrix * mv;
}
`;
const sFragment = /* glsl */ `
uniform float uOpacity;
uniform vec3 uLo;
uniform vec3 uHi;
varying float vAge;
varying float vSeed;
varying float vKind;
varying float vY;
varying float vGrow;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 5-octave fbm, as in a hand-made gun-smoke shader: gives the wispy, curdled edges
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += amp * noise(p);
    p *= 2.1;
    amp *= 0.5;
  }
  return v;
}
void main() {
  bool cloud = vKind > 0.5;
  float maxAge = cloud ? 11.5 : 5.5;
  if (vAge > maxAge) discard;
  vec2 d = gl_PointCoord - 0.5;
  float a = vSeed * 6.2831;
  d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  // noise scrolls through the puff as it ages, so the smoke keeps curling
  vec2 uv = d * vec2(2.0, 2.4) * 2.2 + vSeed * 11.0;
  uv.x -= vAge * 0.35;
  float n = fbm(uv);
  float radial = smoothstep(1.0, 0.1, r);
  // thresholded fbm: dense curdled core, ragged wisps at the edge
  float soft = cloud ? smoothstep(0.15, 0.75, n * radial * 1.35) * 1.6 : smoothstep(0.05, 0.6, n * radial * 1.2) * 1.3;
  float life = cloud
    ? smoothstep(0.0, 0.15, vAge) * (1.0 - smoothstep(7.5, 11.5, vAge))
    : smoothstep(0.0, 0.05, vAge) * (1.0 - smoothstep(1.5, 5.0, vAge));
  float dens = cloud ? uOpacity * 1.25 * soft * life / (1.0 + vAge * 0.22) : uOpacity * soft * life / (1.0 + vAge * 1.3);
  // no hard edge where a big puff meets the floor
  dens *= smoothstep(0.0, 0.18 + 0.25 * vGrow, vY);
  // self-shadowed: darker underside and core, lit top
  float lit = smoothstep(-0.25, 0.55, n - d.y * 1.2);
  vec3 col = mix(uLo * (cloud ? 0.82 : 1.0), uHi, lit);
  gl_FragColor = vec4(col, clamp(dens, 0.0, 0.95));
  #include <colorspace_fragment>
}
`;

/** nozzle offsets across the blade disc, in units of the disc radius (e1 = horizontal, e2 = vertical) */
function rakeNozzles(): [number, number][] {
  const out: [number, number][] = [];
  // a cross-shaped wand held in front of the fan
  for (let i = -3; i <= 3; i++) out.push([0, i * 0.27]);
  for (const i of [-3, -2, -1, 1, 2, 3]) out.push([i * 0.27, 0]);
  return out;
}

export function Smoke({ count, octaves }: { count: number; octaves: number }) {
  const visible = useLab((s) => s.layers.smoke || s.objects.smoker.enabled);
  const studio = useLab((s) => s.theme === "studio");
  const nozzles = useMemo(() => rakeNozzles(), []);
  const { geometry, material, state } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAge", new THREE.BufferAttribute(new Float32Array(count).fill(99), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(5, 3, 0), 40);
    const m = new THREE.ShaderMaterial({
      vertexShader: sVertex,
      fragmentShader: sFragment,
      defines: { OCTAVES: octaves },
      uniforms: { uSize: { value: 380 }, uOpacity: { value: 0.3 }, uLo: { value: new THREE.Color("#7b8696") }, uHi: { value: new THREE.Color("#e2e8f0") } },
      transparent: true,
      depthWrite: false,
    });
    // own (ballistic) velocity of each puff, decays to zero: the nozzle push and the billow
    const own = new Float32Array(count * 3);
    // per-puff phases for a smooth swirl (instead of a per-frame random kick, which jitters)
    const ph = Float32Array.from({ length: count * 3 }, () => Math.random() * Math.PI * 2);
    return { geometry: g, material: m, state: { cursor: 0, rakeCarry: 0, cloudCarry: 0, own, ph, frame: 0, t: 0 } };
  }, [count, octaves]);

  const tmp = useMemo(() => ({ v: [0, 0, 0] as Vec3, e1: new THREE.Vector3(), e2: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    if (!field.vel || useLab.getState().view === "2d") return;
    const dt = Math.min(delta, 1 / 30);
    const pos = geometry.attributes.position.array as Float32Array;
    const age = geometry.attributes.aAge.array as Float32Array;
    const kind = geometry.attributes.aKind.array as Float32Array;
    const own = state.own;
    const fan = field.fan;
    const st = useLab.getState();
    const sm = field.smoker;
    const take = () => {
      const i = state.cursor;
      state.cursor = (state.cursor + 1) % count;
      return i;
    };

    if (!st.paused) {
      // rake: thin streaklines from the stand fan
      if (st.layers.smoke && fan.U > 0.2) {
        tmp.d.set(...fan.d);
        tmp.e1.set(0, 1, 0).cross(tmp.d).normalize();
        tmp.e2.crossVectors(tmp.d, tmp.e1);
        state.rakeCarry += (count / 9) * dt;
        const R = FAN_RADIUS;
        for (; state.rakeCarry >= 1; state.rakeCarry--) {
          const i = take();
          const [a, b] = nozzles[(Math.random() * nozzles.length) | 0];
          const ja = a * R + (Math.random() - 0.5) * 0.03;
          const jb = b * R + (Math.random() - 0.5) * 0.03;
          const fw = 0.12 + Math.random() * 0.06;
          pos[i * 3] = fan.c[0] + tmp.d.x * fw + tmp.e1.x * ja + tmp.e2.x * jb;
          pos[i * 3 + 1] = fan.c[1] + tmp.d.y * fw + tmp.e1.y * ja + tmp.e2.y * jb;
          pos[i * 3 + 2] = fan.c[2] + tmp.d.z * fw + tmp.e1.z * ja + tmp.e2.z * jb;
          own[i * 3] = own[i * 3 + 1] = own[i * 3 + 2] = 0;
          kind[i] = 0;
          age[i] = Math.random() * dt;
        }
      }
      // smoke machine: a dense billowing cloud
      if (sm.on && sm.rate > 0) {
        const jet = useLab.getState().params.smokeJet;
        state.cloudCarry += (count / 34) * (0.25 + sm.rate) * dt;
        for (; state.cloudCarry >= 1; state.cloudCarry--) {
          const i = take();
          pos[i * 3] = sm.c[0] + sm.d[0] * 0.08 + (Math.random() - 0.5) * 0.04;
          pos[i * 3 + 1] = sm.c[1] + (Math.random() - 0.5) * 0.04;
          pos[i * 3 + 2] = sm.c[2] + sm.d[2] * 0.08 + (Math.random() - 0.5) * 0.04;
          // out of the nozzle at speed, with a wide random spread that makes it billow
          const push = 1.5 + jet * 4 + Math.random() * 1.5;
          let rx = Math.random() * 2 - 1;
          let ry = Math.random() * 2 - 1;
          let rz = Math.random() * 2 - 1;
          const rl = Math.hypot(rx, ry, rz) || 1;
          rx /= rl;
          ry /= rl;
          rz /= rl;
          const spread = 0.6 + Math.random() * 1.4;
          own[i * 3] = sm.d[0] * push + rx * spread;
          own[i * 3 + 1] = sm.d[1] * push + Math.abs(ry) * spread * 0.6;
          own[i * 3 + 2] = sm.d[2] * push + rz * spread;
          kind[i] = 1;
          age[i] = Math.random() * dt;
        }
      }
    }

    // advect: solver wind + the puff's own decaying momentum + turbulent mixing.
    // Exact collision is checked on alternate halves of the buffer each frame (cheap, and a
    // puff never moves far enough in two frames to cross a body).
    const decay = Math.exp(-1.3 * dt);
    state.t += dt;
    const half = state.frame++ & 1;
    for (let i = 0; i < count; i++) {
      const cloud = kind[i] > 0.5;
      if (age[i] > (cloud ? 12 : 6)) continue;
      const o = i * 3;
      const x = pos[o];
      const y = pos[o + 1];
      const z = pos[o + 2];
      sampleVel(x, y, z, tmp.v);
      own[o] *= decay;
      own[o + 1] *= decay;
      own[o + 2] *= decay;
      // turbulent mixing as a smooth swirl: varies slowly in time and space, grows with age
      const amp = cloud ? Math.min(0.7, 0.18 + age[i] * 0.08) : Math.min(0.4, 0.04 + age[i] * 0.12);
      const t = state.t;
      const p = state.ph;
      const tx = amp * Math.sin(t * 0.9 + p[o] + y * 1.3 + z * 0.7);
      const ty = amp * 0.55 * Math.sin(t * 0.7 + p[o + 1] + x * 0.9 + z * 1.1);
      const tz = amp * Math.sin(t * 0.8 + p[o + 2] + x * 1.1 + y * 0.6);
      // a cloud slowly lifts as it spreads
      const lift = cloud ? 0.06 : 0;
      let nx = x + (tmp.v[0] + own[o] + tx) * dt;
      let ny = y + (tmp.v[1] + own[o + 1] + lift + ty) * dt;
      let nz = z + (tmp.v[2] + own[o + 2] + tz) * dt;
      if (ny < 0.03) {
        ny = 0.03;
        own[o + 1] = Math.abs(own[o + 1]) * 0.3;
      }
      if ((i & 1) === half && solidExact(nx, ny, nz)) {
        // hit a body: slide along its surface, keeping the largest part of the step that
        // stays in the air; failing that, lift off the surface a little
        own[o] *= 0.4;
        own[o + 1] *= 0.4;
        own[o + 2] *= 0.4;
        if (!solidExact(nx, ny, z)) nz = z;
        else if (!solidExact(nx, y, nz)) ny = y;
        else if (!solidExact(x, ny, nz)) nx = x;
        else if (!solidExact(x, ny, z)) {
          nx = x;
          nz = z;
        } else if (!solidExact(nx, y, z)) {
          ny = y;
          nz = z;
        } else if (!solidExact(x, y + 0.05, z)) {
          nx = x;
          ny = y + 0.05;
          nz = z;
        } else age[i] = 99;
      }
      pos[o] = nx;
      pos[o + 1] = ny;
      pos[o + 2] = nz;
      age[i] += dt;
      if (nx < DOMAIN.min[0] || nx > DOMAIN.max[0] || nz < DOMAIN.min[2] || nz > DOMAIN.max[2] || ny > DOMAIN.max[1]) age[i] = 99;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAge.needsUpdate = true;
    geometry.attributes.aKind.needsUpdate = true;
  });

  useEffect(() => {
    material.uniforms.uOpacity.value = studio ? 0.34 : 0.3;
  }, [material, studio]);

  return <points geometry={geometry} material={material} visible={visible} frustumCulled={false} renderOrder={6} />;
}

/* ============================================================== ground */

const gVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const gFragment = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uField;
uniform vec3 uMin;
uniform vec3 uSize;
uniform float uCell;
uniform float uGround;
uniform float uStudio;
uniform vec3 uBg;
varying vec3 vWorld;
${PALETTE_GLSL}
float gridLine(vec2 p, float step, float w) {
  vec2 g = abs(fract(p / step - 0.5) - 0.5) * step;
  vec2 fw = fwidth(p) * w;
  vec2 l = 1.0 - smoothstep(vec2(0.0), fw, g);
  return max(l.x, l.y);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vn2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 uvw = (vec3(vWorld.x, uCell * 1.5, vWorld.z) - uMin) / uSize;
  vec2 inside2 = step(vec2(0.0), uvw.xz) * step(uvw.xz, vec2(1.0));
  float inside = inside2.x * inside2.y;
  vec4 f = texture(uField, uvw);
  float val = f.r;

  // lab floor: grey epoxy with a little mottling and 2 m tile seams
  float mott = vn2(vWorld.xz * 1.3) * 0.6 + vn2(vWorld.xz * 6.0) * 0.4;
  vec3 base = vec3(0.155, 0.165, 0.178) * (0.92 + 0.12 * mott);
  // the test zone (simulated volume) is a slightly darker, cooler pad
  base = mix(base, vec3(0.11, 0.125, 0.14) * (0.94 + 0.1 * mott), inside);
  float seam = gridLine(vWorld.xz, 2.0, 1.0);
  base *= 1.0 - 0.22 * seam;

  // signed distance (m) to the test-zone border, positive outside
  vec2 d2 = max(uMin.xz - vWorld.xz, vWorld.xz - (uMin.xz + uSize.xz));
  float dOut = max(d2.x, d2.y);
  // hazard band just outside the zone: yellow/black diagonal stripes
  float bandMask = step(0.05, dOut) * (1.0 - step(0.33, dOut));
  float stripe = step(0.5, fract((vWorld.x + vWorld.z) * 2.6));
  vec3 hazard = mix(vec3(0.05), vec3(0.95, 0.72, 0.08), stripe);
  base = mix(base, hazard * 0.85, bandMask);
  // walkway lines along the hall
  float walk = (1.0 - smoothstep(0.04, 0.06, abs(abs(vWorld.z) - 7.6))) * step(-10.5, vWorld.x) * step(vWorld.x, 20.5);
  base = mix(base, vec3(0.9, 0.7, 0.1) * 0.8, walk);

  // wind-speed map on the pad
  float amt = smoothstep(0.02, 0.35, val);
  vec3 hm = heat(val);
  float band = abs(fract(val * 14.0) - 0.5);
  float iso = 1.0 - smoothstep(0.0, 0.07, band);
  vec3 col = mix(base, base * 0.35 + hm * (0.1 + 0.6 * amt), uGround * inside * (0.25 + 0.75 * amt));
  col *= 1.0 - 0.25 * iso * amt * uGround * inside;
  // soft contact shadow under solid obstacles
  col *= 1.0 - 0.5 * f.a * inside;
  // 1 m measuring grid inside the zone only
  float minor = gridLine(vWorld.xz, 1.0, 1.0);
  col += vec3(0.55, 0.65, 0.8) * minor * 0.05 * inside;
  // ceiling light strips reflected on the epoxy (fake, cheap)
  float refl = (1.0 - smoothstep(0.0, 0.9, abs(fract((vWorld.z + 9.0) / 4.5) - 0.5) * 4.5)) * 0.05;
  col += vec3(0.8, 0.88, 1.0) * refl * (1.0 - inside * 0.5);
  // test hall: beyond its walls there is only the dark backdrop
  vec2 hallD = max(vec2(-11.0, -9.5) - vWorld.xz, vWorld.xz - vec2(21.0, 9.5));
  col = mix(col, uBg, step(0.0, max(hallD.x, hallD.y)));

  // studio: dark polished concrete with the softboxes mirrored in it, melting into the cyclorama
  vec3 scol = vec3(0.055, 0.059, 0.066) * (0.86 + 0.22 * mott);
  float sMinor = gridLine(vWorld.xz, 1.0, 1.0);
  float sMajor = gridLine(vWorld.xz, 5.0, 1.6);
  scol += vec3(0.55, 0.62, 0.72) * (sMinor * 0.018 + sMajor * 0.035) * inside;
  // softbox reflections: two long soft stripes, brighter towards the viewer (fresnel-ish)
  float sb = exp(-pow((vWorld.z + 2.6) / 0.9, 2.0)) + exp(-pow((vWorld.z - 2.6) / 0.9, 2.0));
  sb *= smoothstep(-6.0, -3.0, vWorld.x) * (1.0 - smoothstep(11.0, 14.0, vWorld.x));
  scol += vec3(0.75, 0.8, 0.9) * sb * (0.05 + 0.05 * mott);
  float edgeLine = 1.0 - smoothstep(0.0, fwidth(dOut) * 1.5, abs(dOut));
  float dash = step(0.45, fract((vWorld.x + vWorld.z) * 1.2));
  scol = mix(scol, vec3(0.55, 0.6, 0.66), edgeLine * dash * 0.45);
  scol = mix(scol, mix(scol * 0.55, hm, 0.8), uGround * inside * (0.25 + 0.75 * amt));
  scol *= 1.0 - 0.32 * f.a * inside;
  float dist = length(vWorld.xz - vec2(5.0, 0.0));
  scol = mix(scol, uBg, smoothstep(16.0, 48.0, dist));
  col = mix(col, scol, uStudio);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function Ground() {
  const groundHeat = useLab((s) => s.layers.groundHeat);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: gVertex,
        fragmentShader: gFragment,
        uniforms: { ...sharedUniforms, uGround: { value: 1 }, uStudio: { value: 1 }, uBg: { value: new THREE.Color(STUDIO_BG) } },
      }),
    [],
  );
  useFrame((_, dt) => {
    const u = material.uniforms.uGround;
    u.value += ((groundHeat ? 1 : 0) - u.value) * Math.min(1, dt * 6);
    const studio = useLab.getState().theme === "studio";
    const us = material.uniforms.uStudio;
    us.value += ((studio ? 1 : 0) - us.value) * Math.min(1, dt * 5);
    (material.uniforms.uBg.value as THREE.Color).set(studio ? STUDIO_BG : HALL_BG);
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[5, 0, 0]} material={material} renderOrder={-1}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  );
}

export const STUDIO_BG = "#202329";
export const HALL_BG = "#0b0d11";

/** Faint wireframe of the simulated volume. */
export function DomainBox() {
  const geo = useMemo(() => {
    const b = new THREE.BoxGeometry(...DOMAIN_SIZE);
    b.translate(DOMAIN.min[0] + DOMAIN_SIZE[0] / 2, DOMAIN_SIZE[1] / 2, DOMAIN.min[2] + DOMAIN_SIZE[2] / 2);
    return new THREE.EdgesGeometry(b);
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#f2b31a" transparent opacity={0.14} />
    </lineSegments>
  );
}
