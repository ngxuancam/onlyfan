"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOUND_RADIUS, SHAPES, type ObjKind, type Part, type Prim } from "@/sim/obstacles";
import { DOMAIN } from "@/sim/config";
import { useLab, type Selectable } from "@/lib/store";
import { makeHeatMaterial, type PbrOpts } from "./heatMaterial";
import { CarModel } from "./CarModel";
import { TagStrips } from "./TagRig";
import { simClock } from "@/lib/simClock";

/* ------------------------------------------------------------ geometry */

function noise3(x: number, y: number, z: number) {
  return (
    Math.sin(x * 3.1 + y * 1.7) * 0.5 +
    Math.sin(y * 4.3 - z * 2.9) * 0.3 +
    Math.sin(z * 5.7 + x * 2.3) * 0.2
  );
}

function primGeometry(p: Prim): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (p.t) {
    case "box":
      g = new THREE.BoxGeometry(...p.s);
      if (p.rz) g.rotateZ(p.rz);
      g.translate(...p.c);
      break;
    case "prism": {
      const shape = new THREE.Shape(p.poly.map(([x, y]) => new THREE.Vector2(x, y)));
      const bevel = p.part === "body" || p.part === "glass";
      const b = 0.06;
      g = new THREE.ExtrudeGeometry(shape, {
        depth: p.z1 - p.z0 - (bevel ? 2 * b : 0),
        bevelEnabled: bevel,
        bevelThickness: b,
        bevelSize: b,
        bevelSegments: 3,
        curveSegments: 4,
      });
      g.translate(0, 0, p.z0 + (bevel ? b : 0));
      break;
    }
    case "cylZ":
      g = new THREE.CylinderGeometry(p.r, p.r, p.len, 28);
      g.rotateX(Math.PI / 2);
      g.translate(...p.c);
      break;
    case "cylY":
      g = new THREE.CylinderGeometry(p.r * 0.75, p.r, p.h, 14);
      g.translate(p.c[0], p.c[1] + p.h / 2, p.c[2]);
      break;
    case "ell": {
      g = new THREE.IcosahedronGeometry(1, 3);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const k = 0.9 + 0.12 * noise3(v.x * 1.3 + p.c[0], v.y * 1.3 + p.c[1], v.z * 1.3 + p.c[2]);
        pos.setXYZ(i, p.c[0] + v.x * p.r[0] * k, p.c[1] + v.y * p.r[1] * k, p.c[2] + v.z * p.r[2] * k);
      }
      g.computeVertexNormals();
      break;
    }
  }
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute("uv");
  if (p.t === "ell") ng.computeVertexNormals();
  return ng;
}

/** PBR look per part; `heat` = how strongly the wind-load map tints it. */
const PART_STYLE: Record<Part, { color: string } & PbrOpts> = {
  body: { color: "#e9ecf0", roughness: 0.32, metalness: 0.35, clearcoat: 1 },
  glass: { color: "#0c1016", roughness: 0.05, clearcoat: 1, heat: 0.45 },
  wheel: { color: "#121314", roughness: 0.9, heat: 0.3 },
  wall: { color: "#e4e1db", roughness: 0.88, heat: 0.8 },
  roof: { color: "#3f444c", roughness: 0.62, metalness: 0.1, opacity: 0.999, heat: 0.8 },
  floor: { color: "#8a7560", roughness: 0.55, heat: 0.2 },
  trunk: { color: "#4a3a2e", roughness: 0.95, heat: 0.35 },
  foliage: { color: "#203b24", roughness: 0.9, heat: 0.25 },
};

function useParts(kind: ObjKind) {
  return useMemo(() => {
    const byPart = new Map<Part, THREE.BufferGeometry[]>();
    for (const p of SHAPES[kind]) {
      const list = byPart.get(p.part) ?? [];
      list.push(primGeometry(p));
      byPart.set(p.part, list);
    }
    return [...byPart.entries()].map(([part, geos]) => {
      const st = PART_STYLE[part];
      const mat = makeHeatMaterial(st.color, st);
      return { part, geometry: mergeGeometries(geos)!, material: mat };
    });
  }, [kind]);
}

/* ------------------------------------------------------------ dragging */

const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

/** Pointer handlers that move a store object over the ground plane. */
export function useDrag(key: Selectable) {
  const offset = useRef<[number, number] | null>(null);
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const s = useLab.getState();
      s.select(key);
      if (!e.ray.intersectPlane(ground, hit)) return;
      const cur = key === "fan" ? s.fan : s.objects[key];
      offset.current = [cur.x - hit.x, cur.z - hit.z];
      s.setDragging(true);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (!offset.current) return;
      e.stopPropagation();
      if (!e.ray.intersectPlane(ground, hit)) return;
      const x = clamp(hit.x + offset.current[0], DOMAIN.min[0] + 1, DOMAIN.max[0] - 1);
      const z = clamp(hit.z + offset.current[1], DOMAIN.min[2] + 1, DOMAIN.max[2] - 1);
      const s = useLab.getState();
      if (key === "fan") s.setFan({ x, z });
      else s.setObj(key, { x, z });
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!offset.current) return;
      offset.current = null;
      useLab.getState().setDragging(false);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    },
    onPointerOver: () => (document.body.style.cursor = "grab"),
    onPointerOut: () => (document.body.style.cursor = ""),
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ------------------------------------------------------------- objects */

