"use client";
import * as THREE from "three";
import { DOMAIN, DOMAIN_SIZE, VMAX } from "@/sim/config";
import { getDirTexture, getFieldTexture } from "@/sim/field";
import { PALETTE_GLSL } from "@/lib/palette";

/**
 * Obstacle materials are real PBR materials (MeshPhysicalMaterial: car paint with
 * clearcoat, glass, rubber, concrete...) so they take proper lighting, environment
 * reflections and shadows. The wind-load map is injected into the shader: the static
 * pressure of the air touching the surface tints the base colour (red = impact, blue =
 * suction), with iso-contours and surface flow streaks that follow the near-wall velocity.
 */
export const sharedUniforms = {
  uField: { value: getFieldTexture() as THREE.Data3DTexture },
  uDir: { value: getDirTexture() as THREE.Data3DTexture },
  uMin: { value: new THREE.Vector3(...DOMAIN.min) },
  uSize: { value: new THREE.Vector3(...DOMAIN_SIZE) },
  uCell: { value: 0.3 },
  uTime: { value: 0 },
  /** 0 = plain material, 1 = full wind-load map (animated by the scene) */
  uHeat: { value: 1 },
};

const VERT_HEAD = /* glsl */ `
varying vec3 vWindWorld;
varying vec3 vWindNormal;
`;
const VERT_BODY = /* glsl */ `
vec4 wwp = vec4(transformed, 1.0);
vec3 wwn = objectNormal;
#ifdef USE_INSTANCING
wwp = instanceMatrix * wwp;
wwn = mat3(instanceMatrix) * wwn;
#endif
vWindWorld = (modelMatrix * wwp).xyz;
vWindNormal = normalize(mat3(modelMatrix) * wwn);
`;

const FRAG_HEAD = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uField;
uniform sampler3D uDir;
uniform vec3 uMin;
uniform vec3 uSize;
uniform float uCell;
uniform float uTime;
uniform float uHeat;
uniform float uHeatAmount;
varying vec3 vWindWorld;
varying vec3 vWindNormal;
${PALETTE_GLSL}
float wh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wh3(i), wh3(i + vec3(1,0,0)), f.x), mix(wh3(i + vec3(0,1,0)), wh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wh3(i + vec3(0,0,1)), wh3(i + vec3(1,0,1)), f.x), mix(wh3(i + vec3(0,1,1)), wh3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 windLoad(vec3 n, out float amt) {
  vec3 p = vWindWorld + n * uCell * 0.6;
  vec3 uvw = (p - uMin) / uSize;
  vec4 f = texture(uField, uvw);
  float val = clamp(0.15 + (f.g - 0.5) * 2.4, 0.0, 1.0);
  vec3 hm = heat(val);
  float band = abs(fract(val * 14.0) - 0.5);
  hm *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.06, band));
  // surface flow streaks along the tangential near-wall velocity
  vec3 vel = (texture(uDir, uvw).rgb * 2.0 - 1.0) * ${VMAX.toFixed(1)};
  vec3 vt = vel - dot(vel, n) * n;
  float sp = length(vt);
  if (sp > 0.15) {
    vec3 t = vt / sp;
    vec3 b = cross(n, t);
    vec3 q = vec3(dot(vWindWorld, b) * 38.0, dot(vWindWorld, t) * 2.2 - uTime * 1.6, dot(vWindWorld, n) * 6.0);
    float st = smoothstep(0.42, 0.85, wnoise(q) * 0.65 + wnoise(q * vec3(2.1, 1.7, 2.0) + 7.3) * 0.35);
    hm = mix(hm * 0.8, hm * 1.2 + 0.04, st * smoothstep(0.15, 2.0, sp));
  }
  // only where the air actually loads the surface: ambient pressure keeps the real material
  float strength = smoothstep(0.03, 0.22, abs(val - 0.15));
  amt = uHeat * uHeatAmount * strength;
  return hm;
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
vec3 wN = normalize(vWindNormal);
if (!gl_FrontFacing) wN = -wN;
float windAmt;
vec3 windCol = windLoad(wN, windAmt);
diffuseColor.rgb = mix(diffuseColor.rgb, windCol, windAmt);
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
// a little self-illumination so the map still reads in shadow
totalEmissiveRadiance += windCol * windAmt * 0.18;
`;

export interface PbrOpts {
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  opacity?: number;
  /** how strongly the wind-load map tints this surface (1 = fully) */
  heat?: number;
  envMapIntensity?: number;
}

export function makeHeatMaterial(base: THREE.ColorRepresentation, opts: PbrOpts = {}) {
  const opacity = opts.opacity ?? 1;
  const m = new THREE.MeshPhysicalMaterial({
    color: base,
    roughness: opts.roughness ?? 0.6,
    metalness: opts.metalness ?? 0,
    clearcoat: opts.clearcoat ?? 0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.1,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
    envMapIntensity: opts.envMapIntensity ?? 1,
  });
  const heatAmount = { value: opts.heat ?? 0.85 };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, { uHeatAmount: heatAmount });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_HEAD}`)
      .replace("#include <color_fragment>", FRAG_COLOR)
      .replace("#include <emissivemap_fragment>", FRAG_EMISSIVE);
  };
  m.customProgramCacheKey = () => "wind-load-v1";
  return m;
}
