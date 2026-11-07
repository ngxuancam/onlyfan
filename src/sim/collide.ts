/**
 * Exact collision against the obstacle shapes (the same primitives the meshes are built
 * from). The solver only knows a 0.3 m voxel version of each body; tracers tested against
 * those voxels can slip into the visible body between cells. Smoke and leaves test against
 * the real shapes instead, so they slide over the car instead of passing through it.
 */
import { BOUND_HEIGHT, BOUND_RADIUS, SHAPES, testPrim, type PlacedObject, type Prim } from "./obstacles";

interface Body {
  x: number;
  z: number;
  c: number;
  s: number;
  r2: number;
  h: number;
  prims: Prim[];
}

let bodies: Body[] = [];

export function setCollisionObjects(list: PlacedObject[]) {
  bodies = list.map((o) => ({
    x: o.x,
    z: o.z,
    c: Math.cos(o.yaw),
    s: Math.sin(o.yaw),
    r2: (BOUND_RADIUS[o.kind] + 0.2) ** 2,
    h: BOUND_HEIGHT[o.kind] + 0.2,
    // porous foliage never blocks tracers
    prims: SHAPES[o.kind].filter((p) => p.t !== "ell" && p.part !== "floor"),
  }));
}

/** True if the point is inside any solid part of any placed body (with a small skin). */
export function solidExact(x: number, y: number, z: number, skin = 0.05): boolean {
  if (y <= 0) return true;
  for (let b = 0; b < bodies.length; b++) {
    const o = bodies[b];
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz > o.r2 || y > o.h) continue;
    const lx = o.c * dx - o.s * dz;
    const lz = o.s * dx + o.c * dz;
    for (const p of o.prims) if (testPrim(p, lx, y, lz, skin) === 0) return true;
  }
  return false;
}