export function SelectionRing({ radius, active }: { radius: number; active: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = active;
    ref.current.rotation.z = simClock.t * 0.4;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.015}>
      <ringGeometry args={[radius, radius + 0.05, 96, 1, 0, Math.PI * 1.7]} />
      <meshBasicMaterial color="#ff7a1a" transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

function Obstacle({ kind }: { kind: ObjKind }) {
  const o = useLab((s) => s.objects[kind]);
  const selected = useLab((s) => s.selected === kind);
  const xray = useLab((s) => s.layers.xray);
  const parts = useParts(kind);
  const drag = useDrag(kind);

  // x-ray: walls and roof go translucent so the flow inside the house is visible
  useMemo(() => {
    for (const { part, material } of parts) {
      if (part !== "wall" && part !== "roof") continue;
      const op = xray ? (part === "roof" ? 0.12 : 0.32) : 1;
      material.opacity = op;
      material.transparent = op < 1 || part === "roof";
      material.depthWrite = op >= 1;
      material.needsUpdate = true;
    }
  }, [parts, xray]);

  if (!o.enabled) return null;
  return (
    <group position={[o.x, 0, o.z]} rotation-y={(o.yaw * Math.PI) / 180}>
      <group {...drag}>
        {kind === "car" ? (
          <CarModel />
        ) : (
          parts.map(({ part, geometry, material }) =>
            part === "foliage" ? (
              // dense dark core; the leaf cards on its surface carry the look
              <mesh key={part} geometry={geometry} material={material} scale={0.9} castShadow receiveShadow />
            ) : (
              <mesh key={part} geometry={geometry} material={material} renderOrder={part === "roof" ? 2 : 0} castShadow receiveShadow />
            ),
          )
        )}
        {(kind === "tree" || kind === "shrub") && <Foliage kind={kind} />}
      </group>
      {kind === "house" && <TagStrips id="house-rig" from={[-0.95, 2.25, -1.45]} to={[-0.95, 2.25, 1.45]} count={7} length={0.55} />}
      <SelectionRing radius={BOUND_RADIUS[kind] * 0.95} active={selected} />
    </group>
  );
}

/**
 * Leaf cards scattered over the canopy ellipsoids: thousands of small instanced leaves
 * instead of a smooth blob, tinted in a few greens and gently swaying with the wind.
 */
function Foliage({ kind }: { kind: "tree" | "shrub" }) {
  const { geo, mat, mats, n } = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.quadraticCurveTo(0.42, -0.05, 0, 0.5);
    s.quadraticCurveTo(-0.42, -0.05, 0, -0.5);
    const geo = new THREE.ShapeGeometry(s, 4);
    const mat = makeHeatMaterial("#ffffff", { roughness: 0.75, heat: 0.12 });
    const ells = SHAPES[kind].filter((p) => p.t === "ell");
    const per = kind === "tree" ? 1100 : 520;
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const greens = ["#2f5d2a", "#3d7334", "#4f8a3c", "#6a9a45", "#2a4d2b", "#7aa04e"];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const p of ells) {
      if (p.t !== "ell") continue;
      const count = Math.round(per * ((p.r[0] * p.r[2]) / 2.4));
      for (let i = 0; i < count; i++) {
        // random direction, pushed to 82-102 % of the shell so the canopy has depth
        v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
        const r = 0.82 + Math.random() * 0.2;
        v.set(p.c[0] + v.x * p.r[0] * r, p.c[1] + v.y * p.r[1] * r, p.c[2] + v.z * p.r[2] * r);
        e.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI);
        q.setFromEuler(e);
        const size = (kind === "tree" ? 0.17 : 0.12) * (0.75 + Math.random() * 0.5);
        sc.set(size * 0.7, size, size);
        m.compose(v, q, sc);
        mats.push(m.clone());
        cols.push(new THREE.Color(greens[(Math.random() * greens.length) | 0]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06));
      }
    }
    return { geo, mat, mats: { mats, cols }, n: mats.length };
  }, [kind]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = ref.current;
    if (!im) return;
    mats.mats.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, mats.cols[i]);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [mats]);
  return <instancedMesh ref={ref} args={[geo, mat, n]} castShadow receiveShadow />;
}

export function Obstacles() {
  return (
    <>
      <Obstacle kind="car" />
      <Obstacle kind="house" />
      <Obstacle kind="tree" />
      <Obstacle kind="shrub" />
    </>
  );
}
