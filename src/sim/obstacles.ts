/**
 * Obstacle shapes, described once as simple primitives.
 * The worker voxelises them into the fluid grid; the renderer builds meshes from
 * the same list, so what you see is what the air feels.
 *
 * All coordinates are in the object's local frame (metres), origin on the ground.
 * Placement applies a yaw about +Y with the same convention as three.js
 * (`rotation.y = yaw`): local +X maps to world (cos yaw, 0, -sin yaw).
 */
import type { Vec3 } from "./config";

export type Part = "body" | "glass" | "wheel" | "wall" | "roof" | "floor" | "trunk" | "foliage";

export type Prim =
  /** box, optionally rolled about its local Z axis (roof slabs) */
  | { t: "box"; c: Vec3; s: Vec3; rz?: number; part: Part }
  /** polygon in the XY plane extruded along Z from z0 to z1 */
  | { t: "prism"; poly: [number, number][]; z0: number; z1: number; part: Part }
  /** cylinder whose axis is Z (wheels) */
  | { t: "cylZ"; c: Vec3; r: number; len: number; part: Part }
  /** vertical cylinder standing on c */
  | { t: "cylY"; c: Vec3; r: number; h: number; part: Part }
  /** porous ellipsoid — slows the air instead of blocking it (foliage) */
  | { t: "ell"; c: Vec3; r: Vec3; drag: number; part: Part };

export type ObjKind = "car" | "house" | "tree" | "shrub";
export const OBJ_KINDS: ObjKind[] = ["car", "house", "tree", "shrub"];

export interface Placement {
  x: number;
  z: number;
  /** radians */
  yaw: number;
}

export interface PlacedObject extends Placement {
  kind: ObjKind;
}

/* ---------------------------------------------------------------- car */

/**
 * An open-wheel race car (F1-like), front at -X: 5.05 m long, 1.95 m wide, 0.98 m high.
 * Side profile of the monocoque + engine cover, extruded to the chassis width.
 */
export const F1_CHASSIS: [number, number][] = [
  [-2.75, 0.14],
  [-2.75, 0.21],
  [-2.2, 0.33],
  [-1.4, 0.47],
  [-0.8, 0.59],
  [-0.45, 0.66],
  [-0.2, 0.78],
  [0.0, 0.97],
  [0.42, 0.97],
  [0.72, 0.8],
  [1.4, 0.6],
  [2.0, 0.48],
  [2.3, 0.42],
  [2.3, 0.12],
  [-1.0, 0.08],
  [-2.2, 0.12],
];

export const F1_WHEELS: { x: number; z: number; r: number; w: number }[] = [
  { x: -1.75, z: -0.8, r: 0.33, w: 0.36 },
  { x: -1.75, z: 0.8, r: 0.33, w: 0.36 },
  { x: 1.62, z: -0.78, r: 0.35, w: 0.44 },
  { x: 1.62, z: 0.78, r: 0.35, w: 0.44 },
];

function car(): Prim[] {
  return [
    { t: "prism", poly: F1_CHASSIS, z0: -0.42, z1: 0.42, part: "body" },
    // sidepods
    { t: "box", c: [0.45, 0.36, -0.6], s: [1.9, 0.48, 0.38], part: "body" },
    { t: "box", c: [0.45, 0.36, 0.6], s: [1.9, 0.48, 0.38], part: "body" },
    // floor / underbody
    { t: "box", c: [0.5, 0.06, 0], s: [3.3, 0.04, 1.5], part: "body" },
    // front wing
    { t: "box", c: [-2.55, 0.12, 0], s: [0.55, 0.05, 1.95], part: "body" },
    // rear wing: main plane + endplates
    { t: "box", c: [2.32, 0.86, 0], s: [0.42, 0.05, 1.0], part: "body" },
    { t: "box", c: [2.32, 0.66, -0.5], s: [0.62, 0.5, 0.03], part: "body" },
    { t: "box", c: [2.32, 0.66, 0.5], s: [0.62, 0.5, 0.03], part: "body" },
    ...F1_WHEELS.map((w): Prim => ({ t: "cylZ", c: [w.x, w.r, w.z], r: w.r, len: w.w, part: "wheel" })),
  ];
}

