"use client";
import { useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerformanceMonitor,
  PerspectiveCamera,
} from "@react-three/drei";
import type { Quality } from "@/sim/config";
import type { LineSpec } from "@/sim/protocol";
import { useLab } from "@/lib/store";
import { SimDriver } from "./SimDriver";
import { Fan } from "./Fan";
import { Obstacles } from "./Obstacles";
import { TagRig } from "./TagRig";
import { Exhaust } from "./Exhaust";
import { LabHall } from "./LabHall";
import { DomainBox, Ground, HALL_BG, STUDIO_BG, Smoke, Streamlines } from "./Flow";
import { Blower, Leaves, SmokeMachine } from "./Sources";
import { StudioStage } from "./StudioStage";
import { Effects } from "./Effects";
import { ShadowCasters } from "./ShadowCasters";

export default function Scene({ quality }: { quality: Quality }) {
  const [line, setLine] = useState<LineSpec | null>(null);
  const onReady = useCallback((l: LineSpec) => setLine(l), []);
  const dragging = useLab((s) => s.dragging);
  const theme = useLab((s) => s.theme);
  const camMode = useLab((s) => s.camera);
  const maxDpr = quality === "high" ? 1.75 : 1.25;
  const [dpr, setDpr] = useState(maxDpr);

  return (
    <Canvas
      className="scene"
      dpr={dpr}
      shadows="soft"
      // with the composer the tone curve is applied as a post effect (AgX), so the renderer stays linear
      flat={quality === "high"}
      gl={{ antialias: quality !== "high", powerPreference: "high-performance" }}
      onPointerMissed={() => useLab.getState().select(null)}
    >
      {camMode === "perspective" ? (
        <PerspectiveCamera makeDefault position={[-7, 9.5, 19.5]} fov={40} near={0.1} far={220} />
      ) : (
        <OrthographicCamera makeDefault position={[-14, 14, 18]} zoom={42} near={-100} far={300} />
      )}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} />
      <color attach="background" args={[theme === "studio" ? STUDIO_BG : HALL_BG]} />
      <ambientLight intensity={0.18} />
      {/* key light: the only shadow caster, sized to the test zone */}
      <directionalLight
        position={[-7, 13, 8]}
        intensity={3.4}
        castShadow
        shadow-mapSize={[quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={50}
        shadow-radius={6}
      />
      <directionalLight position={[10, 5, -7]} intensity={0.55} color="#9db8ff" />
      {/* studio lighting for reflections: long softboxes overhead, strip lights at the sides */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.2} position={[0, 8, -2.6]} rotation-x={Math.PI / 2} scale={[16, 2.2, 1]} />
        <Lightformer form="rect" intensity={3.2} position={[0, 8, 2.6]} rotation-x={Math.PI / 2} scale={[16, 2.2, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[-12, 2.5, 0]} rotation-y={Math.PI / 2} scale={[14, 0.6, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[14, 2.5, 0]} rotation-y={-Math.PI / 2} scale={[14, 0.6, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#ffb27a" position={[0, 2, 14]} scale={[10, 1.2, 1]} />
      </Environment>
      {/* the custom ground shader cannot take shadow maps; a shadow catcher just above it does */}
      <mesh rotation-x={-Math.PI / 2} position={[5, 0.003, 0]} receiveShadow renderOrder={1}>
        <planeGeometry args={[40, 26]} />
        <shadowMaterial transparent opacity={theme === "studio" ? 0.55 : 0.45} depthWrite={false} />
      </mesh>
      <ShadowCasters />

      <SimDriver quality={quality} onReady={onReady} />
      {theme === "hall" && <LabHall />}
      {theme === "studio" && <StudioStage />}
      <hemisphereLight args={["#c9d6e6", "#1a1c20", theme === "studio" ? 0.35 : 0.25]} />
      <Ground />
      <DomainBox />
      <Fan />
      <Obstacles />
      <TagRig />
      <Exhaust />
      <Blower />
      <SmokeMachine />
      <Leaves />
      {line && <Streamlines spec={line} />}
      <Smoke count={quality === "high" ? 16000 : 6000} />

      <OrbitControls
        makeDefault
        enabled={!dragging}
        target={[3, 1.2, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={24}
        minZoom={14}
        maxZoom={160}
        maxPolarAngle={Math.PI * 0.485}
      />
      <Effects quality={quality} />
      <GizmoHelper alignment="bottom-center" margin={[0, 96]}>
        <GizmoViewport axisColors={["#ff5a5a", "#3ee08f", "#4c8dff"]} labelColor="#0b0d11" />
      </GizmoHelper>
    </Canvas>
  );
}
