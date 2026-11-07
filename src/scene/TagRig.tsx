"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Vec3 } from "@/sim/config";
import { VMAX } from "@/sim/config";
import { sampleVel } from "@/sim/field";
import { paletteJS } from "@/lib/palette";
import { useLab } from "@/lib/store";
import { SelectionRing, useDrag } from "./Obstacles";

/**
 * Paper tags hanging from a bar. Each tag is a spherical pendulum: gravity plus a
 * quadratic drag towards the local wind sampled from the solver, plus a little
 * speed-dependent flutter. They are tinted by the speed they feel.
 */
export function TagStrips({
  from,
  to,
  count,
  length,
}: {
  id: string;
  from: Vec3;
  to: Vec3;
  count: number;
  length: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, 1, 4);
    g.translate(0, -0.5, 0);
    return g;
  }, []);
  const state = useMemo(() => {
    const tips = Array.from({ length: count }, () => ({
      q: new THREE.Vector3(0, -length, 0),
      v: new THREE.Vector3(),
      phase: Math.random() * 100,
      speed: 0,
    }));
    return { tips, init: false };
  }, [count, length]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color("#f2efe6");
    for (let i = 0; i < count; i++) m.setColorAt(i, c);
  }, [count]);

  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      hinge: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      n: new THREE.Vector3(),
      x: new THREE.Vector3(),
      z: new THREE.Vector3(),
      y: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      inv: new THREE.Matrix4(),
      wind: [0, 0, 0] as Vec3,
      col: [0, 0, 0] as [number, number, number],
      color: new THREE.Color(),
      paper: new THREE.Color("#f2efe6"),
    }),
    [],
  );

  useFrame((st, delta) => {
    const m = mesh.current;
    if (!m || !m.parent) return;
    const dt = Math.min(delta, 1 / 30);
    const parent = m.parent;
    parent.updateWorldMatrix(true, false);
    tmp.inv.copy(parent.matrixWorld).invert();
    tmp.a.set(...from).applyMatrix4(parent.matrixWorld);
    tmp.b.set(...to).applyMatrix4(parent.matrixWorld);
    tmp.axis.subVectors(tmp.b, tmp.a).normalize();
    const width = Math.min(0.13, (tmp.a.distanceTo(tmp.b) / count) * 0.8);
    const t = st.clock.elapsedTime;
    const sub = 2;
    for (let i = 0; i < count; i++) {
      const tip = state.tips[i];
      tmp.hinge.lerpVectors(tmp.a, tmp.b, count === 1 ? 0.5 : i / (count - 1));
      for (let s = 0; s < sub; s++) {
        const h = dt / sub;
        // wind at the middle of the tag
        const sp = sampleVel(
          tmp.hinge.x + tip.q.x * 0.6,
          tmp.hinge.y + tip.q.y * 0.6,
          tmp.hinge.z + tip.q.z * 0.6,
          tmp.wind,
        );
        tip.speed = sp;
        // relative air velocity at the tip
        const rx = tmp.wind[0] - tip.v.x;
        const ry = tmp.wind[1] - tip.v.y;
        const rz = tmp.wind[2] - tip.v.z;
        const rel = Math.hypot(rx, ry, rz);
        const k = 0.32; // drag / mass: a stiff card tag, not tissue paper
        // flutter: sideways and along-axis wobble that grows with wind speed
        const fl = sp * sp * 0.08;
        const ph = tip.phase + t * (6 + sp * 2.2);
        tip.v.x += (k * rel * rx + fl * Math.sin(ph) * tmp.axis.x) * h;
        tip.v.y += (k * rel * ry - 9.81 + fl * 0.4 * Math.sin(ph * 1.7)) * h;
        tip.v.z += (k * rel * rz + fl * Math.sin(ph) * tmp.axis.z) * h;
        tip.v.multiplyScalar(1 - 2.6 * h);
        tip.q.addScaledVector(tip.v, h).setLength(length);
        // keep velocity tangent to the sphere
        tmp.n.copy(tip.q).normalize();
        tip.v.addScaledVector(tmp.n, -tip.v.dot(tmp.n));
      }
      // orient: local -Y → tag direction, local X → bar axis (orthogonalised)
      tmp.n.copy(tip.q).normalize();
      tmp.x.copy(tmp.axis).addScaledVector(tmp.n, -tmp.axis.dot(tmp.n)).normalize();
      tmp.z.crossVectors(tmp.x, tmp.n).normalize();
      tmp.y.copy(tmp.n).multiplyScalar(-length);
      tmp.m.makeBasis(tmp.x.multiplyScalar(width), tmp.y, tmp.z);
      tmp.m.setPosition(tmp.hinge);
      tmp.m.premultiply(tmp.inv);
      m.setMatrixAt(i, tmp.m);
      paletteJS(tip.speed / VMAX, tmp.col);
      tmp.color.setRGB(tmp.col[0], tmp.col[1], tmp.col[2]).lerp(tmp.paper, 0.35);
      m.setColorAt(i, tmp.color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[geo, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial side={THREE.DoubleSide} roughness={0.85} metalness={0} />
      </instancedMesh>
      {/* the bar */}
      <mesh
        position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]}
        quaternion={new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize(),
        )}
      >
        <cylinderGeometry args={[0.018, 0.018, Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) + 0.1, 10]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** A freestanding frame with tags, perpendicular to the default wind. */
export function TagRig() {
  const o = useLab((s) => s.objects.rig);
  const selected = useLab((s) => s.selected === "rig");
  const drag = useDrag("rig");
  if (!o.enabled) return null;
  const H = 2.3;
  const half = 0.95;
  return (
    <group position={[o.x, 0, o.z]} rotation-y={(o.yaw * Math.PI) / 180}>
      <group {...drag}>
        {[-half, half].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh position-y={H / 2}>
              <cylinderGeometry args={[0.025, 0.025, H, 10]} />
              <meshStandardMaterial color="#2a2e35" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position-y={0.02}>
              <boxGeometry args={[0.5, 0.04, 0.12]} />
              <meshStandardMaterial color="#2a2e35" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>
        ))}
        {/* invisible pick volume so the thin frame is easy to grab */}
        <mesh position-y={H / 2}>
          <boxGeometry args={[0.6, H, 2 * half + 0.2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <TagStrips id="rig" from={[0, H, -half + 0.12]} to={[0, H, half - 0.12]} count={9} length={0.8} />
      <SelectionRing radius={1.15} active={selected} />
    </group>
  );
}