/* -------------------------------------------------------------- house */

export const HOUSE = { A: 2.1, B: 2.1, T: 0.2, H: 2.4, P: 3.45, overhang: 0.35 };

interface Opening {
  /** centre along the wall */
  c: number;
  w: number;
  y0: number;
  y1: number;
}

/**
 * A straight wall with rectangular openings, split into solid boxes.
 * `axis` is the direction the wall runs along; `at` is its position on the other axis.
 */
function wall(axis: "x" | "z", at: number, from: number, to: number, openings: Opening[]): Prim[] {
  const { T, H } = HOUSE;
  const out: Prim[] = [];
  const box = (a0: number, a1: number, y0: number, y1: number) => {
    if (a1 - a0 < 1e-3 || y1 - y0 < 1e-3) return;
    const mid = (a0 + a1) / 2;
    const len = a1 - a0;
    const c: Vec3 = axis === "z" ? [at, (y0 + y1) / 2, mid] : [mid, (y0 + y1) / 2, at];
    const s: Vec3 = axis === "z" ? [T, y1 - y0, len] : [len, y1 - y0, T];
    out.push({ t: "box", c, s, part: "wall" });
  };
  const sorted = [...openings].sort((a, b) => a.c - b.c);
  let cursor = from;
  for (const o of sorted) {
    const a0 = o.c - o.w / 2;
    const a1 = o.c + o.w / 2;
    box(cursor, a0, 0, H);
    box(a0, a1, 0, o.y0);
    box(a0, a1, o.y1, H);
    cursor = a1;
  }
  box(cursor, to, 0, H);
  return out;
}

function house(): Prim[] {
  const { A, B, T, H, P, overhang } = HOUSE;
  const run = A + overhang;
  const eave = H - 0.15;
  const rise = P - eave;
  const slab = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  return [
    // windward wall (faces the fan by default): one big window
    ...wall("z", -A, -B, B, [{ c: 0, w: 1.5, y0: 0.75, y1: 1.9 }]),
    // leeward wall: a window and a door — cross ventilation
    ...wall("z", A, -B, B, [
      { c: 0.95, w: 1.0, y0: 0.85, y1: 1.85 },
      { c: -1.0, w: 0.9, y0: 0, y1: 2.05 },
    ]),
    // side walls
    ...wall("x", -B, -A + T / 2, A - T / 2, [{ c: 0.7, w: 0.9, y0: 1.0, y1: 1.8 }]),
    ...wall("x", B, -A + T / 2, A - T / 2, [{ c: -0.7, w: 0.9, y0: 1.0, y1: 1.8 }]),
    // interior partition with a doorway: the air has to turn the corner
    ...wall("z", 0.35, -B + T / 2, B - T / 2, [{ c: 1.25, w: 1.1, y0: 0, y1: 2.1 }]),
    // gable ends
    { t: "prism", poly: [[-A, H], [A, H], [0, P - 0.12]], z0: -B - T / 2, z1: -B + T / 2, part: "wall" },
    { t: "prism", poly: [[-A, H], [A, H], [0, P - 0.12]], z0: B - T / 2, z1: B + T / 2, part: "wall" },
    // roof slabs
    { t: "box", c: [-run / 2, eave + rise / 2, 0], s: [slab + 0.08, 0.14, 2 * B + 0.6], rz: ang, part: "roof" },
    { t: "box", c: [run / 2, eave + rise / 2, 0], s: [slab + 0.08, 0.14, 2 * B + 0.6], rz: -ang, part: "roof" },
    // floor (visual only: thinner than a cell, the ground is already solid)
    { t: "box", c: [0, 0.02, 0], s: [2 * A, 0.04, 2 * B], part: "floor" },
  ];
}

/* --------------------------------------------------------------- tree */

