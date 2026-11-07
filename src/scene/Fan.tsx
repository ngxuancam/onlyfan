"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FAN_MAX_SPEED, FAN_RADIUS } from "@/sim/config";
import { field } from "@/sim/field";
import { useLab } from "@/lib/store";
import { SelectionRing, useDrag } from "./Obstacles";

/**
 * A classic stand fan: round base, telescoping two-tone pole, motor head,
 * three translucent orange blades and a domed wire guard. Faces +X locally.
 */
const ORANGE = "#ff6a1a";
const GUARD_R = FAN_RADIUS + 0.03;
const BLADE_X = 0.2;
const AXIS_Y = 0.14;
const MAX_OMEGA = 30; // rad/s at 100 %

function bladeGeometry() {
  // x = tangential, y = radial (root → tip)
  const s = new THREE.Shape();
  s.moveTo(-0.03, 0.07);
  s.bezierCurveTo(-0.13, 0.2, -0.22, 0.38, -0.17, 0.56);
  s.bezierCurveTo(-0.13, 0.67, 0.07, 0.69, 0.15, 0.6);
  s.bezierCurveTo(0.21, 0.5, 0.12, 0.25, 0.03, 0.07);
  s.lineTo(-0.03, 0.07);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1, curveSegments: 14 });
  g.translate(0, 0, -0.004);
  // a little camber: bend the blade along its chord
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) + x * x * 0.6);
  }
  g.computeVertexNormals();
  // thickness axis Z → X (blowing axis), tangential x → Z
  g.rotateY(-Math.PI / 2);
  return g;
}

function guardGeometry() {
  const R = GUARD_R;
  const geos: THREE.BufferGeometry[] = [];
  const front = (r: number) => BLADE_X + 0.035 + 0.13 * (1 - (r / R) ** 2);
  const back = (r: number) => BLADE_X - 0.035 - 0.12 * (1 - (r / R) ** 2);
  const spokes = 44;
  for (let s = 0; s < spokes; s++) {
    const a = (s / spokes) * Math.PI * 2;
    for (const side of [front, back]) {
      const r0 = side === front ? 0.1 : 0.19;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const r = r0 + ((R - r0) * i) / 10;
        pts.push(new THREE.Vector3(side(r), Math.cos(a) * r, Math.sin(a) * r));
      }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0035, 4, false));
    }
  }
  const ring = (r: number, x: number, tube: number) => {
    const t = new THREE.TorusGeometry(r, tube, 6, 96);
    t.rotateY(Math.PI / 2);
    t.translate(x, 0, 0);
    geos.push(t);
  };
  for (const r of [0.22, 0.4, 0.57]) {
    ring(r, front(r), 0.004);
    ring(r, back(r), 0.004);
  }
  ring(R, BLADE_X, 0.014);
  ring(R, BLADE_X + 0.03, 0.006);
  ring(R, BLADE_X - 0.03, 0.006);
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute("uv"), g)))!;
}

function lathe(points: [number, number][], segments = 48, alongX = false) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  if (alongX) g.rotateZ(-Math.PI / 2);
  return g;
}

