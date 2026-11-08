"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { EXHAUST_HEIGHT, EXHAUST_RADIUS, FAN_MAX_SPEED } from "@/sim/config";
import { field } from "@/sim/field";
import { useLab } from "@/lib/store";
import { SelectionRing, useDrag } from "./Obstacles";
import { simDt } from "@/lib/simClock";

/**
 * A boxed extractor fan on a low stand. Its intake faces -X locally (towards the car) and
 * it blows out along +X: placed behind a car it pulls the air off the tail, so together
 * with the stand fan the flow runs straight through, as in a wind tunnel (car "driving").
 */
export function Exhaust() {
  const o = useLab((s) => s.objects.exhaust);
  const selected = useLab((s) => s.selected === "exhaust");
  const drag = useDrag("exhaust");
  const rotor = useRef<THREE.Group>(null);
  const omega = useRef(0);
  const blade = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.05, 0.12);
    s.quadraticCurveTo(-0.2, 0.5, -0.12, 0.78);
    s.quadraticCurveTo(0.05, 0.84, 0.16, 0.74);
    s.quadraticCurveTo(0.14, 0.4, 0.05, 0.12);
    s.lineTo(-0.05, 0.12);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false, curveSegments: 10 });
    g.rotateY(-Math.PI / 2);
    return g;
  }, []);
  const tmp = useMemo(() => ({ c: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    const dt = simDt(delta, 1 / 20);
    const st = useLab.getState();
    const ex = st.objects.exhaust;
    const target = ex.enabled ? st.fan.suction : 0;
    omega.current += (target * 26 - omega.current) * Math.min(1, dt * 1.2);
    if (rotor.current) {
      rotor.current.rotation.x += omega.current * dt;
      rotor.current.updateWorldMatrix(true, false);
      tmp.c.setFromMatrixPosition(rotor.current.matrixWorld);
      tmp.d.set(1, 0, 0).transformDirection(rotor.current.parent!.matrixWorld);
      // the momentum disc sits just downstream of the rotor
      field.exhaust.c = [tmp.c.x + tmp.d.x * 0.1, tmp.c.y, tmp.c.z + tmp.d.z * 0.1];
      field.exhaust.d = [tmp.d.x, tmp.d.y, tmp.d.z];
    }
    field.exhaust.on = ex.enabled;
    field.exhaust.U = (omega.current / 26) * FAN_MAX_SPEED * 1.25;
  });

  if (!o.enabled) return null;
  const R = EXHAUST_RADIUS;
  const Hc = EXHAUST_HEIGHT;
  const box = 2 * R + 0.2;
  const frame = "#2b2f36";
  const slabs: [number, number, number, number, number, number][] = [
    [0, Hc + box / 2 - 0.05, 0, 0.5, 0.1, box],
    [0, Hc - box / 2 + 0.05, 0, 0.5, 0.1, box],
    [0, Hc, box / 2 - 0.05, 0.5, box, 0.1],
    [0, Hc, -box / 2 + 0.05, 0.5, box, 0.1],
  ];
  return (
    <group position={[o.x, 0, o.z]} rotation-y={(o.yaw * Math.PI) / 180}>
      <group {...drag}>
        {slabs.map(([x, y, z, sx, sy, sz], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[sx, sy, sz]} />
            <meshStandardMaterial color={frame} metalness={0.5} roughness={0.45} />
          </mesh>
        ))}
        <mesh position-y={Hc} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[R + 0.04, R + 0.04, 0.48, 48, 1, true]} />
          <meshStandardMaterial color="#3a3f47" metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        {/* intake grille facing the car */}
        <mesh position={[-0.25, Hc, 0]} rotation-y={Math.PI / 2}>
          <ringGeometry args={[0.15, R, 48, 6]} />
          <meshBasicMaterial color="#9aa3ad" wireframe transparent opacity={0.35} />
        </mesh>
        {[-0.7, 0.7].map((z) => (
          <mesh key={z} position={[0, (Hc - box / 2) / 2, z]}>
            <boxGeometry args={[0.08, Math.max(0.05, Hc - box / 2), 0.08]} />
            <meshStandardMaterial color={frame} metalness={0.5} roughness={0.45} />
          </mesh>
        ))}
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.7, 0.06, 1.7]} />
          <meshStandardMaterial color={frame} metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0.12, Hc, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.16, 0.16, 0.22, 28]} />
          <meshStandardMaterial color="#15171b" roughness={0.4} />
        </mesh>
        <group ref={rotor} position={[0, Hc, 0]}>
          {[0, 1, 2, 3, 4].map((i) => (
            <group key={i} rotation-x={(i * Math.PI * 2) / 5}>
              <mesh geometry={blade} rotation-y={-0.45}>
                <meshStandardMaterial color="#20242a" metalness={0.3} roughness={0.4} side={THREE.DoubleSide} />
              </mesh>
            </group>
          ))}
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.13, 0.13, 0.08, 24]} />
            <meshStandardMaterial color="#ff6a1a" roughness={0.4} />
          </mesh>
        </group>
      </group>
      <SelectionRing radius={1.2} active={selected} />
    </group>
  );
}
