/**
 * A 3D "stable fluids" solver (Stam 1999) on a collocated grid.
 *
 *   1. fan forcing      — momentum source on a thin disc in front of the blades
 *   2. advection        — semi-Lagrangian, trilinear back-trace
 *   3. porous drag      — foliage slows the air instead of blocking it
 *   4. vorticity conf.  — puts back the small eddies numerical diffusion smears out
 *   5. projection       — red-black SOR Poisson solve, makes the flow incompressible
 *
 * Obstacles are voxelised as solid cells (Neumann pressure, zero velocity).
 * The ground is solid; the sides and top of the box are open (pressure 0, zero-gradient velocity).
 *
 * Arrays are padded by one ghost layer on every side: interior cells are 1..n.
 */
import type { GridSpec, Vec3 } from "./config";
import { PMAX, VMAX } from "./config";
import { BOUND_HEIGHT, BOUND_RADIUS, SHAPES, testPrim, toLocal, type PlacedObject } from "./obstacles";

export interface FanInput {
  /** blade disc centre (world) */
  c: Vec3;
  /** unit blowing direction */
  d: Vec3;
  /** disc radius */
  R: number;
  /** exit speed, m/s */
  U: number;
  /** blade rotation angle, rad — spins the swirl seeds */
  spin: number;
}

const FLUID = 0;
const SOLID = 1;
const OPEN = 2;