export function Fan() {
  const fan = useLab((s) => s.fan);
  const selected = useLab((s) => s.selected === "fan");
  const drag = useDrag("fan");
  const head = useRef<THREE.Group>(null);
  const blades = useRef<THREE.Group>(null);
  const blur = useRef<THREE.MeshBasicMaterial>(null);
  const sim = useRef({ phase: 0, amp: (fan.sweep * Math.PI) / 360, omega: 0, spin: 0 });

  const geo = useMemo(
    () => ({
      blade: bladeGeometry(),
      guard: guardGeometry(),
      base: lathe([[0, 0.1], [0.12, 0.098], [0.3, 0.08], [0.43, 0.05], [0.47, 0.02], [0.47, 0], [0, 0]], 64),
      bladeMat: new THREE.MeshPhysicalMaterial({
        color: ORANGE,
        roughness: 0.25,
        transparent: true,
        opacity: 0.95,
        clearcoat: 1,
        side: THREE.DoubleSide,
        emissive: ORANGE,
        emissiveIntensity: 0.15,
      }),
      motor: lathe([[0, 0.05], [0.1, 0.045], [0.155, 0.0], [0.17, -0.08], [0.165, -0.2], [0.12, -0.29], [0.05, -0.33], [0, -0.335]], 40, true),
    }),
    [],
  );

  const tmp = useMemo(() => ({ c: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const s = sim.current;
    const f = useLab.getState().fan;
    const powered = f.speed > 0.001;
    // motor inertia
    s.omega += (f.speed * MAX_OMEGA - s.omega) * Math.min(1, dt * 1.4);
    s.spin += s.omega * dt;
    // oscillation: real fans sweep at ~6–8 s per cycle, only while running
    // with oscillation off the head eases back to the set direction, so Direction = where it blows
    const targetAmp = f.oscillate ? (f.sweep * Math.PI) / 360 : 0;
    s.amp += (targetAmp - s.amp) * Math.min(1, dt * 2);
    if (f.oscillate && powered) s.phase += dt * ((Math.PI * 2) / 7.5);
    const osc = s.amp * Math.sin(s.phase);
    if (head.current) head.current.rotation.y = osc;
    field.fan.headYaw = f.yaw + (osc * 180) / Math.PI;
    if (blades.current) blades.current.rotation.x = s.spin;
    const k = s.omega / MAX_OMEGA;
    if (blur.current) blur.current.opacity = 0.32 * k;
    geo.bladeMat.opacity = 0.95 - 0.5 * k;

    // publish the blade disc for the solver: world centre and blowing direction
    if (blades.current) {
      blades.current.updateWorldMatrix(true, false);
      tmp.c.setFromMatrixPosition(blades.current.matrixWorld);
      tmp.d.set(1, 0, 0).transformDirection(blades.current.parent!.matrixWorld);
      field.fan.c = [tmp.c.x, tmp.c.y, tmp.c.z];
      field.fan.d = [tmp.d.x, tmp.d.y, tmp.d.z];
      field.fan.U = k * FAN_MAX_SPEED;
      field.fan.spin = s.spin;
    }
  });

  const yaw = (fan.yaw * Math.PI) / 180;
  const tilt = (fan.tilt * Math.PI) / 180;
  const H = fan.height;
  const lowerTop = Math.min(1.1, H - 0.3);

  return (
    <group position={[fan.x, 0, fan.z]} rotation-y={yaw}>
      <group {...drag}>
        {/* base */}
        <mesh geometry={geo.base}>
          <meshPhysicalMaterial color="#3b3d42" roughness={0.45} metalness={0.1} clearcoat={0.6} clearcoatRoughness={0.3} />
        </mesh>
        <mesh position-y={0.025} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.455, 0.028, 12, 72]} />
          <meshStandardMaterial color="#2a2c30" roughness={0.6} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 + 0.3;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.29, 0.087, Math.sin(a) * 0.29]} rotation={[-Math.PI / 2 + 0.12, 0, -a]} scale={[1, 0.55, 1]}>
              <circleGeometry args={[0.085, 24]} />
              <meshStandardMaterial color="#141518" roughness={0.9} />
            </mesh>
          );
        })}
        <mesh position-y={0.12}>
          <cylinderGeometry args={[0.07, 0.085, 0.06, 32]} />
          <meshStandardMaterial color={ORANGE} roughness={0.4} />
        </mesh>

        {/* telescoping pole */}
        <mesh position-y={(0.12 + lowerTop) / 2}>
          <cylinderGeometry args={[0.036, 0.036, lowerTop - 0.12, 20]} />
          <meshPhysicalMaterial color="#121315" roughness={0.3} clearcoat={1} />
        </mesh>
        <mesh position-y={lowerTop}>
          <cylinderGeometry args={[0.05, 0.05, 0.08, 24]} />
          <meshStandardMaterial color={ORANGE} roughness={0.4} />
        </mesh>
        <mesh position-y={(lowerTop + H) / 2}>
          <cylinderGeometry args={[0.024, 0.024, H - lowerTop, 16]} />
          <meshStandardMaterial color="#8d939b" metalness={0.9} roughness={0.25} />
        </mesh>
        {/* pick volume for the slim parts */}
        <mesh position-y={H / 2}>
          <cylinderGeometry args={[0.5, 0.5, H + 0.6, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* oscillating head */}
      <group ref={head} position-y={H}>
        <group rotation-z={tilt}>
          {/* tilt knuckle + neck */}
          <mesh rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.045, 0.045, 0.1, 20]} />
            <meshStandardMaterial color="#1a1b1e" roughness={0.5} />
          </mesh>
          <mesh position={[-0.08, AXIS_Y / 2, 0]}>
            <boxGeometry args={[0.09, AXIS_Y, 0.06]} />
            <meshStandardMaterial color="#1a1b1e" roughness={0.5} />
          </mesh>
          <group position-y={AXIS_Y}>
            <mesh geometry={geo.motor} position-x={0.06}>
              <meshPhysicalMaterial color="#141518" roughness={0.35} clearcoat={1} clearcoatRoughness={0.2} />
            </mesh>
            <mesh geometry={geo.guard}>
              <meshStandardMaterial color="#c9cdd2" metalness={0.85} roughness={0.3} />
            </mesh>
            {/* centre badge on the front guard */}
            <mesh position-x={BLADE_X + 0.17} rotation-z={-Math.PI / 2}>
              <cylinderGeometry args={[0.085, 0.085, 0.015, 40]} />
              <meshStandardMaterial color="#111214" roughness={0.4} />
            </mesh>
            <mesh position-x={BLADE_X + 0.179} rotation-y={Math.PI / 2}>
              <ringGeometry args={[0.06, 0.075, 40]} />
              <meshBasicMaterial color={ORANGE} toneMapped={false} />
            </mesh>
            {/* motion blur disc */}
            <mesh position-x={BLADE_X} rotation-y={Math.PI / 2}>
              <ringGeometry args={[0.1, FAN_RADIUS - 0.02, 64]} />
              <meshBasicMaterial ref={blur} color={ORANGE} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
            {/* spinning rotor, the solver reads this group's world transform */}
            <group ref={blades} position-x={BLADE_X}>
              <mesh rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[0.085, 0.095, 0.09, 32]} />
                <meshStandardMaterial color={ORANGE} roughness={0.35} />
              </mesh>
              <mesh position-x={0.05} rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[0.05, 0.07, 0.03, 32]} />
                <meshStandardMaterial color="#121315" roughness={0.3} />
              </mesh>
              {[0, 1, 2].map((i) => (
                <group key={i} rotation-x={(i * Math.PI * 2) / 3}>
                  <mesh geometry={geo.blade} material={geo.bladeMat} rotation-y={0.38} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
      <SelectionRing radius={0.75} active={selected} />
    </group>
  );
}
