"use client";
import * as THREE from "three";
import { DOMAIN, DOMAIN_SIZE, VMAX } from "@/sim/config";
import { getDirTexture, getFieldTexture } from "@/sim/field";
import { PALETTE_GLSL } from "@/lib/palette";

/**
 * Surface material for obstacles: a clay/lit look that cross-fades into a map of the wind
 * load on the surface (pressure of the air touching it), overlaid with surface flow streaks
 * that run along the near-wall velocity, like oil-flow / surface-LIC pictures in CFD.
 */
export const sharedUniforms = {
  uField: { value: getFieldTexture() as THREE.Data3DTexture },
  uDir: { value: getDirTexture() as THREE.Data3DTexture },
  uMin: { value: new THREE.Vector3(...DOMAIN.min) },
  uSize: { value: new THREE.Vector3(...DOMAIN_SIZE) },
  uCell: { value: 0.3 },
  uTime: { value: 0 },
  /** 0 = clay, 1 = full heat map (animated by the scene) */
  uHeat: { value: 1 },
};

const vertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uField;
uniform sampler3D uDir;
uniform float uTime;
uniform vec3 uMin;
uniform vec3 uSize;
uniform float uCell;
uniform float uHeat;
uniform vec3 uBase;
uniform float uOpacity;
uniform float uGloss;
varying vec3 vWorld;
varying vec3 vNormal;
${PALETTE_GLSL}
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) n = -n;
  vec3 p = vWorld + n * uCell * 0.6;
  vec4 f = texture(uField, (p - uMin) / uSize);
  // wind load on the surface: static pressure of the air touching it.
  // still air reads cool blue, where the wind slams in turns red, suction (lee, roof) goes deep blue.
  float val = clamp(0.15 + (f.g - 0.5) * 2.4, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.35, 0.85, 0.4));
  float ndl = max(dot(n, L), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 base = uBase * (0.28 + 0.5 * ndl + 0.22 * hemi);
  vec3 hm = heat(val);
  // iso-contour bands, the classic CFD read-out
  float band = abs(fract(val * 14.0) - 0.5);
  float line = 1.0 - smoothstep(0.0, 0.06, band);
  vec3 heatLit = hm * (0.62 + 0.38 * ndl) * (1.0 - 0.18 * line);
  // surface flow streaks: anisotropic noise stretched along the tangential near-wall velocity
  vec3 vel = (texture(uDir, (p - uMin) / uSize).rgb * 2.0 - 1.0) * ${VMAX.toFixed(1)};
  vec3 vt = vel - dot(vel, n) * n;
  float sp = length(vt);
  if (sp > 0.15) {
    vec3 t = vt / sp;
    vec3 b = cross(n, t);
    vec3 q = vec3(dot(vWorld, b) * 38.0, dot(vWorld, t) * 2.2 - uTime * 1.6, dot(vWorld, n) * 6.0);
    float st = vnoise(q) * 0.65 + vnoise(q * vec3(2.1, 1.7, 2.0) + 7.3) * 0.35;
    st = smoothstep(0.42, 0.85, st);
    float amt = smoothstep(0.15, 2.0, sp) * uHeat;
    heatLit = mix(heatLit * 0.72, heatLit * 1.25 + 0.06, st * amt);
  }
  vec3 col = mix(base, heatLit, uHeat);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), 60.0) * uGloss;
  col += vec3(spec) + fres * mix(vec3(0.2, 0.26, 0.34), hm, uHeat) * 0.5;
  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeHeatMaterial(base: THREE.ColorRepresentation, opts: { opacity?: number; gloss?: number } = {}) {
  const opacity = opts.opacity ?? 1;
  const m = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      ...sharedUniforms,
      uBase: { value: new THREE.Color(base) },
      uOpacity: { value: opacity },
      uGloss: { value: opts.gloss ?? 0.35 },
    },
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  });
  return m;
}
