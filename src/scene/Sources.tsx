"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { DOMAIN, type Vec3 } from "@/sim/config";
import { field, sampleVel } from "@/sim/field";
import { SHAPES } from "@/sim/obstacles";
import { solidExact } from "@/sim/collide";
import { useLab } from "@/lib/store";
import { SelectionRing, useDrag } from "./Obstacles";

/* ================================================== industrial blower */

export const BLOWER_RADIUS = 0.95;
const BLOWER_AXIS = 1.2;
const BLOWER_MAX = 11;

/**
 * A motor-driven drum blower on a wheeled cart: a much wider, stronger jet than the
 * stand fan. Tilts in its yoke; faces +X locally.
 */
export function Blower() {
  const o = useLab((s) => s.objects.blower);
  const tilt = useLab((s) => s.params.blowerTilt);
  const selected = useLab((s) => s.selected === "blower");
  const drag = useDrag("blower");
  const rotor = useRef<THREE.Group>(null);
  const omega = useRef(0);
  const tmp = useMemo(() => ({ c: new THREE.Vector3(), d: new THREE.Vector3() }), []);
  const blade = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.08, 0.16);
    s.bezierCurveTo(-0.3, 0.45, -0.32, 0.75, -0.14, 0.9);
    s.bezierCurveTo(0.05, 0.95, 0.22, 0.88, 0.24, 0.78);
    s.bezierCurveTo(0.2, 0.5, 0.12, 0.3, 0.08, 0.16);
    s.lineTo(-0.08, 0.16);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 12 });
    g.rotateY(-Math.PI / 2);
    return g;
  }, []);
  const grille = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (const r of [0.25, 0.45, 0.65, 0.85]) {
      const t = new THREE.TorusGeometry(r, 0.008, 5, 72);
      t.rotateY(Math.PI / 2);
      geos.push(t);
    }
    for (let i = 0; i < 16; i++) {
      const b = new THREE.BoxGeometry(0.012, 0.85, 0.012);
      b.translate(0, 0.52, 0);
      b.rotateX((i / 16) * Math.PI * 2);
      geos.push(b);
    }
    return geos;
  }, []);

  useFrame((_, delta) => {
    const st = useLab.getState();
    const target = st.objects.blower.enabled ? st.params.blowerPower : 0;
    omega.current += (target * 22 - omega.current) * Math.min(1, delta * 1.0);
    // a ducted drum fan: drives a long, uniform plug of air, much harder than the stand fan
    const disc = (field.discs.blower ??= { c: [0, 1, 0], d: [1, 0, 0], R: BLOWER_RADIUS, U: 0, on: false, depth: 1.5, gain: 2.5, ducted: true });
    disc.on = st.objects.blower.enabled;
    disc.U = (omega.current / 22) * BLOWER_MAX;
    if (rotor.current) {
      rotor.current.rotation.x += omega.current * delta;
      rotor.current.updateWorldMatrix(true, false);
      tmp.c.setFromMatrixPosition(rotor.current.matrixWorld);
      tmp.d.set(1, 0, 0).transformDirection(rotor.current.parent!.matrixWorld);
      disc.c = [tmp.c.x + tmp.d.x * 0.25, tmp.c.y + tmp.d.y * 0.25, tmp.c.z + tmp.d.z * 0.25];
      disc.d = [tmp.d.x, tmp.d.y, tmp.d.z];
    }
  });

  if (!o.enabled) return null;
  const metal = { color: "#2b2f36", metalness: 0.6, roughness: 0.4 };
  return (
    <group position={[o.x, 0, o.z]} rotation-y={(o.yaw * Math.PI) / 180}>
      <group {...drag}>
        {/* cart */}
        <mesh position-y={0.22}>
          <boxGeometry args={[1.0, 0.08, 1.5]} />
          <meshStandardMaterial {...metal} />
        </mesh>
        {[
          [-0.4, -0.65],
          [0.4, -0.65],
          [-0.4, 0.65],
          [0.4, 0.65],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.1, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.1, 0.1, 0.07, 18]} />
            <meshStandardMaterial color="#111" roughness={0.7} />
          </mesh>
        ))}
        {/* yoke */}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[0, (0.26 + BLOWER_AXIS) / 2, sd * 1.12]}>
            <boxGeometry args={[0.12, BLOWER_AXIS - 0.26, 0.07]} />
            <meshStandardMaterial color="#ffb020" metalness={0.3} roughness={0.45} />
          </mesh>
        ))}
        <group position-y={BLOWER_AXIS} rotation-z={(tilt * Math.PI) / 180}>
          {/* drum shroud */}
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[BLOWER_RADIUS + 0.06, BLOWER_RADIUS + 0.06, 0.5, 56, 1, true]} />
            <meshStandardMaterial color="#d6dbe0" metalness={0.75} roughness={0.3} side={THREE.DoubleSide} />
          </mesh>
          {[-0.25, 0.25].map((x) => (
            <mesh key={x} position-x={x} rotation-y={Math.PI / 2}>
              <torusGeometry args={[BLOWER_RADIUS + 0.06, 0.025, 8, 64]} />
              <meshStandardMaterial {...metal} />
            </mesh>
          ))}
          {/* pivot hubs */}
          {[-1, 1].map((sd) => (
            <mesh key={sd} position-z={sd * 1.06} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.07, 0.07, 0.1, 16]} />
              <meshStandardMaterial {...metal} />
            </mesh>
          ))}
          {/* grilles front and back */}
          {[-0.26, 0.26].map((x) =>
            grille.map((g, i) => (
              <mesh key={`${x}-${i}`} geometry={g} position-x={x}>
                <meshStandardMaterial color="#1b1e23" metalness={0.6} roughness={0.4} />
              </mesh>
            )),
          )}
          {/* motor */}
          <mesh position-x={-0.42} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.22, 0.22, 0.38, 28]} />
            <meshStandardMaterial color="#1c3f7a" metalness={0.4} roughness={0.4} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position-x={-0.42} rotation-x={(i * Math.PI) / 3}>
              <boxGeometry args={[0.34, 0.47, 0.015]} />
              <meshStandardMaterial color="#173566" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
          <group ref={rotor}>
            {[0, 1, 2].map((i) => (
              <group key={i} rotation-x={(i * Math.PI * 2) / 3}>
                <mesh geometry={blade} rotation-y={-0.42}>
                  <meshStandardMaterial color="#ff6a1a" metalness={0.2} roughness={0.35} side={THREE.DoubleSide} />
                </mesh>
              </group>
            ))}
            <mesh rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.16, 0.16, 0.14, 24]} />
              <meshStandardMaterial color="#111317" metalness={0.5} roughness={0.35} />
            </mesh>
          </group>
        </group>
        <mesh position-y={1.1}>
          <boxGeometry args={[1.1, 2.3, 2.4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <SelectionRing radius={1.45} active={selected} />
    </group>
  );
}

