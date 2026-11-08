"use client";
/**
 * Main-thread mirror of the latest solver output. Plain mutable module state:
 * scene components read it inside useFrame, nothing here triggers React renders.
 */
import * as THREE from "three";
import type { GridSpec, Vec3 } from "./config";
import type { LineSpec } from "./protocol";
import type { ObjKind } from "./obstacles";

export const field = {
  grid: null as GridSpec | null,
  line: null as LineSpec | null,
  vel: null as Float32Array | null,
  tex: null as Uint8Array | null,
  texture: null as THREE.Data3DTexture | null,
  dirTexture: null as THREE.Data3DTexture | null,
  /** latest pressure force per obstacle kind, newtons (world xyz) */
  forces: {} as Partial<Record<ObjKind, Vec3>>,
  /** increments on every new field */
  version: 0,
  lines: null as null | { pos: Float32Array; spd: Float32Array; tof: Float32Array; len: Uint16Array },
  linesVersion: 0,
  /** fan state as rendered this frame (world) */
  /** extra momentum discs published by source components (blower, smoke machine), world */
  discs: {} as Record<string, { c: Vec3; d: Vec3; R: number; U: number; on: boolean; depth?: number; gain?: number; ducted?: boolean }>,
  /** smoke machine nozzle, world: emits puffs when on */
  smoker: { c: [0, 0.6, 0] as Vec3, d: [1, 0, 0] as Vec3, rate: 0, on: false },
  /** exhaust (suction) fan disc, world */
  exhaust: { c: [0, 1, 0] as Vec3, d: [1, 0, 0] as Vec3, U: 0, on: false },
  fan: { c: [0, 2, 0] as Vec3, d: [1, 0, 0] as Vec3, U: 0, spin: 0, /** current head direction, degrees (base + oscillation) */ headYaw: 0 },
};

function makeTex(data: Uint8Array, nx: number, ny: number, nz: number) {
  const t = new THREE.Data3DTexture(data, nx, ny, nz);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** Field texture (speed, pressure, drag, solid). A 1×1×1 placeholder until the first field arrives. */
export function getFieldTexture(): THREE.Data3DTexture {
  if (!field.texture) field.texture = makeTex(new Uint8Array([0, 128, 0, 0]), 1, 1, 1);
  return field.texture;
}

/** Velocity-direction texture (xyz encoded around 0.5) for surface flow streaks. */
export function getDirTexture(): THREE.Data3DTexture {
  if (!field.dirTexture) field.dirTexture = makeTex(new Uint8Array([128, 128, 128, 255]), 1, 1, 1);
  return field.dirTexture;
}

function upload(cur: THREE.Data3DTexture, data: Uint8Array, g: GridSpec): THREE.Data3DTexture {
  const img = cur.image as { width: number; height: number; depth: number; data: Uint8Array };
  if (img.width !== g.nx || img.height !== g.ny || img.depth !== g.nz) {
    cur.dispose();
    return makeTex(data, g.nx, g.ny, g.nz);
  }
  img.data = data;
  cur.needsUpdate = true;
  return cur;
}

export function uploadField(grid: GridSpec, tex: Uint8Array, dir: Uint8Array) {
  field.texture = upload(getFieldTexture(), tex, grid);
  field.dirTexture = upload(getDirTexture(), dir, grid);
}

/** Trilinear velocity at a world point from the latest field. Returns speed. */
export function sampleVel(x: number, y: number, z: number, out: Vec3): number {
  const g = field.grid;
  const vel = field.vel;
  if (!g || !vel) {
    out[0] = out[1] = out[2] = 0;
    return 0;
  }
  const { nx, ny, nz, h, min } = g;
  let gx = (x - min[0]) / h - 0.5;
  let gy = (y - min[1]) / h - 0.5;
  let gz = (z - min[2]) / h - 0.5;
  gx = gx < 0 ? 0 : gx > nx - 1.001 ? nx - 1.001 : gx;
  gy = gy < 0 ? 0 : gy > ny - 1.001 ? ny - 1.001 : gy;
  gz = gz < 0 ? 0 : gz > nz - 1.001 ? nz - 1.001 : gz;
  const i0 = gx | 0;
  const j0 = gy | 0;
  const k0 = gz | 0;
  const fx = gx - i0;
  const fy = gy - j0;
  const fz = gz - k0;
  let a = 0;
  let b = 0;
  let c = 0;
  for (let dk = 0; dk < 2; dk++)
    for (let dj = 0; dj < 2; dj++)
      for (let di = 0; di < 2; di++) {
        const wt = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
        const o = 3 * (i0 + di + nx * (j0 + dj + ny * (k0 + dk)));
        a += vel[o] * wt;
        b += vel[o + 1] * wt;
        c += vel[o + 2] * wt;
      }
  out[0] = a;
  out[1] = b;
  out[2] = c;
  return Math.sqrt(a * a + b * b + c * c);
}

/** True if the cell containing the point is solid (alpha channel of the packed field). */
export function solidAt(x: number, y: number, z: number): boolean {
  const g = field.grid;
  const tex = field.tex;
  if (!g || !tex) return false;
  const i = Math.floor((x - g.min[0]) / g.h);
  const j = Math.floor((y - g.min[1]) / g.h);
  const k = Math.floor((z - g.min[2]) / g.h);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return false;
  return tex[4 * (i + g.nx * (j + g.ny * k)) + 3] > 127;
}