function tree(): Prim[] {
  return [
    { t: "cylY", c: [0, 0, 0], r: 0.2, h: 2.2, part: "trunk" },
    { t: "ell", c: [0, 2.9, 0], r: [1.55, 1.35, 1.55], drag: 4.5, part: "foliage" },
    { t: "ell", c: [0.35, 3.85, -0.25], r: [0.95, 0.8, 0.95], drag: 4.5, part: "foliage" },
  ];
}

function shrub(): Prim[] {
  return [
    { t: "ell", c: [0, 0.55, 0], r: [0.85, 0.7, 1.35], drag: 9, part: "foliage" },
    { t: "ell", c: [0.15, 0.45, 1.25], r: [0.7, 0.55, 0.75], drag: 9, part: "foliage" },
    { t: "ell", c: [-0.1, 0.45, -1.3], r: [0.65, 0.5, 0.7], drag: 9, part: "foliage" },
  ];
}

export const SHAPES: Record<ObjKind, Prim[]> = { car: car(), house: house(), tree: tree(), shrub: shrub() };

/** Horizontal radius that bounds each object (for voxelisation loops and drag picking). */
export const BOUND_RADIUS: Record<ObjKind, number> = { car: 3.1, house: 3.6, tree: 2.0, shrub: 2.4 };
export const BOUND_HEIGHT: Record<ObjKind, number> = { car: 1.1, house: 3.7, tree: 4.8, shrub: 1.4 };

/* ------------------------------------------------------- point tests */

function inPoly(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Tests a local-frame point against one primitive.
 * `minHalf` inflates thin parts so a wall thinner than a grid cell still blocks the air.
 * Returns -1 outside, 0 solid, or the drag coefficient (>0) for porous parts.
 */
export function testPrim(p: Prim, x: number, y: number, z: number, minHalf: number): number {
  switch (p.t) {
    case "box": {
      let dx = x - p.c[0];
      let dy = y - p.c[1];
      const dz = z - p.c[2];
      if (p.rz) {
        const c = Math.cos(-p.rz);
        const s = Math.sin(-p.rz);
        const rx = c * dx - s * dy;
        const ry = s * dx + c * dy;
        dx = rx;
        dy = ry;
      }
      const hx = Math.max(p.s[0] / 2, minHalf);
      const hy = Math.max(p.s[1] / 2, minHalf);
      const hz = Math.max(p.s[2] / 2, minHalf);
      if (p.part === "floor") return -1;
      return Math.abs(dx) <= hx && Math.abs(dy) <= hy && Math.abs(dz) <= hz ? 0 : -1;
    }
    case "prism": {
      const mid = (p.z0 + p.z1) / 2;
      const hz = Math.max((p.z1 - p.z0) / 2, minHalf);
      if (Math.abs(z - mid) > hz) return -1;
      return inPoly(p.poly, x, y) ? 0 : -1;
    }
    case "cylZ": {
      if (Math.abs(z - p.c[2]) > Math.max(p.len / 2, minHalf)) return -1;
      const r = Math.max(p.r, minHalf);
      return (x - p.c[0]) ** 2 + (y - p.c[1]) ** 2 <= r * r ? 0 : -1;
    }
    case "cylY": {
      if (y < p.c[1] || y > p.c[1] + p.h) return -1;
      const r = Math.max(p.r, minHalf);
      return (x - p.c[0]) ** 2 + (z - p.c[2]) ** 2 <= r * r ? 0 : -1;
    }
    case "ell": {
      const q = ((x - p.c[0]) / p.r[0]) ** 2 + ((y - p.c[1]) / p.r[1]) ** 2 + ((z - p.c[2]) / p.r[2]) ** 2;
      return q <= 1 ? p.drag * (1 - 0.5 * q) : -1;
    }
  }
}

/** World → local for a placement (inverse of three.js rotation.y). */
export function toLocal(o: Placement, wx: number, wz: number): [number, number] {
  const dx = wx - o.x;
  const dz = wz - o.z;
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  return [c * dx - s * dz, s * dx + c * dz];
}