/* ====================================================== smoke machine */

/**
 * A fog machine on a stand: a dense smoke nozzle you can place anywhere (the smoke
 * itself is drawn by <Smoke/>). A gentle exit jet carries the smoke off the nozzle.
 */
export function SmokeMachine() {
  const o = useLab((s) => s.objects.smoker);
  const height = useLab((s) => s.params.smokeHeight);
  const selected = useLab((s) => s.selected === "smoker");
  const drag = useDrag("smoker");
  const nozzle = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshBasicMaterial>(null);
  const tmp = useMemo(() => ({ c: new THREE.Vector3(), d: new THREE.Vector3() }), []);

  useFrame((st) => {
    const s = useLab.getState();
    const on = s.objects.smoker.enabled;
    field.smoker.on = on;
    field.smoker.rate = on ? s.params.smokeOutput : 0;
    const disc = (field.discs.smoker ??= { c: [0, 1, 0], d: [1, 0, 0], R: 0.4, U: 0, on: false });
    disc.on = on;
    disc.U = s.params.smokeJet * 4;
    if (nozzle.current) {
      nozzle.current.updateWorldMatrix(true, false);
      tmp.c.setFromMatrixPosition(nozzle.current.matrixWorld);
      tmp.d.set(1, 0, 0).transformDirection(nozzle.current.matrixWorld);
      field.smoker.c = [tmp.c.x, tmp.c.y, tmp.c.z];
      field.smoker.d = [tmp.d.x, tmp.d.y, tmp.d.z];
      disc.c = [tmp.c.x + tmp.d.x * 0.3, tmp.c.y, tmp.c.z + tmp.d.z * 0.3];
      disc.d = field.smoker.d;
    }
    if (led.current) led.current.color.set(Math.floor(st.clock.elapsedTime * 3) % 2 ? "#3ee08f" : "#0b3d24");
  });

  if (!o.enabled) return null;
  const top = height - 0.15;
  return (
    <group position={[o.x, 0, o.z]} rotation-y={(o.yaw * Math.PI) / 180}>
      <group {...drag}>
        {/* stand */}
        <mesh position-y={top / 2}>
          <cylinderGeometry args={[0.025, 0.03, top, 10]} />
          <meshStandardMaterial color="#2b2f36" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position-y={0.02}>
          <cylinderGeometry args={[0.28, 0.3, 0.04, 24]} />
          <meshStandardMaterial color="#1c1f24" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* machine body */}
        <mesh position={[-0.1, top + 0.13, 0]}>
          <boxGeometry args={[0.55, 0.26, 0.34]} />
          <meshStandardMaterial color="#1a1d22" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[-0.1, top + 0.265, 0]}>
          <boxGeometry args={[0.4, 0.02, 0.24]} />
          <meshStandardMaterial color="#ff6a1a" roughness={0.4} />
        </mesh>
        {/* fluid tank */}
        <mesh position={[-0.42, top + 0.12, 0]}>
          <boxGeometry args={[0.12, 0.22, 0.26]} />
          <meshPhysicalMaterial color="#9fd8ff" transparent opacity={0.55} roughness={0.1} />
        </mesh>
        <mesh position={[0.08, top + 0.2, 0.172]}>
          <planeGeometry args={[0.05, 0.03]} />
          <meshBasicMaterial ref={led} color="#3ee08f" toneMapped={false} />
        </mesh>
        <group ref={nozzle} position={[0.2, top + 0.13, 0]}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.035, 0.05, 0.1, 16]} />
            <meshStandardMaterial color="#b8bec5" metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
        <mesh position-y={(top + 0.3) / 2}>
          <boxGeometry args={[0.7, top + 0.4, 0.6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <SelectionRing radius={0.55} active={selected} />
    </group>
  );
}

