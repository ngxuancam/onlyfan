"use client";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Quality } from "@/sim/config";
import { EXHAUST_RADIUS, FAN_RADIUS } from "@/sim/config";
import { field, uploadField } from "@/sim/field";
import type { FromWorker, LineSpec, ToWorker } from "@/sim/protocol";
import type { FanInput } from "@/sim/solver";
import type { PlacedObject, ObjKind } from "@/sim/obstacles";
import { useLab } from "@/lib/store";
import { setCollisionObjects } from "@/sim/collide";
import { sharedUniforms } from "./heatMaterial";
import { simClock } from "@/lib/simClock";

/**
 * The extractor as two momentum discs: its own ducted outflow, plus a wider intake zone
 * upstream that draws the air towards it — that is what makes it pull air off the car.
 */
function exhaustDiscs(): FanInput[] {
  const { c, d, U } = field.exhaust;
  return [
    { c, d, R: EXHAUST_RADIUS, U, spin: 0, depth: 1.2, gain: 2.5, ducted: true },
    {
      c: [c[0] - d[0] * 1.5, c[1] - d[1] * 1.5, c[2] - d[2] * 1.5],
      d,
      R: EXHAUST_RADIUS * 1.45,
      U: U * 0.6,
      spin: 0,
      depth: 1.0,
      gain: 1.6,
      ducted: true,
    },
  ];
}

function placedObjects(): PlacedObject[] {
  const { objects } = useLab.getState();
  return (["car", "house", "tree", "shrub"] as ObjKind[])
    .filter((k) => objects[k].enabled)
    .map((k) => ({ kind: k, x: objects[k].x, z: objects[k].z, yaw: (objects[k].yaw * Math.PI) / 180 }));
}

/**
 * Bridges the render loop and the solver worker: one step request in flight at a time,
 * dt = real time since the previous request (clamped), obstacle layout sent when it changes.
 */
export function SimDriver({ quality, onReady }: { quality: Quality; onReady: (l: LineSpec) => void }) {
  const worker = useRef<Worker | null>(null);
  const busy = useRef(true);
  const lastSend = useRef(0);
  const sentLayout = useRef(-1);
  const resetSeen = useRef(0);
  const meter = useRef({ frames: 0, t: 0, steps: 0, ms: 0, max: 0 });

  useEffect(() => {
    const w = new Worker(new URL("../sim/solver.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "ready") {
        field.grid = m.grid;
        field.line = m.line;
        sharedUniforms.uCell.value = m.grid.h;
        useLab.getState().setStats({ grid: `${m.grid.nx}×${m.grid.ny}×${m.grid.nz}` });
        onReady(m.line);
        busy.current = false;
        return;
      }
      if (m.type === "field" && field.grid) {
        field.vel = m.vel;
        field.tex = m.tex;
        uploadField(field.grid, m.tex, m.dir);
        const forces: typeof field.forces = {};
        m.forceKinds.forEach((k, i) => (forces[k] = [m.forces[i * 3], m.forces[i * 3 + 1], m.forces[i * 3 + 2]]));
        field.forces = forces;
        field.version++;
        if (m.lpos && m.lspd && m.ltof && m.llen) {
          field.lines = { pos: m.lpos, spd: m.lspd, tof: m.ltof, len: m.llen };
          field.linesVersion++;
        }
        meter.current.steps++;
        meter.current.ms += m.ms;
        meter.current.max = m.maxSpeed;
        busy.current = false;
      }
    };
    const init: ToWorker = { type: "init", quality };
    w.postMessage(init);
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [quality, onReady]);

  useFrame((st, delta) => {
    const now = st.clock.elapsedTime;
    const s = useLab.getState();
    // simulation time: frozen while paused (streamline pulses, surface streaks...)
    if (!s.paused) simClock.t += Math.min(delta, 1 / 20);
    sharedUniforms.uTime.value = simClock.t;
    // global heat-map fade
    const target = s.layers.surfaceHeat ? 1 : 0;
    sharedUniforms.uHeat.value += (target - sharedUniforms.uHeat.value) * Math.min(1, delta * 6);
    if (field.texture) sharedUniforms.uField.value = field.texture;
    if (field.dirTexture) sharedUniforms.uDir.value = field.dirTexture;

    // stats, twice a second
    const mt = meter.current;
    mt.frames++;
    if (now - mt.t > 0.5) {
      const span = now - mt.t;
      s.setStats({
        fps: Math.round(mt.frames / span),
        simHz: Math.round(mt.steps / span),
        stepMs: mt.steps ? mt.ms / mt.steps : 0,
        maxSpeed: mt.max,
      });
      mt.frames = 0;
      mt.steps = 0;
      mt.ms = 0;
      mt.t = now;
    }

    const w = worker.current;
    if (!w) return;
    if (resetSeen.current !== s.resetToken) {
      resetSeen.current = s.resetToken;
      w.postMessage({ type: "reset" } satisfies ToWorker);
    }
    if (busy.current || s.paused) {
      lastSend.current = now;
      return;
    }
    const dt = Math.min(1 / 15, Math.max(1 / 120, now - lastSend.current));
    lastSend.current = now;
    const msg: ToWorker = {
      type: "step",
      dt,
      fan: { c: field.fan.c, d: field.fan.d, R: FAN_RADIUS, U: field.fan.U, spin: field.fan.spin },
      extra: [
        ...(field.exhaust.on && field.exhaust.U > 0.05 ? exhaustDiscs() : []),
        ...Object.values(field.discs)
          .filter((q) => q.on && q.U > 0.05)
          .map((q) => ({ c: q.c, d: q.d, R: q.R, U: q.U, spin: 0, depth: q.depth, gain: q.gain, ducted: q.ducted })),
      ],
      streamlines: s.layers.streamlines,
    };
    if (sentLayout.current !== s.layoutVersion) {
      msg.objects = placedObjects();
      setCollisionObjects(msg.objects);
      sentLayout.current = s.layoutVersion;
    }
    busy.current = true;
    w.postMessage(msg);
  });

  return null;
}
