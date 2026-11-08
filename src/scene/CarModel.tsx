"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { F1_WHEELS } from "@/sim/obstacles";
import { makeHeatMaterial } from "./heatMaterial";

/**
 * A procedural open-wheel race car (F1-like). Front at -X, 5.05 m long. The solver sees
 * the matching primitives in `obstacles.ts` (chassis profile, sidepods, floor, wings,
 * wheels); this is the dressed-up version: lofted monocoque and sidepods, multi-element
 * front wing, rear wing with endplates, halo, airbox, suspension arms and wide tyres.
 */

interface Station {
  x: number;
  /** half width at the bottom and at the top of the section */
  w0: number;
  w1: number;
  y0: number;
  y1: number;
}

/** Lofts rounded sections (narrowing from w0 at the bottom to w1 at the top) into a closed tube. */
function loft(stations: Station[], ring = 36, exp = 3.2): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const e = 2 / exp;
  for (const s of stations) {
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const ty = Math.sign(sn) * Math.abs(sn) ** e;
      const t = (ty + 1) / 2;
      const w = s.w0 + (s.w1 - s.w0) * t;
      pos.push(s.x, s.y0 + (s.y1 - s.y0) * t, Math.sign(c) * Math.abs(c) ** e * w);
    }
  }
  const S = stations.length;
  for (let i = 0; i < S - 1; i++)
    for (let k = 0; k < ring; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      const c = (i + 1) * ring + k;
      const d = (i + 1) * ring + ((k + 1) % ring);
      idx.push(a, c, b, b, c, d);
    }
  for (const [si, flip] of [
    [0, false],
    [S - 1, true],
  ] as const) {
    const s = stations[si];
    const center = pos.length / 3;
    pos.push(s.x, (s.y0 + s.y1) / 2, 0);
    for (let k = 0; k < ring; k++) {
      const a = si * ring + k;
      const b = si * ring + ((k + 1) % ring);
      if (flip) idx.push(center, a, b);
      else idx.push(center, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function smooth(src: Station[], n: number): Station[] {
  const keys = ["x", "w0", "w1", "y0", "y1"] as const;
  const curves = keys.map((k) => new THREE.SplineCurve(src.map((s, i) => new THREE.Vector2(i, s[k]))));
  return Array.from({ length: n }, (_, i) => {
    const v = curves.map((c) => c.getPoint(i / (n - 1)).y);
    return { x: v[0], w0: v[1], w1: v[2], y0: v[3], y1: v[4] };
  });
}

const S = (x: number, w0: number, w1: number, y0: number, y1: number): Station => ({ x, w0, w1, y0, y1 });

/** nose + monocoque + engine cover */
const TUB = [
  S(-2.75, 0.09, 0.07, 0.13, 0.22),
  S(-2.4, 0.15, 0.11, 0.15, 0.3),
  S(-1.9, 0.23, 0.16, 0.16, 0.39),
  S(-1.3, 0.31, 0.23, 0.13, 0.49),
  S(-0.8, 0.39, 0.29, 0.1, 0.59),
  S(-0.45, 0.42, 0.31, 0.09, 0.65),
  S(0.0, 0.42, 0.24, 0.09, 0.72),
  S(0.45, 0.41, 0.2, 0.09, 0.76),
  S(0.9, 0.37, 0.14, 0.09, 0.7),
  S(1.4, 0.29, 0.1, 0.1, 0.59),
  S(1.9, 0.22, 0.08, 0.12, 0.49),
  S(2.3, 0.15, 0.06, 0.14, 0.42),
];
/** airbox over the driver's head, running back into the shark fin */
const AIRBOX = [
  S(-0.08, 0.1, 0.07, 0.64, 0.72),
  S(0.08, 0.14, 0.1, 0.66, 0.97),
  S(0.42, 0.13, 0.07, 0.68, 0.95),
  S(0.9, 0.08, 0.035, 0.62, 0.8),
  S(1.55, 0.035, 0.02, 0.55, 0.66),
];
/** one sidepod, centred on z = 0 (placed at ±0.6) */
const POD = [
  S(-0.55, 0.12, 0.1, 0.16, 0.44),
  S(-0.35, 0.19, 0.16, 0.13, 0.58),
  S(0.3, 0.2, 0.16, 0.12, 0.58),
  S(0.95, 0.16, 0.1, 0.12, 0.45),
  S(1.4, 0.08, 0.05, 0.13, 0.3),
];

/** thin cambered wing element along Z: chord along X */
function wingElement(chord: number, span: number, thick: number, camber: number) {
  const g = new THREE.BoxGeometry(chord, thick, span, 10, 1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / chord + 0.5; // 0..1 along the chord
    p.setY(i, p.getY(i) + camber * 4 * u * (1 - u));
  }
  g.computeVertexNormals();
  return g;
}

export function CarModel() {
  const m = useMemo(() => {
    const paint = makeHeatMaterial("#16181c", { roughness: 0.28, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, heat: 0.92 });
    const accent = makeHeatMaterial("#ff6a1a", { roughness: 0.35, metalness: 0.2, clearcoat: 1, heat: 0.5 });
    const carbon = makeHeatMaterial("#0b0c0e", { roughness: 0.45, metalness: 0.3, clearcoat: 0.6, heat: 0.6 });
    const white = makeHeatMaterial("#eef0f3", { roughness: 0.3, metalness: 0.2, clearcoat: 1, heat: 0.85 });
    const rubber = new THREE.MeshStandardMaterial({ color: "#111214", roughness: 0.9 });
    const stripe = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
    const rim = new THREE.MeshPhysicalMaterial({ color: "#2a2d33", metalness: 0.9, roughness: 0.3, clearcoat: 0.5 });
    const titanium = new THREE.MeshStandardMaterial({ color: "#8d949c", metalness: 1, roughness: 0.3 });
    const visor = new THREE.MeshPhysicalMaterial({ color: "#0a0d14", metalness: 0.6, roughness: 0.05, clearcoat: 1 });
    const helmet = new THREE.MeshPhysicalMaterial({ color: "#f4f5f7", roughness: 0.25, clearcoat: 1 });
    const rain = new THREE.MeshStandardMaterial({ color: "#ff2030", emissive: "#ff1525", emissiveIntensity: 3, toneMapped: false });

    const tub = loft(smooth(TUB, 60), 40, 3.4);
    const airbox = loft(smooth(AIRBOX, 30), 28, 3);
    const pod = loft(smooth(POD, 30), 32, 3.6);

    const fw1 = wingElement(0.42, 1.92, 0.025, 0.03);
    const fw2 = wingElement(0.24, 1.7, 0.02, 0.025);
    const fw3 = wingElement(0.16, 1.5, 0.018, 0.02);
    const rw1 = wingElement(0.36, 0.98, 0.03, 0.04);
    const rw2 = wingElement(0.2, 0.98, 0.02, 0.03);
    const beam = wingElement(0.22, 0.7, 0.02, 0.02);

    const tyreF = new THREE.CylinderGeometry(0.33, 0.33, 0.36, 40, 1);
    tyreF.rotateX(Math.PI / 2);
    const tyreR = new THREE.CylinderGeometry(0.35, 0.35, 0.44, 40, 1);
    tyreR.rotateX(Math.PI / 2);
    const halo = new THREE.TorusGeometry(0.33, 0.028, 10, 36, Math.PI);
    return { paint, accent, carbon, white, rubber, stripe, rim, titanium, visor, helmet, rain, tub, airbox, pod, fw1, fw2, fw3, rw1, rw2, beam, tyreF, tyreR, halo };
  }, []);

  /** suspension: two wishbone legs from the chassis to each upright */
  const arms = useMemo(() => {
    const out: { p: THREE.Vector3; q: THREE.Quaternion; len: number }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const w of F1_WHEELS) {
      const s = Math.sign(w.z);
      for (const [dy, dx] of [
        [0.08, -0.18],
        [0.08, 0.18],
        [-0.08, -0.16],
        [-0.08, 0.16],
      ]) {
        const a = new THREE.Vector3(w.x + dx, w.r + dy + 0.02, s * 0.3);
        const b = new THREE.Vector3(w.x, w.r + dy * 0.6, w.z - s * 0.1);
        const d = new THREE.Vector3().subVectors(b, a);
        out.push({ p: a.clone().add(b).multiplyScalar(0.5), q: new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()), len: d.length() });
      }
    }
    return out;
  }, []);

  return (
    <group>
      {/* monocoque, airbox, sidepods */}
      <mesh geometry={m.tub} material={m.paint} castShadow receiveShadow />
      <mesh geometry={m.airbox} material={m.paint} castShadow />
      {[-0.6, 0.6].map((z) => (
        <mesh key={z} geometry={m.pod} material={m.paint} position-z={z} castShadow />
      ))}
      {/* sidepod inlets */}
      {[-0.6, 0.6].map((z) => (
        <mesh key={`i${z}`} position={[-0.56, 0.36, z]} rotation-y={-Math.PI / 2} material={m.carbon}>
          <planeGeometry args={[0.3, 0.2]} />
        </mesh>
      ))}
      {/* nose tip + engine-cover stripe in the accent colour */}
      <mesh position={[-2.62, 0.18, 0]} material={m.accent}>
        <boxGeometry args={[0.26, 0.06, 0.16]} />
      </mesh>
      <mesh position={[0.95, 0.72, 0]} rotation-z={-0.18} material={m.accent}>
        <boxGeometry args={[0.9, 0.02, 0.1]} />
      </mesh>
      {/* floor */}
      <mesh position={[0.5, 0.06, 0]} material={m.carbon} castShadow>
        <boxGeometry args={[3.3, 0.03, 1.5]} />
      </mesh>
      {/* cockpit opening, driver's helmet, halo */}
      <mesh position={[-0.28, 0.655, 0]} rotation-x={-Math.PI / 2} material={m.carbon}>
        <circleGeometry args={[0.26, 28]} />
      </mesh>
      <group position={[-0.22, 0.74, 0]}>
        <mesh material={m.helmet} scale={[1.1, 1, 1]} castShadow>
          <sphereGeometry args={[0.13, 24, 18]} />
        </mesh>
        <mesh position={[-0.07, 0.01, 0]} rotation-y={-Math.PI / 2} material={m.visor}>
          <planeGeometry args={[0.17, 0.06]} />
        </mesh>
      </group>
      <mesh geometry={m.halo} material={m.titanium} position={[-0.2, 0.78, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} castShadow />
      <mesh position={[-0.55, 0.78, 0]} rotation-z={-0.45} material={m.titanium}>
        <cylinderGeometry args={[0.022, 0.022, 0.28, 10]} />
      </mesh>
      {/* front wing: three elements + endplates */}
      <mesh geometry={m.fw1} material={m.white} position={[-2.55, 0.1, 0]} castShadow />
      <mesh geometry={m.fw2} material={m.carbon} position={[-2.35, 0.17, 0]} rotation-z={0.25} />
      <mesh geometry={m.fw3} material={m.accent} position={[-2.2, 0.24, 0]} rotation-z={0.42} />
      {[-0.97, 0.97].map((z) => (
        <mesh key={z} position={[-2.45, 0.17, z]} material={m.carbon} castShadow>
          <boxGeometry args={[0.66, 0.2, 0.02]} />
        </mesh>
      ))}
      {/* rear wing: main plane, flap, endplates, beam wing, pylon, rain light */}
      <mesh geometry={m.rw1} material={m.paint} position={[2.3, 0.84, 0]} rotation-z={0.08} castShadow />
      <mesh geometry={m.rw2} material={m.accent} position={[2.5, 0.93, 0]} rotation-z={0.38} />
      {[-0.5, 0.5].map((z) => (
        <mesh key={z} position={[2.36, 0.68, z]} material={m.carbon} castShadow>
          <boxGeometry args={[0.66, 0.54, 0.02]} />
        </mesh>
      ))}
      <mesh geometry={m.beam} material={m.carbon} position={[2.28, 0.42, 0]} rotation-z={0.12} />
      <mesh position={[2.18, 0.62, 0]} material={m.carbon}>
        <boxGeometry args={[0.1, 0.42, 0.04]} />
      </mesh>
      <mesh position={[2.33, 0.3, 0]} material={m.rain}>
        <boxGeometry args={[0.02, 0.05, 0.12]} />
      </mesh>
      {/* mirrors */}
      {[-1, 1].map((s) => (
        <group key={s} position={[-0.62, 0.66, s * 0.47]}>
          <mesh material={m.paint}>
            <boxGeometry args={[0.07, 0.06, 0.14]} />
          </mesh>
          <mesh position={[0.05, -0.06, -s * 0.06]} material={m.carbon}>
            <boxGeometry args={[0.03, 0.08, 0.03]} />
          </mesh>
        </group>
      ))}
      {/* suspension */}
      {arms.map((a, i) => (
        <mesh key={i} position={a.p} quaternion={a.q} material={m.carbon}>
          <cylinderGeometry args={[0.014, 0.014, a.len, 6]} />
        </mesh>
      ))}
      {/* wheels: wide slicks with a sidewall stripe, dark rims */}
      {F1_WHEELS.map((w) => {
        const out = Math.sign(w.z);
        return (
          <group key={`${w.x}${w.z}`} position={[w.x, w.r, w.z]}>
            <mesh geometry={w.r > 0.34 ? m.tyreR : m.tyreF} material={m.rubber} castShadow receiveShadow />
            <mesh position-z={out * (w.w / 2 + 0.002)} rotation-y={out > 0 ? 0 : Math.PI} material={m.stripe}>
              <ringGeometry args={[w.r * 0.78, w.r * 0.82, 40]} />
            </mesh>
            <mesh position-z={out * (w.w / 2 + 0.004)} rotation-y={out > 0 ? 0 : Math.PI} material={m.rim}>
              <circleGeometry args={[w.r * 0.66, 32]} />
            </mesh>
            <mesh position-z={out * (w.w / 2 + 0.008)} rotation-x={Math.PI / 2} material={m.titanium}>
              <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