/* ===================================================== falling leaves */

const LEAVES = 260;

/**
 * Leaves shed from the tree canopy. Each one falls under gravity with drag towards the
 * local wind from the solver, flutters, lands, and can be picked up again by a strong gust.
 */
export function Leaves() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.06);
    s.quadraticCurveTo(0.045, 0, 0, 0.065);
    s.quadraticCurveTo(-0.045, 0, 0, -0.06);
    const g = new THREE.ShapeGeometry(s, 6);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const st = useMemo(() => {
    const colors = ["#5b9a3c", "#7cb342", "#c0ca33", "#f9a825", "#ef6c00", "#8d6e63"];
    return {
      pos: new Float32Array(LEAVES * 3),
      vel: new Float32Array(LEAVES * 3),
      rot: new Float32Array(LEAVES * 3),
      spin: new Float32Array(LEAVES * 3),
      // 0 = in pool, 1 = falling, 2 = on the ground
      mode: new Uint8Array(LEAVES),
      age: new Float32Array(LEAVES),
      phase: Float32Array.from({ length: LEAVES }, () => Math.random() * 100),
      color: Array.from({ length: LEAVES }, (_, i) => new THREE.Color(colors[i % colors.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1)),
      carry: 0,
      colored: false,
    };
  }, []);
  const tmp = useMemo(
    () => ({ v: [0, 0, 0] as Vec3, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), hide: new THREE.Matrix4().makeScale(0, 0, 0) }),
    [],
  );
  const canopy = useMemo(() => SHAPES.tree.filter((p) => p.t === "ell"), []);

  useFrame((clock, delta) => {
    const m = mesh.current;
    if (!m) return;
    if (!st.colored) {
      st.color.forEach((c, i) => m.setColorAt(i, c));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      st.colored = true;
    }
    const dt = Math.min(delta, 1 / 30);
    const s = useLab.getState();
    const tree = s.objects.tree;
    const t = clock.clock.elapsedTime;

    // shed new leaves from random points inside the canopy
    if (tree.enabled && s.params.leaves && !s.paused) {
      st.carry += s.params.leafRate * dt;
      const c = Math.cos((tree.yaw * Math.PI) / 180);
      const sn = Math.sin((tree.yaw * Math.PI) / 180);
      while (st.carry >= 1) {
        st.carry -= 1;
        const i = st.mode.indexOf(0);
        if (i < 0) break;
        const e = canopy[(Math.random() * canopy.length) | 0];
        if (e.t !== "ell") break;
        // random point in the ellipsoid shell
        let x = 0;
        let y = 0;
        let z = 0;
        do {
          x = Math.random() * 2 - 1;
          y = Math.random() * 2 - 1;
          z = Math.random() * 2 - 1;
        } while (x * x + y * y + z * z > 1);
        const lx = e.c[0] + x * e.r[0] * 0.95;
        const lz = e.c[2] + z * e.r[2] * 0.95;
        st.pos[i * 3] = tree.x + c * lx + sn * lz;
        st.pos[i * 3 + 1] = e.c[1] + y * e.r[1] * 0.9;
        st.pos[i * 3 + 2] = tree.z - sn * lx + c * lz;
        st.vel.fill(0, i * 3, i * 3 + 3);
        for (let k = 0; k < 3; k++) {
          st.rot[i * 3 + k] = Math.random() * Math.PI * 2;
          st.spin[i * 3 + k] = (Math.random() - 0.5) * 6;
        }
        st.mode[i] = 1;
        st.age[i] = 0;
      }
    }

    for (let i = 0; i < LEAVES; i++) {
      const mode = st.mode[i];
      if (mode === 0) {
        m.setMatrixAt(i, tmp.hide);
        continue;
      }
      const o = i * 3;
      let x = st.pos[o];
      let y = st.pos[o + 1];
      let z = st.pos[o + 2];
      st.age[i] += dt;
      const sp = sampleVel(x, Math.max(0.1, y), z, tmp.v);
      if (mode === 1) {
        // drag towards the wind (a leaf is light: strong coupling), reduced gravity
        // = terminal fall speed ~1 m/s, plus a side-to-side flutter
        const k = 2.4;
        const ph = st.phase[i] + t * 3.1;
        st.vel[o] += ((tmp.v[0] - st.vel[o]) * k + Math.sin(ph) * 0.9) * dt;
        st.vel[o + 1] += ((tmp.v[1] - st.vel[o + 1]) * k - 2.6) * dt;
        st.vel[o + 2] += ((tmp.v[2] - st.vel[o + 2]) * k + Math.cos(ph * 0.8) * 0.9) * dt;
        const px = x;
        const py = y;
        const pz = z;
        x += st.vel[o] * dt;
        y += st.vel[o + 1] * dt;
        z += st.vel[o + 2] * dt;
        if (y > 0.012 && solidExact(x, y, z, 0.02)) {
          // landed on a roof or the car: stay on top of it
          x = px;
          y = py;
          z = pz;
          st.vel.fill(0, o, o + 3);
          st.mode[i] = 2;
          st.age[i] = 0;
        }
        const spinK = 1 + sp * 0.6;
        for (let a = 0; a < 3; a++) st.rot[o + a] += st.spin[o + a] * spinK * dt;
        if (y <= 0.012) {
          y = 0.012;
          st.mode[i] = 2;
          st.age[i] = 0;
          st.rot[o] = 0;
          st.rot[o + 2] = 0;
        }
      } else {
        // on the floor: a strong enough gust picks the leaf up again
        if (sp > 2.6 && Math.random() < dt * 2) {
          st.mode[i] = 1;
          st.vel[o + 1] = 0.8;
        } else if (sp > 0.8) {
          x += tmp.v[0] * dt * 0.25;
          z += tmp.v[2] * dt * 0.25;
          st.rot[o + 1] += sp * dt;
        }
        if (st.age[i] > 14) st.mode[i] = 0;
      }
      if (x < DOMAIN.min[0] || x > DOMAIN.max[0] || z < DOMAIN.min[2] || z > DOMAIN.max[2] || y > DOMAIN.max[1]) st.mode[i] = 0;
      st.pos[o] = x;
      st.pos[o + 1] = y;
      st.pos[o + 2] = z;
      tmp.e.set(st.rot[o], st.rot[o + 1], st.rot[o + 2]);
      tmp.q.setFromEuler(tmp.e);
      tmp.p.set(x, y, z);
      tmp.s.setScalar(1.7);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      m.setMatrixAt(i, tmp.m);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geo, undefined, LEAVES]} frustumCulled={false}>
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.7} />
    </instancedMesh>
  );
}
