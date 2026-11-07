"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { field } from "@/sim/field";
import { useLab } from "@/lib/store";

/**
 * The test hall around the simulated volume: an aerodynamics / vehicle-safety lab.
 * Purely decorative and kept outside the solver's domain (x -7..17, z -6..6),
 * so none of it disturbs the airflow.
 *
 * Hall: x -11..21, z -9.5..9.5, 8 m high, open towards the camera.
 */
const HALL = { x0: -11, x1: 21, z0: -9.5, z1: 9.5, h: 8 };

/* ------------------------------------------------------- canvas helpers */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SANS = "600 {s}px ui-sans-serif, system-ui, 'Segoe UI', sans-serif";
const MONO = "500 {s}px ui-monospace, 'Cascadia Mono', Consolas, monospace";
const font = (f: string, s: number) => f.replace("{s}", String(s));

function hazard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = "#151515";
  g.fillRect(x, y, w, h);
  g.fillStyle = "#f2b31a";
  for (let i = -h; i < w + h; i += step * 2) {
    g.beginPath();
    g.moveTo(x + i, y + h);
    g.lineTo(x + i + step, y + h);
    g.lineTo(x + i + step + h, y);
    g.lineTo(x + i + h, y);
    g.fill();
  }
  g.restore();
}

/** Dark acoustic wall panels, kick plate, hazard band and optional signage. */
function wallTexture(widthM: number, heightM: number, sign?: (g: CanvasRenderingContext2D, ppm: number, W: number, H: number) => void) {
  const ppm = 64;
  return canvasTexture(Math.round(widthM * ppm), Math.round(heightM * ppm), (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#1d2127");
    grd.addColorStop(1, "#2a2f36");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // panels 1.2 m wide, seams + subtle perforation shading
    for (let x = 0; x < W; x += 1.2 * ppm) {
      g.fillStyle = "rgba(255,255,255,0.025)";
      g.fillRect(x + 4, 0, 1.2 * ppm - 8, H);
      g.fillStyle = "#121418";
      g.fillRect(x, 0, 3, H);
    }
    g.fillStyle = "#121418";
    g.fillRect(0, H - 4.2 * ppm, W, 3);
    // kick plate and hazard band
    g.fillStyle = "#0c0d10";
    g.fillRect(0, H - 0.35 * ppm, W, 0.35 * ppm);
    hazard(g, 0, H - 0.55 * ppm, W, 0.2 * ppm, 0.22 * ppm);
    sign?.(g, ppm, W, H);
  });
}

/* ---------------------------------------------------------------- walls */

