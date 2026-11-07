/// <reference lib="webworker" />
/**
 * Runs the fluid solver off the main thread. The main thread asks for one step at a
 * time (never queueing), so a slow device simply gets fewer, larger steps.
 */
import { gridFor, type Vec3 } from "./config";
import type { FromWorker, LineSpec, ToWorker } from "./protocol";
import { Fluid, type FanInput } from "./solver";
import type { ObjKind } from "./obstacles";

let fluid: Fluid | null = null;
let line: LineSpec = { lines: 96, steps: 220 };

const post = (msg: FromWorker, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === "init") {
    const grid = gridFor(msg.quality);
    fluid = new Fluid(grid);
    if (msg.quality === "low") {
      fluid.pressureIters = 16;
      fluid.vorticity = 0;
      line = { lines: 56, steps: 160 };
    }
    post({ type: "ready", grid, line });
    return;
  }
  if (msg.type === "step" && fluid) {
    const t0 = performance.now();
    if (msg.objects) fluid.setObstacles(msg.objects);
    // semi-Lagrangian advection is unconditionally stable; the main thread clamps dt
    fluid.step(msg.dt, [msg.fan, ...msg.extra]);

    const cells = fluid.nx * fluid.ny * fluid.nz;
    const tex = new Uint8Array(cells * 4);
    const vel = new Float32Array(cells * 3);
    const dir = new Uint8Array(cells * 4);
    const { maxS: maxSpeed, forces } = fluid.pack(tex, vel, dir);
    const transfer: Transferable[] = [tex.buffer, vel.buffer, dir.buffer, forces.buffer];
    const out: FromWorker = { type: "field", tex, vel, dir, forces, forceKinds: fluid.ownerKinds as ObjKind[], ms: 0, maxSpeed };
    if (msg.streamlines && msg.fan.U > 0.05) {
      const l = trace(fluid, msg.fan);
      Object.assign(out, l);
      transfer.push(l.lpos.buffer, l.lspd.buffer, l.ltof.buffer, l.llen.buffer);
    }
    out.ms = performance.now() - t0;
    post(out, transfer);
  }
};

/**
 * Streamlines seeded on rings across the blade disc and integrated with RK2
 * through the current velocity field (frozen-time streamlines, like a CFD post-processor).
 */
function trace(f: Fluid, fan: FanInput) {
  const { lines, steps } = line;
  const lpos = new Float32Array(lines * steps * 3);
  const lspd = new Float32Array(lines * steps);
  const ltof = new Float32Array(lines * steps);
  const llen = new Uint16Array(lines);
  const [dx, dy, dz] = fan.d;
  // basis perpendicular to the blowing direction
  let ax = 0;
  let ay = 1;
  const az = 0;
  if (Math.abs(dy) > 0.9) {
    ax = 1;
    ay = 0;
  }
  // e1 = normalize(a × d), e2 = d × e1
  let e1x = ay * dz - az * dy;
  let e1y = az * dx - ax * dz;
  let e1z = ax * dy - ay * dx;
  const l1 = Math.hypot(e1x, e1y, e1z);
  e1x /= l1;
  e1y /= l1;
  e1z /= l1;
  const e2x = dy * e1z - dz * e1y;
  const e2y = dz * e1x - dx * e1z;
  const e2z = dx * e1y - dy * e1x;

  const rings = [0.3, 0.52, 0.72, 0.9];
  const weights = [1, 1.6, 2.2, 2.8];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const seeds: Vec3[] = [];
  const spin = fan.spin * 0.08;
  rings.forEach((rf, ri) => {
    const n = ri === rings.length - 1 ? lines - seeds.length : Math.round((lines * weights[ri]) / wsum);
    for (let s = 0; s < n; s++) {
      const a = spin + (s / n) * Math.PI * 2 + ri * 0.7;
      const r = rf * fan.R;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      seeds.push([
        fan.c[0] + dx * 0.12 + e1x * ca + e2x * sa,
        fan.c[1] + dy * 0.12 + e1y * ca + e2y * sa,
        fan.c[2] + dz * 0.12 + e1z * ca + e2z * sa,
      ]);
    }
  });

  const ds = f.h * 0.5;
  const v1: Vec3 = [0, 0, 0];
  const v2: Vec3 = [0, 0, 0];
  const lo = f.min;
  const hi: Vec3 = [lo[0] + f.nx * f.h, lo[1] + f.ny * f.h, lo[2] + f.nz * f.h];
  for (let li = 0; li < lines && li < seeds.length; li++) {
    let [x, y, z] = seeds[li];
    let tof = 0;
    let n = 0;
    const base = li * steps;
    for (; n < steps; n++) {
      f.velAt(x, y, z, v1);
      const s1 = Math.hypot(v1[0], v1[1], v1[2]);
      const o = base + n;
      lpos[o * 3] = x;
      lpos[o * 3 + 1] = y;
      lpos[o * 3 + 2] = z;
      lspd[o] = s1;
      ltof[o] = tof;
      if (s1 < 0.12) {
        n++;
        break;
      }
      const hx = x + (v1[0] / s1) * ds * 0.5;
      const hy = y + (v1[1] / s1) * ds * 0.5;
      const hz = z + (v1[2] / s1) * ds * 0.5;
      f.velAt(hx, hy, hz, v2);
      const s2 = Math.hypot(v2[0], v2[1], v2[2]) || 1e-3;
      x += (v2[0] / s2) * ds;
      y += (v2[1] / s2) * ds;
      z += (v2[2] / s2) * ds;
      tof += ds / Math.max(s2, 0.15);
      if (x < lo[0] || x > hi[0] || y < 0.02 || y > hi[1] || z < lo[2] || z > hi[2] || f.isSolidAt(x, y, z)) {
        n++;
        break;
      }
    }
    llen[li] = n;
  }
  return { lpos, lspd, ltof, llen };
}
