"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BOUND_RADIUS, SHAPES, type ObjKind, type Part, type Prim } from "@/sim/obstacles";
import { DOMAIN } from "@/sim/config";
import { useLab, type Selectable } from "@/lib/store";
import { makeHeatMaterial } from "./heatMaterial";
import { TagStrips } from "./TagRig";

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

const PART_STYLE: Record<Part, { color: string; gloss: number; opacity?: number }> = {
  body: { color: "#dfe3e8", gloss: 0.8 },
  glass: { color: "#1b2330", gloss: 1.2 },
  wheel: { color: "#16181c", gloss: 0.2 },
  wall: { color: "#cdd2d8", gloss: 0.15 },
  roof: { color: "#6f7886", gloss: 0.3, opacity: 0.999 },
  floor: { color: "#2b3038", gloss: 0.05 },
  trunk: { color: "#5a4535", gloss: 0.05 },
  foliage: { color: "#4b8a5c", gloss: 0.1, opacity: 0.82 },
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
      const mat = makeHeatMaterial(st.color, { gloss: st.gloss, opacity: st.opacity });
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
  useFrame((st) => {
    if (!ref.current) return;
    ref.current.visible = active;
    ref.current.rotation.z = st.clock.elapsedTime * 0.4;
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
      material.uniforms.uOpacity.value = op;
      material.transparent = op < 1 || part === "roof";
      material.depthWrite = op >= 1;
      material.needsUpdate = true;
    }
  }, [parts, xray]);

  if (!o.enabled) return null;
  return (
    <group position={[o.x, 0, o.z]} rotation-y={(o.yaw * Math.PI) / 180}>
      <group {...drag}>
        {parts.map(({ part, geometry, material }) => (
          <mesh key={part} geometry={geometry} material={material} renderOrder={part === "roof" ? 2 : part === "foliage" ? 3 : 0} />
        ))}
      </group>
      {kind === "car" && <CarDetails />}
      {kind === "house" && <TagStrips id="house-rig" from={[-0.95, 2.25, -1.45]} to={[-0.95, 2.25, 1.45]} count={7} length={0.55} />}
      <SelectionRing radius={BOUND_RADIUS[kind] * 0.95} active={selected} />
    </group>
  );
}

function CarDetails() {
  // light bars front and rear: purely cosmetic
  return (
    <group>
      <mesh position={[-1.985, 0.79, 0]}>
        <boxGeometry args={[0.02, 0.04, 1.4]} />
        <meshBasicMaterial color="#e9f4ff" toneMapped={false} />
      </mesh>
      <mesh position={[1.985, 0.86, 0]}>
        <boxGeometry args={[0.02, 0.05, 1.5]} />
        <meshBasicMaterial color="#ff2d3a" toneMapped={false} />
      </mesh>
    </group>
  );
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