export class Fluid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly h: number;
  readonly min: Vec3;
  readonly X: number;
  readonly Y: number;
  readonly Z: number;
  readonly N: number;

  u: Float32Array;
  v: Float32Array;
  w: Float32Array;
  u0: Float32Array;
  v0: Float32Array;
  w0: Float32Array;
  p: Float32Array;
  div: Float32Array;
  /** |curl| scratch for vorticity confinement */
  om: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  cz: Float32Array;
  /** time-averaged pressure for the load read-out (raw p flickers step to step) */
  pAvg: Float32Array;
  type: Uint8Array;
  /** which obstacle (index + 1) a solid cell belongs to; 0 = ground / none */
  owner: Uint8Array;
  ownerKinds: string[] = [];
  drag: Float32Array;
  /** number of non-solid neighbours per cell (Poisson denominator) */
  cnt: Uint8Array;
  /** bit per neighbour (-x,+x,-y,+y,-z,+z) that is not solid */
  mask: Uint8Array;
  red = new Int32Array(0);
  black = new Int32Array(0);

  pressureIters = 18;
  vorticity = 0.35;

  constructor(g: GridSpec) {
    this.nx = g.nx;
    this.ny = g.ny;
    this.nz = g.nz;
    this.h = g.h;
    this.min = g.min;
    this.X = g.nx + 2;
    this.Y = g.ny + 2;
    this.Z = g.nz + 2;
    this.N = this.X * this.Y * this.Z;
    const N = this.N;
    this.u = new Float32Array(N);
    this.v = new Float32Array(N);
    this.w = new Float32Array(N);
    this.u0 = new Float32Array(N);
    this.v0 = new Float32Array(N);
    this.w0 = new Float32Array(N);
    this.p = new Float32Array(N);
    this.div = new Float32Array(N);
    this.om = new Float32Array(N);
    this.cx = new Float32Array(N);
    this.cy = new Float32Array(N);
    this.cz = new Float32Array(N);
    this.pAvg = new Float32Array(N);
    this.type = new Uint8Array(N);
    this.owner = new Uint8Array(N);
    this.drag = new Float32Array(N);
    this.cnt = new Uint8Array(N);
    this.mask = new Uint8Array(N);
    this.setObstacles([]);
  }

  idx(i: number, j: number, k: number) {
    return i + this.X * (j + this.Y * k);
  }

  /* ------------------------------------------------------------ obstacles */

  setObstacles(objects: PlacedObject[]) {
    const { X, Y, Z, type, drag, h, min } = this;
    for (let k = 0; k < Z; k++)
      for (let j = 0; j < Y; j++)
        for (let i = 0; i < X; i++) {
          const id = i + X * (j + Y * k);
          drag[id] = 0;
          this.owner[id] = 0;
          if (j === 0) type[id] = SOLID;
          else if (i === 0 || i === X - 1 || k === 0 || k === Z - 1 || j === Y - 1) type[id] = OPEN;
          else type[id] = FLUID;
        }

    const minHalf = h * 0.56;
    this.ownerKinds = objects.map((o) => o.kind);
    objects.forEach((o, oi) => {
      const prims = SHAPES[o.kind];
      const R = BOUND_RADIUS[o.kind] + h;
      const H = BOUND_HEIGHT[o.kind] + h;
      const i0 = Math.max(1, Math.floor((o.x - R - min[0]) / h));
      const i1 = Math.min(this.nx, Math.ceil((o.x + R - min[0]) / h) + 1);
      const k0 = Math.max(1, Math.floor((o.z - R - min[2]) / h));
      const k1 = Math.min(this.nz, Math.ceil((o.z + R - min[2]) / h) + 1);
      const j1 = Math.min(this.ny, Math.ceil(H / h) + 1);
      for (let k = k0; k <= k1; k++) {
        const wz = min[2] + (k - 0.5) * h;
        for (let i = i0; i <= i1; i++) {
          const wx = min[0] + (i - 0.5) * h;
          const [lx, lz] = toLocal(o, wx, wz);
          if (lx * lx + lz * lz > R * R) continue;
          for (let j = 1; j <= j1; j++) {
            const wy = (j - 0.5) * h;
            const id = i + X * (j + Y * k);
            if (type[id] === SOLID) continue;
            for (const p of prims) {
              const r = testPrim(p, lx, wy, lz, minHalf);
              if (r === 0) {
                type[id] = SOLID;
                this.owner[id] = oi + 1;
                drag[id] = 0;
                break;
              }
              if (r > 0) drag[id] = Math.max(drag[id], r);
            }
          }
        }
      }
    });

    const { cnt, mask, u, v, w } = this;
    const sx = 1;
    const sy = X;
    const sz = X * Y;
    const red: number[] = [];
    const black: number[] = [];
    for (let k = 1; k < Z - 1; k++)
      for (let j = 1; j < Y - 1; j++)
        for (let i = 1; i < X - 1; i++) {
          const id = i + X * (j + Y * k);
          if (type[id] === SOLID) {
            u[id] = v[id] = w[id] = 0;
            this.p[id] = 0;
            cnt[id] = 0;
            mask[id] = 0;
            continue;
          }
          const m =
            (type[id - sx] !== SOLID ? 1 : 0) |
            (type[id + sx] !== SOLID ? 2 : 0) |
            (type[id - sy] !== SOLID ? 4 : 0) |
            (type[id + sy] !== SOLID ? 8 : 0) |
            (type[id - sz] !== SOLID ? 16 : 0) |
            (type[id + sz] !== SOLID ? 32 : 0);
          mask[id] = m;
          let c = 0;
          for (let b = m; b; b >>= 1) c += b & 1;
          cnt[id] = c;
          if (c === 0) continue;
          ((i + j + k) & 1 ? black : red).push(id);
        }
    this.red = Int32Array.from(red);
    this.black = Int32Array.from(black);
  }

  /** still air everywhere */
  clear() {
    for (const a of [this.u, this.v, this.w, this.u0, this.v0, this.w0, this.p, this.pAvg]) a.fill(0);
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    const i = Math.floor((x - this.min[0]) / this.h) + 1;
    const j = Math.floor((y - this.min[1]) / this.h) + 1;
    const k = Math.floor((z - this.min[2]) / this.h) + 1;
    if (i < 1 || i > this.nx || j < 1 || j > this.ny || k < 1 || k > this.nz) return false;
    return this.type[i + this.X * (j + this.Y * k)] === SOLID;
  }

  /* ----------------------------------------------------------------- step */

  /** `fans`: the stand fan plus any exhaust (suction) fans, each a momentum disc */
  step(dt: number, fans: FanInput[]) {
    for (const fan of fans) this.applyFan(dt, fan);
    this.advect(dt);
    if (this.vorticity > 0) this.confine(dt);
    this.project(dt);
  }

  private applyFan(dt: number, fan: FanInput) {
    if (fan.U <= 0.01) return;
    const { X, Y, h, min, type, u, v, w } = this;
    const [cx, cy, cz] = fan.c;
    const [dx, dy, dz] = fan.d;
    const R = fan.R;
    const ext = R + 2 * h;
    const i0 = Math.max(1, Math.floor((cx - ext - min[0]) / h));
    const i1 = Math.min(this.nx, Math.ceil((cx + ext - min[0]) / h) + 1);
    const j0 = Math.max(1, Math.floor((cy - ext - min[1]) / h));
    const j1 = Math.min(this.ny, Math.ceil((cy + ext - min[1]) / h) + 1);
    const k0 = Math.max(1, Math.floor((cz - ext - min[2]) / h));
    const k1 = Math.min(this.nz, Math.ceil((cz + ext - min[2]) / h) + 1);
    const depth = 2.2 * h;
    const blend = Math.min(1, dt * 14);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const id = i + X * (j + Y * k);
          if (type[id] !== FLUID) continue;
          const rx = min[0] + (i - 0.5) * h - cx;
          const ry = min[1] + (j - 0.5) * h - cy;
          const rz = min[2] + (k - 0.5) * h - cz;
          const a = rx * dx + ry * dy + rz * dz;
          if (a < -0.4 * h || a > depth) continue;
          const px = rx - a * dx;
          const py = ry - a * dy;
          const pz = rz - a * dz;
          const r = Math.sqrt(px * px + py * py + pz * pz);
          if (r > R) continue;
          const q = r / R;
          // annular jet: weak behind the hub, strongest at ~70 % radius
          const prof = 0.35 + 0.65 * smooth(0.05, 0.45, q) - 0.4 * smooth(0.8, 1.0, q);
          const s = fan.U * prof;
          // blade swirl: tangential component d × r̂
          const sw = r > 1e-4 ? (0.18 * s) / r : 0;
          const tx = dx * s + sw * (dy * pz - dz * py);
          const ty = dy * s + sw * (dz * px - dx * pz);
          const tz = dz * s + sw * (dx * py - dy * px);
          u[id] += (tx - u[id]) * blend;
          v[id] += (ty - v[id]) * blend;
          w[id] += (tz - w[id]) * blend;
        }
  }

  private setGhosts(a: Float32Array, b: Float32Array, c: Float32Array) {
    const { X, Y, Z } = this;
    const sy = X;
    const sz = X * Y;
    // x faces
    for (let k = 0; k < Z; k++)
      for (let j = 0; j < Y; j++) {
        const l = X * (j + Y * k);
        const r = l + X - 1;
        a[l] = a[l + 1]; b[l] = b[l + 1]; c[l] = c[l + 1];
        a[r] = a[r - 1]; b[r] = b[r - 1]; c[r] = c[r - 1];
      }
    // z faces
    for (let j = 0; j < Y; j++)
      for (let i = 0; i < X; i++) {
        const f = i + X * j;
        const bk = f + sz * (Z - 1);
        a[f] = a[f + sz]; b[f] = b[f + sz]; c[f] = c[f + sz];
        a[bk] = a[bk - sz]; b[bk] = b[bk - sz]; c[bk] = c[bk - sz];
      }
    // top open, ground solid (zero velocity)
    for (let k = 0; k < Z; k++)
      for (let i = 0; i < X; i++) {
        const t = i + sy * (Y - 1) + sz * k;
        a[t] = a[t - sy]; b[t] = Math.max(0, b[t - sy]); c[t] = c[t - sy];
        const g = i + sz * k;
        a[g] = 0; b[g] = 0; c[g] = 0;
      }
  }

  private advect(dt: number) {
    // swap current → previous
    let t = this.u0; this.u0 = this.u; this.u = t;
    t = this.v0; this.v0 = this.v; this.v = t;
    t = this.w0; this.w0 = this.w; this.w = t;
    const { X, Y, Z, u0, v0, w0, u, v, w, type, drag } = this;
    this.setGhosts(u0, v0, w0);
    const s = dt / this.h;
    const xmax = X - 1.001;
    const ymax = Y - 1.001;
    const zmax = Z - 1.001;
    const sy = X;
    const sz = X * Y;
    for (let k = 1; k < Z - 1; k++)
      for (let j = 1; j < Y - 1; j++) {
        let id = 1 + X * (j + Y * k);
        for (let i = 1; i < X - 1; i++, id++) {
          if (type[id] === SOLID) {
            u[id] = v[id] = w[id] = 0;
            continue;
          }
          let x = i - s * u0[id];
          let y = j - s * v0[id];
          let z = k - s * w0[id];
          x = x < 0 ? 0 : x > xmax ? xmax : x;
          y = y < 0 ? 0 : y > ymax ? ymax : y;
          z = z < 0 ? 0 : z > zmax ? zmax : z;
          const i0 = x | 0;
          const j0 = y | 0;
          const k0 = z | 0;
          const fx = x - i0;
          const fy = y - j0;
          const fz = z - k0;
          const a = i0 + X * (j0 + Y * k0);
          const b = a + 1;
          const c = a + sy;
          const d = c + 1;
          const e = a + sz;
          const f = e + 1;
          const g = e + sy;
          const hh = g + 1;
          const w000 = (1 - fx) * (1 - fy) * (1 - fz);
          const w100 = fx * (1 - fy) * (1 - fz);
          const w010 = (1 - fx) * fy * (1 - fz);
          const w110 = fx * fy * (1 - fz);
          const w001 = (1 - fx) * (1 - fy) * fz;
          const w101 = fx * (1 - fy) * fz;
          const w011 = (1 - fx) * fy * fz;
          const w111 = fx * fy * fz;
          let nu = u0[a] * w000 + u0[b] * w100 + u0[c] * w010 + u0[d] * w110 + u0[e] * w001 + u0[f] * w101 + u0[g] * w011 + u0[hh] * w111;
          let nv = v0[a] * w000 + v0[b] * w100 + v0[c] * w010 + v0[d] * w110 + v0[e] * w001 + v0[f] * w101 + v0[g] * w011 + v0[hh] * w111;
          let nw = w0[a] * w000 + w0[b] * w100 + w0[c] * w010 + w0[d] * w110 + w0[e] * w001 + w0[f] * w101 + w0[g] * w011 + w0[hh] * w111;
          const dr = drag[id];
          // porous foliage + a tiny global damping so closed pockets settle
          const damp = dr > 0 ? 1 / (1 + dr * dt) : 0.9985;
          nu *= damp;
          nv *= damp;
          nw *= damp;
          u[id] = nu;
          v[id] = nv;
          w[id] = nw;
        }
      }
  }

  private confine(dt: number) {
    const { X, Y, Z, u, v, w, type, om, cx, cy, cz, h } = this;
    const sy = X;
    const sz = X * Y;
    const inv2h = 0.5 / h;
    for (let k = 1; k < Z - 1; k++)
      for (let j = 1; j < Y - 1; j++) {
        let id = 1 + X * (j + Y * k);
        for (let i = 1; i < X - 1; i++, id++) {
          if (type[id] === SOLID) {
            om[id] = 0;
            continue;
          }
          const ox = (w[id + sy] - w[id - sy] - (v[id + sz] - v[id - sz])) * inv2h;
          const oy = (u[id + sz] - u[id - sz] - (w[id + 1] - w[id - 1])) * inv2h;
          const oz = (v[id + 1] - v[id - 1] - (u[id + sy] - u[id - sy])) * inv2h;
          cx[id] = ox;
          cy[id] = oy;
          cz[id] = oz;
          om[id] = Math.sqrt(ox * ox + oy * oy + oz * oz);
        }
      }
    const eps = this.vorticity * h * dt;
    for (let k = 2; k < Z - 2; k++)
      for (let j = 2; j < Y - 2; j++) {
        let id = 2 + X * (j + Y * k);
        for (let i = 2; i < X - 2; i++, id++) {
          if (type[id] !== FLUID) continue;
          let nx = om[id + 1] - om[id - 1];
          let ny = om[id + sy] - om[id - sy];
          let nz = om[id + sz] - om[id - sz];
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-5;
          nx /= len;
          ny /= len;
          nz /= len;
          const ox = cx[id];
          const oy = cy[id];
          const oz = cz[id];
          u[id] += eps * (ny * oz - nz * oy);
          v[id] += eps * (nz * ox - nx * oz);
          w[id] += eps * (nx * oy - ny * ox);
        }
      }
  }

  private project(dt: number) {
    const { X, Y, Z, u, v, w, p, div, type, cnt, h } = this;
    this.setGhosts(u, v, w);
    const sy = X;
    const sz = X * Y;
    const inv2h = 0.5 / h;
    const scale = (h * h) / dt;
    for (let k = 1; k < Z - 1; k++)
      for (let j = 1; j < Y - 1; j++) {
        let id = 1 + X * (j + Y * k);
        for (let i = 1; i < X - 1; i++, id++) {
          if (type[id] !== FLUID) {
            div[id] = 0;
            continue;
          }
          div[id] = (u[id + 1] - u[id - 1] + v[id + sy] - v[id - sy] + w[id + sz] - w[id - sz]) * inv2h * scale;
        }
      }

    // red-black SOR over precomputed fluid-cell lists; open ghosts hold p = 0,
    // solid neighbours are skipped (Neumann). Most cells take the 6-neighbour fast path.
    const omega = 1.7;
    const { red, black, mask } = this;
    for (let it = 0; it < this.pressureIters; it++)
      for (let pass = 0; pass < 2; pass++) {
        const list = pass ? black : red;
        for (let q = 0; q < list.length; q++) {
          const id = list[q];
          const m = mask[id];
          let pn: number;
          if (m === 63) {
            pn = (p[id - 1] + p[id + 1] + p[id - sy] + p[id + sy] + p[id - sz] + p[id + sz] - div[id]) * (1 / 6);
          } else {
            let sum = 0;
            if (m & 1) sum += p[id - 1];
            if (m & 2) sum += p[id + 1];
            if (m & 4) sum += p[id - sy];
            if (m & 8) sum += p[id + sy];
            if (m & 16) sum += p[id - sz];
            if (m & 32) sum += p[id + sz];
            pn = (sum - div[id]) / cnt[id];
          }
          p[id] += omega * (pn - p[id]);
        }
      }

    const g = dt * inv2h;
    for (let k = 1; k < Z - 1; k++)
      for (let j = 1; j < Y - 1; j++) {
        let id = 1 + X * (j + Y * k);
        for (let i = 1; i < X - 1; i++, id++) {
          if (type[id] !== FLUID) continue;
          const pc = p[id];
          const pw = type[id - 1] === SOLID ? pc : p[id - 1];
          const pe = type[id + 1] === SOLID ? pc : p[id + 1];
          const ps = type[id - sy] === SOLID ? pc : p[id - sy];
          const pn = type[id + sy] === SOLID ? pc : p[id + sy];
          const pb = type[id - sz] === SOLID ? pc : p[id - sz];
          const pf = type[id + sz] === SOLID ? pc : p[id + sz];
          u[id] -= g * (pe - pw);
          v[id] -= g * (pn - ps);
          w[id] -= g * (pf - pb);
          // no flow into solid faces
          if (type[id - sy] === SOLID && v[id] < 0) v[id] *= 0.2;
        }
      }
    this.setGhosts(u, v, w);
  }

  /* --------------------------------------------------------------- output */

  /** Trilinear velocity at a world position (writes into out). */
  velAt(x: number, y: number, z: number, out: Vec3) {
    const { X, Y, Z, u, v, w, h, min } = this;
    let gx = (x - min[0]) / h + 0.5;
    let gy = (y - min[1]) / h + 0.5;
    let gz = (z - min[2]) / h + 0.5;
    gx = gx < 0 ? 0 : gx > X - 1.001 ? X - 1.001 : gx;
    gy = gy < 0 ? 0 : gy > Y - 1.001 ? Y - 1.001 : gy;
    gz = gz < 0 ? 0 : gz > Z - 1.001 ? Z - 1.001 : gz;
    const i0 = gx | 0;
    const j0 = gy | 0;
    const k0 = gz | 0;
    const fx = gx - i0;
    const fy = gy - j0;
    const fz = gz - k0;
    const a = i0 + X * (j0 + Y * k0);
    const sy = X;
    const sz = X * Y;
    let ru = 0;
    let rv = 0;
    let rw = 0;
    for (let dk = 0; dk < 2; dk++)
      for (let dj = 0; dj < 2; dj++)
        for (let di = 0; di < 2; di++) {
          const wt = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
          const id = a + di + dj * sy + dk * sz;
          ru += u[id] * wt;
          rv += v[id] * wt;
          rw += w[id] * wt;
        }
    out[0] = ru;
    out[1] = rv;
    out[2] = rw;
  }

  /**
   * Packs the interior for the GPU: R = speed, G = pressure (0.5 = ambient),
   * B = foliage drag, A = solid. Solid cells take the average of their fluid
   * neighbours so a surface shader sampling at the wall reads the adjacent air.
   * Also fills `vel` (interior, xyz interleaved) for CPU-side tracers, `dir` (RGBA8 velocity,
   * 0.5 = zero, for surface flow streaks), and returns the pressure force on each obstacle:
   * F = -Σ p n dA over the faces between its solid cells and the air (ρ = 1.2 kg/m³, newtons).
   */
  pack(tex: Uint8Array, vel: Float32Array, dir: Uint8Array): { maxS: number; forces: Float32Array } {
    const forces = new Float32Array(this.ownerKinds.length * 3);
    const owner = this.owner;
    const area = this.h * this.h * 1.2;
    const nbx = [1, -1, 0, 0, 0, 0];
    const nby = [0, 0, 1, -1, 0, 0];
    const nbz = [0, 0, 0, 0, 1, -1];
    const { X, Y, Z, u, v, w, type, drag, nx, ny } = this;
    const p = this.pAvg;
    for (let id = 0; id < this.N; id++) p[id] += (this.p[id] - p[id]) * 0.25;
    const sy = X;
    const sz = X * Y;
    const nb = [1, -1, sy, -sy, sz, -sz];
    let maxS = 0;
    for (let k = 1; k < Z - 1; k++)
      for (let j = 1; j < Y - 1; j++) {
        let id = 1 + X * (j + Y * k);
        let o = nx * (j - 1 + ny * (k - 1));
        for (let i = 1; i < X - 1; i++, id++, o++) {
          let s: number;
          let pr: number;
          const solid = type[id] === SOLID;
          if (solid) {
            let ss = 0;
            let ps = 0;
            let c = 0;
            let au = 0;
            let av = 0;
            let aw = 0;
            const ow = owner[id];
            for (let q6 = 0; q6 < 6; q6++) {
              const q = id + nb[q6];
              if (type[q] !== FLUID) continue;
              ss += Math.sqrt(u[q] * u[q] + v[q] * v[q] + w[q] * w[q]);
              ps += p[q];
              au += u[q];
              av += v[q];
              aw += w[q];
              c++;
              if (ow) {
                const f = (ow - 1) * 3;
                const pa = p[q] * area;
                forces[f] -= pa * nbx[q6];
                forces[f + 1] -= pa * nby[q6];
                forces[f + 2] -= pa * nbz[q6];
              }
            }
            s = c ? ss / c : 0;
            pr = c ? ps / c : 0;
            if (c) {
              au /= c;
              av /= c;
              aw /= c;
            }
            dir[o * 4] = enc(au);
            dir[o * 4 + 1] = enc(av);
            dir[o * 4 + 2] = enc(aw);
            vel[o * 3] = vel[o * 3 + 1] = vel[o * 3 + 2] = 0;
          } else {
            const a = u[id];
            const b = v[id];
            const cc = w[id];
            s = Math.sqrt(a * a + b * b + cc * cc);
            pr = p[id];
            vel[o * 3] = a;
            vel[o * 3 + 1] = b;
            vel[o * 3 + 2] = cc;
            dir[o * 4] = enc(a);
            dir[o * 4 + 1] = enc(b);
            dir[o * 4 + 2] = enc(cc);
            if (s > maxS) maxS = s;
          }
          const t = o * 4;
          tex[t] = Math.min(255, (s / VMAX) * 255) | 0;
          tex[t + 1] = Math.max(0, Math.min(255, (0.5 + pr / (2 * PMAX)) * 255)) | 0;
          tex[t + 2] = Math.min(255, drag[id] * 25) | 0;
          tex[t + 3] = solid ? 255 : 0;
          dir[t + 3] = 255;
        }
      }
    return { maxS, forces };
  }
}

function enc(x: number) {
  const t = 0.5 + x / (2 * VMAX);
  return (t < 0 ? 0 : t > 1 ? 255 : t * 255) | 0;
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
