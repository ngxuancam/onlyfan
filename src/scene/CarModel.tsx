"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { makeHeatMaterial } from "./heatMaterial";

/**
 * A procedural crossover, lofted from cross-sections so the body reads as smooth sheet
 * metal rather than an extruded silhouette. Same envelope as the solver's car
 * (`CAR_BODY` / `CAR_CABIN` in obstacles.ts): front at -X, 3.98 m long, 1.7 m wide.
 */

interface Station {
  x: number;
  /** half width at the bottom and at the top of the section */
  w0: number;
  w1: number;
  y0: number;
  y1: number;
}

/**
 * Lofts superellipse-ish sections into a closed, smooth-shaded tube with end caps.
 * The section narrows from w0 at the bottom to w1 at the top (tumblehome).
 */
function loft(stations: Station[], ring = 40, exp = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const e = 2 / exp;
  for (const s of stations) {
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const ty = Math.sign(sn) * Math.abs(sn) ** e; // -1..1
      const t = (ty + 1) / 2; // 0 bottom .. 1 top
      const w = s.w0 + (s.w1 - s.w0) * t;
      const z = Math.sign(c) * Math.abs(c) ** e * w;
      const y = s.y0 + (s.y1 - s.y0) * t;
      pos.push(s.x, y, z);
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
  // caps
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

/** Smoothly resample a coarse station table (Catmull-Rom on every field). */
function smoothStations(src: Station[], n: number): Station[] {
  const keys = ["x", "w0", "w1", "y0", "y1"] as const;
  const curves = keys.map((k) => new THREE.SplineCurve(src.map((s, i) => new THREE.Vector2(i, s[k]))));
  const out: Station[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const v = curves.map((c) => c.getPoint(t).y);
    out.push({ x: v[0], w0: v[1], w1: v[2], y0: v[3], y1: v[4] });
  }
  return out;
}

const BODY: Station[] = [
  { x: -1.99, w0: 0.6, w1: 0.55, y0: 0.42, y1: 0.68 },
  { x: -1.94, w0: 0.78, w1: 0.74, y0: 0.33, y1: 0.8 },
  { x: -1.75, w0: 0.84, w1: 0.8, y0: 0.31, y1: 0.86 },
  { x: -1.3, w0: 0.86, w1: 0.82, y0: 0.3, y1: 0.92 },
  { x: -0.9, w0: 0.86, w1: 0.83, y0: 0.3, y1: 0.99 },
  { x: 0.0, w0: 0.87, w1: 0.83, y0: 0.3, y1: 1.01 },
  { x: 1.1, w0: 0.87, w1: 0.83, y0: 0.3, y1: 1.02 },
  { x: 1.7, w0: 0.85, w1: 0.8, y0: 0.31, y1: 1.0 },
  { x: 1.93, w0: 0.8, w1: 0.74, y0: 0.34, y1: 0.9 },
  { x: 1.99, w0: 0.66, w1: 0.6, y0: 0.42, y1: 0.76 },
];

const CABIN: Station[] = [
  { x: -1.08, w0: 0.74, w1: 0.72, y0: 0.96, y1: 0.99 },
  { x: -0.75, w0: 0.73, w1: 0.62, y0: 0.96, y1: 1.3 },
  { x: -0.38, w0: 0.72, w1: 0.6, y0: 0.96, y1: 1.47 },
  { x: 0.3, w0: 0.71, w1: 0.6, y0: 0.96, y1: 1.53 },
  { x: 1.15, w0: 0.71, w1: 0.6, y0: 0.96, y1: 1.49 },
  { x: 1.55, w0: 0.7, w1: 0.58, y0: 0.96, y1: 1.38 },
  { x: 1.82, w0: 0.68, w1: 0.62, y0: 0.96, y1: 1.0 },
];

/** Roof panel: a thin body-coloured shell over the glasshouse. */
const ROOF: Station[] = [
  { x: -0.42, w0: 0.52, w1: 0.4, y0: 1.43, y1: 1.47 },
  { x: -0.2, w0: 0.58, w1: 0.5, y0: 1.47, y1: 1.52 },
  { x: 0.4, w0: 0.6, w1: 0.52, y0: 1.5, y1: 1.555 },
  { x: 1.1, w0: 0.6, w1: 0.52, y0: 1.47, y1: 1.52 },
  { x: 1.4, w0: 0.56, w1: 0.48, y0: 1.41, y1: 1.45 },
];

const WHEELS: [number, number][] = [
  [-1.25, -0.72],
  [-1.25, 0.72],
  [1.22, -0.72],
  [1.22, 0.72],
];

export function CarModel() {
  const parts = useMemo(() => {
    const paint = makeHeatMaterial("#e9ecf0", { roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, heat: 0.88 });
    const glass = makeHeatMaterial("#0c1016", { roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, heat: 0.45, envMapIntensity: 1.6 });
    const trim = makeHeatMaterial("#15171a", { roughness: 0.55, metalness: 0.1, heat: 0.4 });
    const rubber = new THREE.MeshStandardMaterial({ color: "#121314", roughness: 0.92 });
    const rim = new THREE.MeshPhysicalMaterial({ color: "#b9bfc6", metalness: 1, roughness: 0.22, clearcoat: 0.6 });
    const disc = new THREE.MeshStandardMaterial({ color: "#5d6168", metalness: 0.9, roughness: 0.45 });
    const head = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#e8f3ff", emissiveIntensity: 3, toneMapped: false });
    const tail = new THREE.MeshStandardMaterial({ color: "#ff2030", emissive: "#ff1525", emissiveIntensity: 2.4, toneMapped: false });

    const body = loft(smoothStations(BODY, 64), 48, 5);
    const cabin = loft(smoothStations(CABIN, 40), 40, 3.2);
    const roof = loft(smoothStations(ROOF, 24), 32, 4);
    // lower cladding: a dark sill band along the bottom of the body
    const sill = loft(
      smoothStations(
        BODY.map((s) => ({ ...s, w0: s.w0 + 0.008, w1: s.w0 + 0.006, y1: s.y0 + 0.13 })),
        64,
      ),
      48,
      5,
    );

    // tyre + five-spoke rim
    const tyre = new THREE.TorusGeometry(0.27, 0.095, 18, 48);
    const rimFace = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 40);
    rimFace.rotateX(Math.PI / 2);
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.BoxGeometry(0.05, 0.2, 0.03);
      b.translate(0, 0.11, 0);
      b.rotateZ((i / 5) * Math.PI * 2);
      spokes.push(b);
    }
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 20);
    hub.rotateX(Math.PI / 2);
    const brake = new THREE.CylinderGeometry(0.17, 0.17, 0.02, 32);
    brake.rotateX(Math.PI / 2);
    const arch = new THREE.TorusGeometry(0.4, 0.035, 8, 32, Math.PI);

    return { paint, glass, trim, rubber, rim, disc, head, tail, body, cabin, roof, sill, tyre, rimFace, spokes, hub, brake, arch };
  }, []);

  return (
    <group>
      <mesh geometry={parts.body} material={parts.paint} castShadow receiveShadow />
      <mesh geometry={parts.sill} material={parts.trim} castShadow />
      <mesh geometry={parts.cabin} material={parts.glass} castShadow />
      <mesh geometry={parts.roof} material={parts.paint} castShadow />
      {/* grille + lower intake */}
      <mesh position={[-1.975, 0.55, 0]} material={parts.trim}>
        <boxGeometry args={[0.04, 0.18, 1.0]} />
      </mesh>
      {/* light bars */}
      <mesh position={[-1.985, 0.8, 0]} material={parts.head}>
        <boxGeometry args={[0.02, 0.035, 1.3]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-1.93, 0.76, s * 0.62]} rotation-y={s * 0.35} material={parts.head}>
          <boxGeometry args={[0.03, 0.06, 0.26]} />
        </mesh>
      ))}
      <mesh position={[1.985, 0.88, 0]} material={parts.tail}>
        <boxGeometry args={[0.02, 0.05, 1.42]} />
      </mesh>
      {/* mirrors */}
      {[-1, 1].map((s) => (
        <group key={s} position={[-0.72, 1.06, s * 0.83]}>
          <mesh material={parts.paint} castShadow>
            <boxGeometry args={[0.16, 0.1, 0.16]} />
          </mesh>
          <mesh position={[0.05, -0.06, -s * 0.05]} material={parts.trim}>
            <boxGeometry args={[0.06, 0.04, 0.06]} />
          </mesh>
        </group>
      ))}
      {/* wheels */}
      {WHEELS.map(([x, z]) => {
        const out = Math.sign(z);
        return (
          <group key={`${x}${z}`} position={[x, 0.36, z]}>
            <mesh geometry={parts.tyre} material={parts.rubber} castShadow />
            <mesh geometry={parts.brake} material={parts.disc} position-z={-out * 0.02} />
            <group position-z={out * 0.055}>
              <mesh geometry={parts.rimFace} material={parts.rim} scale={[1, 1, 0.6]} position-z={-out * 0.03} />
              {parts.spokes.map((g, i) => (
                <mesh key={i} geometry={g} material={parts.rim} />
              ))}
              <mesh geometry={parts.hub} material={parts.rim} />
            </group>
            {/* wheel-arch cladding */}
            <mesh geometry={parts.arch} material={parts.trim} position-z={out * 0.08} />
          </group>
        );
      })}
    </group>
  );
}
