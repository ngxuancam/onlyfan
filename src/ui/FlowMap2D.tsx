"use client";
import { useEffect, useRef } from "react";
import { DOMAIN, DOMAIN_SIZE, VMAX, type Vec3 } from "@/sim/config";
import { field, sampleVel, solidAt } from "@/sim/field";
import { BOUND_RADIUS, SHAPES, type ObjKind, type Prim } from "@/sim/obstacles";
import { OBJ_LABEL, useLab, type ObjKey, type Selectable } from "@/lib/store";

/**
 * 2D mode: a horizontal slice through the same 3D solution, seen from above.
 * Thousands of short streaks drift with the in-plane velocity (deep blue = slow,
 * white = fast); obstacles are drawn as their true cross-section at the slice height,
 * with the pressure force on each one split into drag D (along the oncoming wind)
 * and side force S (across it).
 */

type Section = { t: "poly"; pts: [number, number][]; porous: boolean } | { t: "ell"; cx: number; cz: number; rx: number; rz: number; porous: boolean };

/** x-intervals where a horizontal line y crosses a polygon in the XY plane */
function crossings(poly: [number, number][], y: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[j];
    if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

const rect = (x0: number, x1: number, z0: number, z1: number, porous = false): Section => ({
  t: "poly",
  pts: [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ],
  porous,
});

function sectionOf(p: Prim, y: number): Section[] {
  switch (p.t) {
    case "box": {
      if (p.part === "floor") return [];
      const [cx, cy, cz] = p.c;
      const [sx, sy, sz] = p.s;
      if (!p.rz) return Math.abs(y - cy) <= sy / 2 ? [rect(cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2)] : [];
      const c = Math.cos(p.rz);
      const s = Math.sin(p.rz);
      const corners: [number, number][] = [
        [-sx / 2, -sy / 2],
        [sx / 2, -sy / 2],
        [sx / 2, sy / 2],
        [-sx / 2, sy / 2],
      ].map(([a, b]) => [cx + c * a - s * b, cy + s * a + c * b]);
      return crossings(corners, y).map(([x0, x1]) => rect(x0, x1, cz - sz / 2, cz + sz / 2));
    }
    case "prism":
      return crossings(p.poly, y).map(([x0, x1]) => rect(x0, x1, p.z0, p.z1));
    case "cylZ": {
      const d = y - p.c[1];
      if (Math.abs(d) >= p.r) return [];
      const hw = Math.sqrt(p.r * p.r - d * d);
      return [rect(p.c[0] - hw, p.c[0] + hw, p.c[2] - p.len / 2, p.c[2] + p.len / 2)];
    }
    case "cylY":
      return y >= p.c[1] && y <= p.c[1] + p.h ? [{ t: "ell", cx: p.c[0], cz: p.c[2], rx: p.r, rz: p.r, porous: false }] : [];
    case "ell": {
      const d = (y - p.c[1]) / p.r[1];
      if (Math.abs(d) >= 1) return [];
      const k = Math.sqrt(1 - d * d);
      return [{ t: "ell", cx: p.c[0], cz: p.c[2], rx: p.r[0] * k, rz: p.r[2] * k, porous: true }];
    }
  }
}

const KINDS: ObjKind[] = ["car", "house", "tree", "shrub"];

export function FlowMap2D() {
  const view = useLab((s) => s.view);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (view !== "2d") return;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 760;
    const N = coarse ? 3500 : 9000;
    const px = new Float32Array(N);
    const pz = new Float32Array(N);
    const age = new Float32Array(N).fill(99);
    const life = new Float32Array(N);
    const v: Vec3 = [0, 0, 0];
    let W = 0;
    let H = 0;
    let dpr = 1;
    let scale = 30;
    let ox = 0;
    let oy = 0;
    const bg = document.createElement("canvas");
    const bgx = bg.getContext("2d")!;

    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      const narrow = W < 760;
      const left = narrow ? 12 : W < 1180 ? 254 : 288;
      const right = narrow ? 12 : W < 1180 ? 304 : 320;
      const top = narrow ? 130 : 70;
      const bottom = narrow ? 90 : 40;
      scale = Math.min((W - left - right) / DOMAIN_SIZE[0], (H - top - bottom) / DOMAIN_SIZE[2]);
      ox = left + (W - left - right - DOMAIN_SIZE[0] * scale) / 2;
      oy = top + (H - top - bottom - DOMAIN_SIZE[2] * scale) / 2;
    };
    resize();
    addEventListener("resize", resize);
    const sx = (x: number) => ox + (x - DOMAIN.min[0]) * scale;
    const sz = (z: number) => oy + (z - DOMAIN.min[2]) * scale;
    const wx = (X: number) => (X - ox) / scale + DOMAIN.min[0];
    const wz = (Y: number) => (Y - oy) / scale + DOMAIN.min[2];

    /* ---- dragging objects in plan view */
    let drag: { key: Selectable; dx: number; dz: number } | null = null;
    const hitTest = (x: number, z: number): Selectable | null => {
      const s = useLab.getState();
      const keys: ObjKey[] = ["rig", "car", "tree", "shrub", "house"];
      if (s.fan.enabled && Math.hypot(s.fan.x - x, s.fan.z - z) < 0.8) return "fan";
      if (s.objects.blower.enabled && Math.hypot(s.objects.blower.x - x, s.objects.blower.z - z) < 1.1) return "blower";
      if (s.objects.smoker.enabled && Math.hypot(s.objects.smoker.x - x, s.objects.smoker.z - z) < 0.5) return "smoker";
      if (s.objects.exhaust.enabled && Math.hypot(s.objects.exhaust.x - x, s.objects.exhaust.z - z) < 1.0) return "exhaust";
      for (const k of keys) {
        const o = s.objects[k];
        const r = k === "rig" ? 1.1 : BOUND_RADIUS[k as ObjKind] * 0.7;
        if (o.enabled && Math.hypot(o.x - x, o.z - z) < r) return k;
      }
      return null;
    };
    const onDown = (e: PointerEvent) => {
      const x = wx(e.offsetX);
      const z = wz(e.offsetY);
      const k = hitTest(x, z);
      const s = useLab.getState();
      s.select(k);
      if (!k) return;
      const cur = k === "fan" ? s.fan : s.objects[k];
      drag = { key: k, dx: cur.x - x, dz: cur.z - z };
      cv.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const x = wx(e.offsetX);
      const z = wz(e.offsetY);
      if (!drag) {
        cv.style.cursor = hitTest(x, z) ? "grab" : "default";
        return;
      }
      const nx = Math.min(DOMAIN.max[0] - 1, Math.max(DOMAIN.min[0] + 1, x + drag.dx));
      const nz = Math.min(DOMAIN.max[2] - 1, Math.max(DOMAIN.min[2] + 1, z + drag.dz));
      const s = useLab.getState();
      if (drag.key === "fan") s.setFan({ x: nx, z: nz });
      else s.setObj(drag.key, { x: nx, z: nz });
    };
    const onUp = () => (drag = null);
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);

    /* ---- speed backdrop from the field texture at the slice */
    let bgVersion = -1;
    const drawBackdrop = (y: number) => {
      const g = field.grid;
      const tex = field.tex;
      if (!g || !tex || bgVersion === field.version) return;
      bgVersion = field.version;
      if (bg.width !== g.nx || bg.height !== g.nz) {
        bg.width = g.nx;
        bg.height = g.nz;
      }
      const j = Math.max(0, Math.min(g.ny - 1, Math.floor(y / g.h)));
      const img = bgx.createImageData(g.nx, g.nz);
      for (let k = 0; k < g.nz; k++)
        for (let i = 0; i < g.nx; i++) {
          const t = tex[4 * (i + g.nx * (j + g.ny * k))] / 255;
          const o = 4 * (i + g.nx * k);
          img.data[o] = 6 + 40 * t;
          img.data[o + 1] = 22 + 90 * t;
          img.data[o + 2] = 58 + 150 * t;
          img.data[o + 3] = 255;
        }
      bgx.putImageData(img, 0, 0);
    };

    const BUCKETS = 10;
    const paths: number[][] = Array.from({ length: BUCKETS }, () => []);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // paused: the streaks freeze in place (the map keeps drawing so you can still pan/drag)
      const dt = useLab.getState().paused ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = useLab.getState();
      const y = s.slice;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#030a1c";
      ctx.fillRect(0, 0, W, H);

      // backdrop
      drawBackdrop(y);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(bg, sx(DOMAIN.min[0]), sz(DOMAIN.min[2]), DOMAIN_SIZE[0] * scale, DOMAIN_SIZE[2] * scale);
      ctx.globalAlpha = 1;

      // grid
      ctx.strokeStyle = "rgba(140,170,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(DOMAIN.min[0]); x <= DOMAIN.max[0]; x++) {
        ctx.moveTo(sx(x), sz(DOMAIN.min[2]));
        ctx.lineTo(sx(x), sz(DOMAIN.max[2]));
      }
      for (let z = Math.ceil(DOMAIN.min[2]); z <= DOMAIN.max[2]; z++) {
        ctx.moveTo(sx(DOMAIN.min[0]), sz(z));
        ctx.lineTo(sx(DOMAIN.max[0]), sz(z));
      }
      ctx.stroke();

      // streaks
      for (const p of paths) p.length = 0;
      const len = 0.16;
      for (let i = 0; i < N; i++) {
        age[i] += dt;
        if (age[i] > life[i]) {
          px[i] = DOMAIN.min[0] + Math.random() * DOMAIN_SIZE[0];
          pz[i] = DOMAIN.min[2] + Math.random() * DOMAIN_SIZE[2];
          age[i] = 0;
          life[i] = 1.5 + Math.random() * 2.5;
          continue;
        }
        const sp = sampleVel(px[i], y, pz[i], v);
        const hx = v[0];
        const hz = v[2];
        const hs = Math.hypot(hx, hz);
        px[i] += hx * dt;
        pz[i] += hz * dt;
        if (px[i] < DOMAIN.min[0] || px[i] > DOMAIN.max[0] || pz[i] < DOMAIN.min[2] || pz[i] > DOMAIN.max[2] || solidAt(px[i], y, pz[i])) {
          age[i] = 99;
          continue;
        }
        if (hs < 0.05) continue;
        const b = Math.min(BUCKETS - 1, Math.floor((sp / VMAX) * BUCKETS * 1.15));
        const l = Math.min(1.2, 0.08 + hs * len);
        const p = paths[b];
        p.push(sx(px[i] - (hx / hs) * l), sz(pz[i] - (hz / hs) * l), sx(px[i]), sz(pz[i]));
      }
      ctx.lineCap = "round";
      for (let b = 0; b < BUCKETS; b++) {
        const p = paths[b];
        if (!p.length) continue;
        const t = (b + 0.5) / BUCKETS;
        const r = Math.round(40 + 215 * t * t);
        const g = Math.round(110 + 145 * t);
        ctx.strokeStyle = `rgba(${r},${g},255,${0.25 + 0.6 * t})`;
        ctx.lineWidth = 0.8 + 1.1 * t;
        ctx.beginPath();
        for (let i = 0; i < p.length; i += 4) {
          ctx.moveTo(p[i], p[i + 1]);
          ctx.lineTo(p[i + 2], p[i + 3]);
        }
        ctx.stroke();
      }

      // obstacles: true cross-section at the slice height
      for (const k of KINDS) {
        const o = s.objects[k];
        if (!o.enabled) continue;
        const yaw = (o.yaw * Math.PI) / 180;
        const c = Math.cos(yaw);
        const sn = Math.sin(yaw);
        const toW = (lx: number, lz: number): [number, number] => [sx(o.x + c * lx + sn * lz), sz(o.z - sn * lx + c * lz)];
        for (const prim of SHAPES[k]) {
          for (const sec of sectionOf(prim, y)) {
            ctx.beginPath();
            if (sec.t === "poly") {
              sec.pts.forEach(([a, b2], i) => {
                const [X, Y] = toW(a, b2);
                if (i) ctx.lineTo(X, Y);
                else ctx.moveTo(X, Y);
              });
              ctx.closePath();
            } else {
              const [X, Y] = toW(sec.cx, sec.cz);
              ctx.ellipse(X, Y, sec.rx * scale, sec.rz * scale, -yaw, 0, Math.PI * 2);
            }
            if (sec.porous) {
              ctx.fillStyle = "rgba(120,220,160,0.16)";
              ctx.strokeStyle = "rgba(150,240,180,0.55)";
              ctx.setLineDash([4, 4]);
              ctx.fill();
              ctx.stroke();
              ctx.setLineDash([]);
            } else {
              ctx.fillStyle = "#e9eef7";
              ctx.shadowColor = "rgba(170,200,255,0.5)";
              ctx.shadowBlur = 12;
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }
        }
        if (s.selected === k) {
          ctx.strokeStyle = "#ff7a1a";
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.arc(sx(o.x), sz(o.z), BOUND_RADIUS[k] * 0.95 * scale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // stand fan (only when it is in the scene)
      if (s.fan.enabled) {
        const f = field.fan;
        const dx = f.d[0];
        const dz = f.d[2];
        const dl = Math.hypot(dx, dz) || 1;
        const ux = dx / dl;
        const uz = dz / dl;
        const cx = sx(f.c[0]);
        const cz = sz(f.c[2]);
        ctx.strokeStyle = "#ff6a1a";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - uz * 0.75 * scale, cz + ux * 0.75 * scale);
        ctx.lineTo(cx + uz * 0.75 * scale, cz - ux * 0.75 * scale);
        ctx.stroke();
        ctx.fillStyle = "#1a1c22";
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx(s.fan.x), sz(s.fan.z), 0.47 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        arrow(ctx, cx, cz, cx + ux * 1.4 * scale, cz + uz * 1.4 * scale, "#ff6a1a", 2);
        label(ctx, `FAN ${Math.round(f.headYaw)}°`, cx - uz * 1.1 * scale - 30, cz + ux * 1.1 * scale + 4, "#ff9a5a");
      }

      // industrial blower: drum seen from above + outflow arrow
      const bl = s.objects.blower;
      const bd = field.discs.blower;
      if (bl.enabled && bd) {
        const l = Math.hypot(bd.d[0], bd.d[2]) || 1;
        const ux = bd.d[0] / l;
        const uz = bd.d[2] / l;
        const X = sx(bl.x);
        const Y = sz(bl.z);
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(Math.atan2(uz, ux));
        ctx.fillStyle = "#1a1c22";
        ctx.strokeStyle = s.selected === "blower" ? "#ff7a1a" : "rgba(255,255,255,0.4)";
        ctx.fillRect(-0.3 * scale, -1.05 * scale, 0.6 * scale, 2.1 * scale);
        ctx.strokeRect(-0.3 * scale, -1.05 * scale, 0.6 * scale, 2.1 * scale);
        ctx.restore();
        const al = 1.6 * scale * Math.max(0.2, bd.U / 11);
        arrow(ctx, X, Y, X + ux * al, Y + uz * al, "#ff6a1a", 2.5);
        label(ctx, `BLOWER ${bd.U.toFixed(1)} m/s`, X - 40, Y - 1.2 * scale, "#ff9a5a");
      }

      // smoke machine nozzle
      const sm = s.objects.smoker;
      if (sm.enabled) {
        const X = sx(field.smoker.c[0]);
        const Y = sz(field.smoker.c[2]);
        ctx.fillStyle = s.selected === "smoker" ? "#ff7a1a" : "#c9d2de";
        ctx.beginPath();
        ctx.arc(X, Y, 5, 0, Math.PI * 2);
        ctx.fill();
        label(ctx, "SMOKE", X - 18, Y - 9, "#c9d2de");
      }

      // exhaust fan: housing seen from above, arrow = outflow
      const ex = s.objects.exhaust;
      if (ex.enabled) {
        const e = field.exhaust;
        const el = Math.hypot(e.d[0], e.d[2]) || 1;
        const ex1 = e.d[0] / el;
        const ez1 = e.d[2] / el;
        const X = sx(ex.x);
        const Y = sz(ex.z);
        const hw = 0.95 * scale;
        ctx.save();
        ctx.translate(X, Y);
        ctx.rotate(Math.atan2(ez1, ex1));
        ctx.fillStyle = "#1a1c22";
        ctx.strokeStyle = s.selected === "exhaust" ? "#ff7a1a" : "rgba(255,255,255,0.35)";
        ctx.fillRect(-0.25 * scale, -hw, 0.5 * scale, 2 * hw);
        ctx.strokeRect(-0.25 * scale, -hw, 0.5 * scale, 2 * hw);
        ctx.restore();
        const al = 1.3 * scale * Math.max(0.2, e.U / 7.5);
        arrow(ctx, X, Y, X + ex1 * al, Y + ez1 * al, "#ff6a1a", 2);
        label(ctx, `EXHAUST ${Math.round((e.U / 7.5) * 100)}%`, X - 34, Y - hw - 8, "#ff9a5a");
      }

      // forces: drag along the oncoming wind, side force across it
      for (const k of KINDS) {
        const o = s.objects[k];
        const F = field.forces[k];
        if (!o.enabled || !F) continue;
        let wxd = o.x - s.fan.x;
        let wzd = o.z - s.fan.z;
        const wl = Math.hypot(wxd, wzd) || 1;
        wxd /= wl;
        wzd /= wl;
        const D = F[0] * wxd + F[2] * wzd;
        const S = -F[0] * wzd + F[2] * wxd;
        const X = sx(o.x);
        const Y = sz(o.z);
        // log-scaled arrows so a 1 N and a 100 N force both read
        const al = (f: number) => Math.sign(f) * Math.min(110, 22 * Math.log2(1 + Math.abs(f)));
        const ld = al(D);
        const ls = al(S);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(X, Y, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        arrow(ctx, X, Y, X + wxd * ld, Y + wzd * ld, "#ff4d4d", 2);
        arrow(ctx, X, Y, X - wzd * ls, Y + wxd * ls, "#3ee08f", 2);
        label(ctx, `D ${D.toFixed(1)} N`, X + wxd * ld + 6, Y + wzd * ld - 6, "#ff8080");
        label(ctx, `S ${S.toFixed(1)} N`, X - wzd * ls + 6, Y + wxd * ls + 14, "#7ff0b4");
        label(ctx, `${OBJ_LABEL[k].toUpperCase()} · lift ${F[1].toFixed(1)} N`, X - 40, Y - 26, "rgba(220,230,245,0.8)");
      }

      // HUD
      ctx.strokeStyle = "rgba(255,122,26,0.5)";
      ctx.strokeRect(sx(DOMAIN.min[0]), sz(DOMAIN.min[2]), DOMAIN_SIZE[0] * scale, DOMAIN_SIZE[2] * scale);
      label(ctx, `PLAN SLICE  y = ${y.toFixed(2)} m   ·   1 grid = 1 m`, sx(DOMAIN.min[0]), sz(DOMAIN.min[2]) - 10, "rgba(200,215,235,0.75)");
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
    };
  }, [view]);

  if (view !== "2d") return null;
  return <canvas ref={canvas} className="map2d" aria-label="Plan view of the wind field at the slice height" />;
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy);
  if (l < 3) return;
  const ux = dx / l;
  const uy = dy / l;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1 + ux * 6, y1 + uy * 6);
  ctx.lineTo(x1 - uy * 4, y1 + ux * 4);
  ctx.lineTo(x1 + uy * 4, y1 - ux * 4);
  ctx.closePath();
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.font = "500 11px ui-monospace, 'Geist Mono', monospace";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