function Walls() {
  const { back, left, right } = useMemo(() => {
    const bw = HALL.x1 - HALL.x0;
    const sw = HALL.z1 - HALL.z0;
    const back = wallTexture(bw, HALL.h, (g, ppm) => {
      // main sign
      const x = 12.2 * ppm;
      const y = 5.0 * ppm;
      g.fillStyle = "#0b0c0f";
      g.fillRect(x - 0.3 * ppm, y - 1.15 * ppm, 9.6 * ppm, 1.75 * ppm);
      g.fillStyle = "#ff6a1a";
      g.fillRect(x - 0.3 * ppm, y - 1.15 * ppm, 0.12 * ppm, 1.75 * ppm);
      g.fillStyle = "#eef2f6";
      g.font = font(SANS, 0.72 * ppm);
      g.fillText("AERO TEST HALL 01", x, y - 0.3 * ppm);
      g.fillStyle = "#9aa5b3";
      g.font = font(MONO, 0.26 * ppm);
      g.fillText("VEHICLE AERODYNAMICS & SAFETY LABORATORY", x, y + 0.25 * ppm);
      // zone warnings
      const warn = (wx: number, text: string) => {
        g.fillStyle = "#f2b31a";
        g.fillRect(wx, 6.0 * ppm, 2.6 * ppm, 0.5 * ppm);
        g.fillStyle = "#111";
        g.font = font(SANS, 0.22 * ppm);
        g.fillText(text, wx + 0.15 * ppm, 6.33 * ppm);
      };
      warn(4.6 * ppm, "⚠ WIND ZONE — KEEP CLEAR");
      warn(24.6 * ppm, "⚠ HIGH-SPEED CAMERAS");
      // bay numbers
      g.fillStyle = "rgba(230,236,244,0.5)";
      g.font = font(SANS, 1.2 * ppm);
      g.fillText("A", 1.0 * ppm, 2.4 * ppm);
      g.fillText("B", 29.6 * ppm, 2.4 * ppm);
    });
    const left = wallTexture(sw, HALL.h, (g, ppm) => {
      // roll-up loading door
      const x = 5.5 * ppm;
      const w = 8 * ppm;
      const top = HALL.h * ppm - 5.2 * ppm;
      g.fillStyle = "#3b4047";
      g.fillRect(x, top, w, 4.85 * ppm);
      for (let y = top; y < top + 4.85 * ppm; y += 0.18 * ppm) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(x, y, w, 2);
      }
      hazard(g, x - 0.25 * ppm, top - 0.25 * ppm, w + 0.5 * ppm, 0.25 * ppm, 0.2 * ppm);
      g.fillStyle = "#eef2f6";
      g.font = font(SANS, 0.5 * ppm);
      g.fillText("BAY 2 · VEHICLE ENTRY", x, top - 0.5 * ppm);
    });
    const right = wallTexture(sw, HALL.h, (g, ppm) => {
      g.fillStyle = "#eef2f6";
      g.font = font(SANS, 0.45 * ppm);
      g.fillText("CRASH BARRIER · 64 km/h ODB", 3.2 * ppm, 2.2 * ppm);
      g.fillStyle = "#9aa5b3";
      g.font = font(MONO, 0.22 * ppm);
      g.fillText("LOAD CELL WALL  ·  128 CH  ·  ISO 6487", 3.2 * ppm, 2.65 * ppm);
    });
    return { back, left, right };
  }, []);
  const cx = (HALL.x0 + HALL.x1) / 2;
  const cz = (HALL.z0 + HALL.z1) / 2;
  const bw = HALL.x1 - HALL.x0;
  const sw = HALL.z1 - HALL.z0;
  return (
    <group>
      <mesh position={[cx, HALL.h / 2, HALL.z0]}>
        <planeGeometry args={[bw, HALL.h]} />
        <meshStandardMaterial map={back} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[HALL.x0, HALL.h / 2, cz]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[sw, HALL.h]} />
        <meshStandardMaterial map={left} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[HALL.x1, HALL.h / 2, cz]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[sw, HALL.h]} />
        <meshStandardMaterial map={right} roughness={0.85} metalness={0.05} />
      </mesh>
      {/* cable tray along the walls */}
      <mesh position={[cx, 5.6, HALL.z0 + 0.25]}>
        <boxGeometry args={[bw, 0.08, 0.4]} />
        <meshStandardMaterial color="#5b626b" metalness={0.7} roughness={0.4} />
      </mesh>
      {[0.55, 0.75].map((y) => (
        <mesh key={y} position={[cx, 5.6 + y, HALL.z0 + 0.12]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.06, 0.06, bw, 12]} />
          <meshStandardMaterial color={y > 0.6 ? "#3e78c2" : "#9aa3ad"} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------- ceiling */

function Ceiling() {
  const strips = [-6.75, -2.25, 2.25, 6.75];
  const beams = [-8, -2, 4, 10, 16];
  return (
    <group>
      {strips.map((z) => (
        <group key={z} position={[5, 7.4, z]}>
          <mesh>
            <boxGeometry args={[27, 0.06, 0.28]} />
            <meshBasicMaterial color="#eef4ff" toneMapped={false} />
          </mesh>
          <mesh position-y={0.08}>
            <boxGeometry args={[27.2, 0.1, 0.36]} />
            <meshStandardMaterial color="#2a2e34" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {beams.map((x) => (
        <group key={x} position={[x, 7.85, 0]}>
          <mesh>
            <boxGeometry args={[0.3, 0.35, HALL.z1 - HALL.z0]} />
            <meshStandardMaterial color="#3a4048" metalness={0.7} roughness={0.35} />
          </mesh>
          {/* overhead camera rail */}
          <mesh position={[0, -0.6, 0]}>
            <boxGeometry args={[0.08, 0.08, 12]} />
            <meshStandardMaterial color="#14161a" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------- lab props */

const dark = { color: "#1c1f24", metalness: 0.5, roughness: 0.45 };

function Rack({ position, seed }: { position: [number, number, number]; seed: number }) {
  const tex = useMemo(
    () =>
      canvasTexture(256, 768, (g, W, H) => {
        g.fillStyle = "#111318";
        g.fillRect(0, 0, W, H);
        let rnd = seed;
        const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
        let y = 14;
        while (y < H - 40) {
          const u = 40 + Math.floor(r() * 3) * 26;
          g.fillStyle = r() > 0.5 ? "#d9dde2" : "#2b3038";
          g.fillRect(12, y, W - 24, u - 6);
          // 7-seg style readout
          g.fillStyle = "#0a0a0a";
          g.fillRect(26, y + 8, 110, 22);
          g.fillStyle = r() > 0.3 ? "#ff3b30" : "#3ee08f";
          g.font = font(MONO, 18);
          g.fillText((r() * 99).toFixed(r() > 0.5 ? 3 : 1), 32, y + 26);
          for (let k = 0; k < 4; k++) {
            g.fillStyle = r() > 0.6 ? "#3ee08f" : r() > 0.5 ? "#ffb020" : "#444";
            g.beginPath();
            g.arc(160 + k * 18, y + 19, 5, 0, Math.PI * 2);
            g.fill();
          }
          y += u;
        }
      }),
    [seed],
  );
  return (
    <group position={position}>
      <mesh position-y={1.05}>
        <boxGeometry args={[0.7, 2.1, 0.8]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      <mesh position={[0, 1.05, 0.401]}>
        <planeGeometry args={[0.62, 1.95]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.35} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Big wall screen with live read-outs from the simulation. */
function LiveScreen({ position }: { position: [number, number, number] }) {
  const { tex, canvas } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 400;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { tex: t, canvas: c };
  }, []);
  const hist = useRef<number[]>([]);
  const last = useRef(0);
  useFrame((st) => {
    const now = st.clock.elapsedTime;
    if (now - last.current < 0.25) return;
    last.current = now;
    const s = useLab.getState();
    const g = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = "#060a12";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#ff6a1a";
    g.fillRect(0, 0, W, 6);
    g.fillStyle = "#e8ecf2";
    g.font = font(SANS, 30);
    g.fillText("LIVE · AERO RUN", 28, 50);
    g.fillStyle = "#3ee08f";
    g.beginPath();
    g.arc(W - 40, 40, 9, 0, Math.PI * 2);
    if (Math.floor(now * 2) % 2) g.fill();
    const carF = field.forces.car;
    const rows: [string, string][] = [
      ["FAN EXIT", `${field.fan.U.toFixed(1)} m/s`],
      ["HEAD YAW", `${Math.round(field.fan.headYaw)}°`],
      ["PEAK AIR", `${s.stats.maxSpeed.toFixed(1)} m/s`],
      ["CAR DRAG", carF ? `${carF[0].toFixed(1)} N` : "—"],
      ["SOLVER", `${s.stats.simHz} Hz · ${s.stats.grid}`],
    ];
    g.font = font(MONO, 26);
    rows.forEach(([k, v], i) => {
      g.fillStyle = "#7d8796";
      g.fillText(k, 28, 110 + i * 56);
      g.fillStyle = "#ffffff";
      g.fillText(v, 230, 110 + i * 56);
    });
    // speed trace
    hist.current.push(s.stats.maxSpeed);
    if (hist.current.length > 120) hist.current.shift();
    const gx = 560;
    const gw = W - gx - 30;
    const gy = 80;
    const gh = H - 120;
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      g.beginPath();
      g.moveTo(gx, gy + (gh * k) / 4);
      g.lineTo(gx + gw, gy + (gh * k) / 4);
      g.stroke();
    }
    g.strokeStyle = "#2f8cff";
    g.lineWidth = 3;
    g.beginPath();
    hist.current.forEach((v, i) => {
      const x = gx + (i / 119) * gw;
      const y = gy + gh - (Math.min(v, 8) / 8) * gh;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    g.fillStyle = "#7d8796";
    g.font = font(MONO, 18);
    g.fillText("PEAK AIR SPEED  0–8 m/s", gx, gy - 14);
    tex.needsUpdate = true;
  });
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[4.3, 1.75, 0.08]} />
        <meshStandardMaterial color="#0c0d10" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position-z={0.045}>
        <planeGeometry args={[4.15, 1.62]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Workbench({ position }: { position: [number, number, number] }) {
  const monitor = useMemo(
    () =>
      canvasTexture(512, 300, (g, W, H) => {
        g.fillStyle = "#08101c";
        g.fillRect(0, 0, W, H);
        const cols = ["#2f8cff", "#3ee08f", "#ffb020", "#ff4d4d"];
        cols.forEach((c, k) => {
          g.strokeStyle = c;
          g.lineWidth = 2;
          g.beginPath();
          for (let x = 0; x < W; x += 4) {
            const y = H * (0.25 + k * 0.17) + Math.sin(x * 0.04 + k) * 14 * Math.exp(-x / 300) + Math.sin(x * 0.2 + k * 3) * 3;
            if (x) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
          g.stroke();
        });
        g.fillStyle = "#e8ecf2";
        g.font = font(MONO, 16);
        g.fillText("Cp  ·  NOSE / ROOF / TAIL / WAKE", 12, 22);
      }),
    [],
  );
  return (
    <group position={position}>
      <mesh position-y={0.9}>
        <boxGeometry args={[2.6, 0.05, 0.8]} />
        <meshStandardMaterial color="#8d949c" metalness={0.3} roughness={0.5} />
      </mesh>
      {[
        [-1.2, -0.32],
        [1.2, -0.32],
        [-1.2, 0.32],
        [1.2, 0.32],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.45, z]}>
          <boxGeometry args={[0.05, 0.9, 0.05]} />
          <meshStandardMaterial color="#e6e9ec" metalness={0.4} roughness={0.4} />
        </mesh>
      ))}
      {[-0.55, 0.55].map((x) => (
        <group key={x} position={[x, 0.93, -0.15]}>
          <mesh position-y={0.22}>
            <boxGeometry args={[0.04, 0.44, 0.04]} />
            <meshStandardMaterial {...dark} />
          </mesh>
          <mesh position={[0, 0.55, 0.03]}>
            <boxGeometry args={[0.9, 0.52, 0.03]} />
            <meshStandardMaterial {...dark} />
          </mesh>
          <mesh position={[0, 0.55, 0.047]}>
            <planeGeometry args={[0.86, 0.48]} />
            <meshBasicMaterial map={monitor} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.94, 0.15]}>
        <boxGeometry args={[0.5, 0.025, 0.16]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      {/* lab stool */}
      <group position={[0.4, 0, 0.75]}>
        <mesh position-y={0.62}>
          <cylinderGeometry args={[0.2, 0.2, 0.07, 20]} />
          <meshStandardMaterial color="#15171b" roughness={0.6} />
        </mesh>
        <mesh position-y={0.31}>
          <cylinderGeometry args={[0.025, 0.025, 0.62, 8]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position-y={0.25} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.2, 0.012, 6, 24]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function Whiteboard({ position }: { position: [number, number, number] }) {
  const tex = useMemo(
    () =>
      canvasTexture(1024, 512, (g, W, H) => {
        g.fillStyle = "#f4f6f8";
        g.fillRect(0, 0, W, H);
        g.lineCap = "round";
        const ink = ["#1d3fbf", "#c62828", "#1b1b1b", "#2e7d32"];
        g.font = "28px 'Segoe Print', 'Comic Sans MS', cursive";
        const lines = ["Cp = (p − p∞) / ½ρU²", "Re = ρUL/μ ≈ 3.2·10⁵", "Cd ≈ 0.31 → target 0.28", "∇·u = 0", "F = −∮ p n dA"];
        lines.forEach((t, i) => {
          g.fillStyle = ink[i % ink.length];
          g.fillText(t, 40 + (i % 2) * 470, 70 + Math.floor(i / 2) * 70);
        });
        // car sketch with streamlines
        g.strokeStyle = "#1b1b1b";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(560, 420);
        g.bezierCurveTo(580, 330, 700, 310, 760, 330);
        g.bezierCurveTo(820, 300, 920, 330, 960, 420);
        g.closePath();
        g.stroke();
        g.strokeStyle = "#1d3fbf";
        g.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.moveTo(480, 300 + k * 26);
          g.bezierCurveTo(620, 290 + k * 18 - 40, 860, 280 + k * 18 - 40, 1000, 300 + k * 26);
          g.stroke();
        }
        g.strokeStyle = "#c62828";
        g.beginPath();
        g.arc(250, 380, 70, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "#c62828";
        g.fillText("stagnation", 190, 480);
      }),
    [],
  );
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[4.1, 2.1, 0.05]} />
        <meshStandardMaterial color="#b8bec5" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position-z={0.03}>
        <planeGeometry args={[3.95, 1.95]} />
        <meshStandardMaterial map={tex} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** Seated crash-test dummy, yellow with black calibration targets. */
function Dummy({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const target = useMemo(
    () =>
      canvasTexture(128, 128, (g) => {
        g.fillStyle = "#f2c230";
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#111";
        g.beginPath();
        g.moveTo(64, 64);
        g.arc(64, 64, 52, 0, Math.PI / 2);
        g.fill();
        g.beginPath();
        g.moveTo(64, 64);
        g.arc(64, 64, 52, Math.PI, Math.PI * 1.5);
        g.fill();
        g.strokeStyle = "#111";
        g.lineWidth = 4;
        g.beginPath();
        g.arc(64, 64, 52, 0, Math.PI * 2);
        g.stroke();
      }),
    [],
  );
  const skin = { color: "#f2c230", roughness: 0.45, metalness: 0.05 };
  const joint = { color: "#1a1a1a", roughness: 0.5 };
  return (
    <group position={position} rotation-y={rotationY}>
      {/* bench */}
      <mesh position-y={0.24}>
        <boxGeometry args={[0.7, 0.48, 1.6]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      <group position={[0.05, 0.48, 0]}>
        {/* pelvis + torso */}
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.36]} />
          <meshStandardMaterial {...skin} />
        </mesh>
        <mesh position={[-0.04, 0.48, 0]} rotation-z={0.08}>
          <boxGeometry args={[0.26, 0.5, 0.42]} />
          <meshStandardMaterial {...skin} />
        </mesh>
        <mesh position={[0.091, 0.5, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.16, 0.16]} />
          <meshStandardMaterial map={target} />
        </mesh>
        {/* neck + head */}
        <mesh position={[-0.06, 0.78, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.1, 12]} />
          <meshStandardMaterial {...joint} />
        </mesh>
        <mesh position={[-0.06, 0.93, 0]} scale={[1, 1.15, 0.92]}>
          <sphereGeometry args={[0.12, 24, 18]} />
          <meshStandardMaterial {...skin} />
        </mesh>
        <mesh position={[-0.06, 0.94, 0.112]}>
          <circleGeometry args={[0.05, 20]} />
          <meshStandardMaterial map={target} />
        </mesh>
        {/* arms */}
        {[-1, 1].map((s) => (
          <group key={s} position={[-0.04, 0.66, s * 0.26]}>
            <mesh position={[0.04, -0.15, 0]} rotation-z={-0.25}>
              <capsuleGeometry args={[0.05, 0.22, 4, 10]} />
              <meshStandardMaterial {...skin} />
            </mesh>
            <mesh position={[0.16, -0.32, 0]} rotation-z={-1.2}>
              <capsuleGeometry args={[0.045, 0.2, 4, 10]} />
              <meshStandardMaterial {...skin} />
            </mesh>
          </group>
        ))}
        {/* legs: thighs forward, shins down */}
        {[-1, 1].map((s) => (
          <group key={s} position={[0.05, 0.1, s * 0.1]}>
            <mesh position={[0.22, 0, 0]} rotation-z={Math.PI / 2}>
              <capsuleGeometry args={[0.07, 0.3, 4, 10]} />
              <meshStandardMaterial {...skin} />
            </mesh>
            <mesh position={[0.42, 0, 0]}>
              <sphereGeometry args={[0.07, 12, 10]} />
              <meshStandardMaterial {...joint} />
            </mesh>
            <mesh position={[0.45, -0.25, 0]}>
              <capsuleGeometry args={[0.055, 0.3, 4, 10]} />
              <meshStandardMaterial {...skin} />
            </mesh>
            <mesh position={[0.52, -0.46, 0]}>
              <boxGeometry args={[0.2, 0.06, 0.09]} />
              <meshStandardMaterial {...joint} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** High-speed camera on a tripod, aimed at the test zone centre. */
function CameraTripod({ position }: { position: [number, number, number] }) {
  const yaw = Math.atan2(-(5 - position[0]), -(0 - position[2]));
  return (
    <group position={position} rotation-y={yaw}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.25, 0.75, Math.cos(a) * 0.25]} rotation={[Math.cos(a) * -0.33, 0, Math.sin(a) * 0.33]}>
            <cylinderGeometry args={[0.015, 0.015, 1.55, 6]} />
            <meshStandardMaterial {...dark} />
          </mesh>
        );
      })}
      <mesh position-y={1.6}>
        <boxGeometry args={[0.2, 0.18, 0.34]} />
        <meshStandardMaterial color="#e9ecef" metalness={0.3} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.6, -0.24]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.07, 0.07, 0.16, 18]} />
        <meshStandardMaterial color="#111" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.06, 1.71, 0.1]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial color="#ff2d3a" toneMapped={false} />
      </mesh>
      {/* LED panel light next to it */}
      <group position={[0.7, 0, 0]}>
        <mesh position-y={1.0}>
          <cylinderGeometry args={[0.018, 0.018, 2.0, 6]} />
          <meshStandardMaterial {...dark} />
        </mesh>
        <mesh position={[0, 2.05, 0]} rotation-x={0.35}>
          <boxGeometry args={[0.55, 0.38, 0.05]} />
          <meshStandardMaterial {...dark} />
        </mesh>
        <mesh position={[0, 2.05, -0.03]} rotation-x={0.35}>
          <planeGeometry args={[0.5, 0.33]} />
          <meshBasicMaterial color="#f4f8ff" toneMapped={false} side={THREE.BackSide} />
        </mesh>
      </group>
    </group>
  );
}

function Cone({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={0.26}>
        <cylinderGeometry args={[0.025, 0.16, 0.5, 18]} />
        <meshStandardMaterial color="#ff5a12" roughness={0.5} />
      </mesh>
      <mesh position-y={0.3}>
        <cylinderGeometry args={[0.07, 0.1, 0.08, 18]} />
        <meshStandardMaterial color="#f4f4f4" roughness={0.4} />
      </mesh>
      <mesh position-y={0.015}>
        <boxGeometry args={[0.36, 0.03, 0.36]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
      </mesh>
    </group>
  );
}

function CrashBarrier() {
  const chevron = useMemo(
    () =>
      canvasTexture(1024, 256, (g, W, H) => {
        hazard(g, 0, 0, W, H, 64);
      }),
    [],
  );
  return (
    <group position={[20.4, 0, 0]}>
      <mesh position-y={0.75}>
        <boxGeometry args={[1.0, 1.5, 6.4]} />
        <meshStandardMaterial color="#2c3037" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[-0.505, 0.75, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[6.4, 1.2]} />
        <meshStandardMaterial map={chevron} roughness={0.6} />
      </mesh>
      {/* honeycomb deformable face */}
      <mesh position={[-0.65, 0.7, 0]}>
        <boxGeometry args={[0.3, 0.6, 1.0]} />
        <meshStandardMaterial color="#b9c0c8" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

function ToolChest({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position-y={0.55}>
        <boxGeometry args={[1.1, 1.0, 0.55]} />
        <meshStandardMaterial color="#c4161c" metalness={0.4} roughness={0.35} />
      </mesh>
      {[0.2, 0.4, 0.6, 0.8].map((y) => (
        <mesh key={y} position={[0, 0.05 + y, 0.28]}>
          <boxGeometry args={[0.9, 0.02, 0.01]} />
          <meshStandardMaterial color="#d8dde2" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.03, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 10]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </group>
  );
}

export function LabHall() {
  const zb = HALL.z0 + 0.55;
  return (
    <group>
      <Walls />
      <Ceiling />
      <hemisphereLight args={["#dfe8ff", "#2a2e34", 0.55]} />
      {/* back wall: instruments, engineering bench, live screen, whiteboard, dummy */}
      <Rack position={[-9.9, 0, zb]} seed={7} />
      <Rack position={[-9.1, 0, zb]} seed={19} />
      <Rack position={[-8.3, 0, zb]} seed={41} />
      <Workbench position={[-4.2, 0, zb + 0.1]} />
      <LiveScreen position={[-4.2, 3.4, HALL.z0 + 0.06]} />
      <Whiteboard position={[1.8, 1.75, HALL.z0 + 0.05]} />
      <Dummy position={[8.2, 0, zb + 0.25]} rotationY={-Math.PI / 2} />
      <ToolChest position={[12.4, 0, zb]} />
      <Rack position={[16.6, 0, zb]} seed={77} />
      <Rack position={[17.4, 0, zb]} seed={91} />
      {/* high-speed cameras at the corners of the test zone */}
      <CameraTripod position={[-8.2, 0, -7.2]} />
      <CameraTripod position={[18.4, 0, -7.2]} />
      <CameraTripod position={[18.4, 0, 7.2]} />
      <CrashBarrier />
      {[-3, 1, 5, 9, 13].map((x) => (
        <Cone key={x} position={[x, 0, 8.2]} />
      ))}
      {[-9.8, -9.8].map((x, i) => (
        <Cone key={`l${i}`} position={[x, 0, i ? 3.5 : -3.5]} />
      ))}
    </group>
  );
}
