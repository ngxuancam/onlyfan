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
 * Smoke-gun visualisation: a rake of nozzles just in front of the guard emits a steady
 * stream of soft puffs. Each puff is advected through the solver's velocity field, so the
 * trails are true streaklines: they curl over the car, squeeze through windows and
 * spread as they age (a small random walk stands in for sub-grid turbulent mixing).
 */
const sVertex = /* glsl */ `
attribute float aAge;
attribute float aSeed;
uniform float uSize;
varying float vAge;
varying float vSeed;
void main() {
  vAge = aAge; vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // puffs leave the nozzle as a thin filament and billow out
  float grow = 0.04 + 0.42 * sqrt(aAge);
  gl_PointSize = uSize * grow / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const sFragment = /* glsl */ `
uniform float uOpacity;
uniform vec3 uLo;
uniform vec3 uHi;
varying float vAge;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  if (vAge > 5.5) discard;
  vec2 d = gl_PointCoord - 0.5;
  float a = vSeed * 6.2831;
  d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float n = noise(d * 5.0 + vSeed * 17.0) * 0.6 + noise(d * 11.0 - vSeed * 9.0) * 0.4;
  float soft = (1.0 - smoothstep(0.1, 1.0, r)) * (0.5 + 0.8 * n);
  // dense at the nozzle, thinning out as the smoke mixes into the room
  float life = smoothstep(0.0, 0.05, vAge) * (1.0 - smoothstep(1.5, 5.0, vAge));
  float dens = uOpacity * soft * life / (1.0 + vAge * 1.3);
  vec3 col = mix(uLo, uHi, smoothstep(-0.2, 0.6, n - d.y));
  gl_FragColor = vec4(col, clamp(dens, 0.0, 1.0));
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

export function Smoke({ count }: { count: number }) {
  const visible = useLab((s) => s.layers.smoke || s.objects.smoker.enabled);
  const studio = useLab((s) => s.theme === "studio");
  const nozzles = useMemo(() => rakeNozzles(), []);
  const { geometry, material, state } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAge", new THREE.BufferAttribute(new Float32Array(count).fill(99), 1).setUsage(THREE.DynamicDrawUsage));
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) seed[i] = Math.random();
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(5, 3, 0), 40);
    const m = new THREE.ShaderMaterial({
      vertexShader: sVertex,
      fragmentShader: sFragment,
      uniforms: { uSize: { value: 380 }, uOpacity: { value: 0.3 }, uLo: { value: new THREE.Color(0.6, 0.65, 0.72) }, uHi: { value: new THREE.Color(0.98, 0.98, 0.96) } },
      transparent: true,
      depthWrite: false,
    });
    return { geometry: g, material: m, state: { cursor: 0, carry: 0 } };
  }, [count]);

  const tmp = useMemo(() => ({ v: [0, 0, 0] as Vec3, e1: new THREE.Vector3(), e2: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    if (!field.vel || useLab.getState().view === "2d") return;
    const dt = Math.min(delta, 1 / 30);
    const pos = geometry.attributes.position.array as Float32Array;
    const age = geometry.attributes.aAge.array as Float32Array;
    const fan = field.fan;

    // emit: a fixed total puff rate (the buffer cycles in about 5 s), shared between the
    // rake in front of the stand fan and the smoke machine nozzle
    const st = useLab.getState();
    const rakeOn = st.layers.smoke && fan.U > 0.2;
    const sm = field.smoker;
    const wRake = rakeOn ? 1 : 0;
    const wSmoke = sm.on ? 0.3 + sm.rate * 1.2 : 0;
    const wSum = wRake + wSmoke;
    if (wSum > 0 && !st.paused) {
      tmp.d.set(...fan.d);
      tmp.e1.set(0, 1, 0).cross(tmp.d).normalize();
      tmp.e2.crossVectors(tmp.d, tmp.e1);
      state.carry += (count / 5.2) * dt * Math.min(1, wSum);
      let n = Math.floor(state.carry);
      state.carry -= n;
      const R = FAN_RADIUS;
      while (n-- > 0) {
        const i = state.cursor;
        state.cursor = (state.cursor + 1) % count;
        if (Math.random() * wSum < wRake) {
          const [a, b] = nozzles[(Math.random() * nozzles.length) | 0];
          const ja = a * R + (Math.random() - 0.5) * 0.03;
          const jb = b * R + (Math.random() - 0.5) * 0.03;
          const fw = 0.12 + Math.random() * 0.06;
          pos[i * 3] = fan.c[0] + tmp.d.x * fw + tmp.e1.x * ja + tmp.e2.x * jb;
          pos[i * 3 + 1] = fan.c[1] + tmp.d.y * fw + tmp.e1.y * ja + tmp.e2.y * jb;
          pos[i * 3 + 2] = fan.c[2] + tmp.d.z * fw + tmp.e1.z * ja + tmp.e2.z * jb;
        } else {
          const f = 0.04 + Math.random() * 0.12;
          pos[i * 3] = sm.c[0] + sm.d[0] * f + (Math.random() - 0.5) * 0.05;
          pos[i * 3 + 1] = sm.c[1] + (Math.random() - 0.5) * 0.05;
          pos[i * 3 + 2] = sm.c[2] + sm.d[2] * f + (Math.random() - 0.5) * 0.05;
        }
        age[i] = Math.random() * dt;
      }
    }

    // advect through the solver's field
    for (let i = 0; i < count; i++) {
      if (age[i] > 6) continue;
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      sampleVel(x, y, z, tmp.v);
      // turbulent diffusion grows with age (filament, then plume)
      const k = Math.min(0.9, 0.06 + age[i] * 0.3) * Math.sqrt(dt);
      let nx = x + tmp.v[0] * dt + (Math.random() - 0.5) * k;
      let ny = y + tmp.v[1] * dt + (Math.random() - 0.5) * k * 0.8;
      let nz = z + tmp.v[2] * dt + (Math.random() - 0.5) * k;
      if (ny < 0.03) ny = 0.03;
      if (solidExact(nx, ny, nz)) {
        // hit a body: slide along its surface, keeping the largest part of the step that
        // stays in the air; failing that, lift off the surface a little
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
      pos[i * 3] = nx;
      pos[i * 3 + 1] = ny;
      pos[i * 3 + 2] = nz;
      age[i] += dt;
      if (nx < DOMAIN.min[0] || nx > DOMAIN.max[0] || nz < DOMAIN.min[2] || nz > DOMAIN.max[2] || ny > DOMAIN.max[1]) age[i] = 99;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAge.needsUpdate = true;
  });

  // on the light studio backdrop the smoke needs more body and a cooler shade to read
  useEffect(() => {
    material.uniforms.uLo.value.setRGB(0.56, 0.6, 0.67);
    material.uniforms.uHi.value.setRGB(0.98, 0.98, 0.97);
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
