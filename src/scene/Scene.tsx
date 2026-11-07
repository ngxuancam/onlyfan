"use client";
import { useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { Quality } from "@/sim/config";
import type { LineSpec } from "@/sim/protocol";
import { useLab } from "@/lib/store";
import { SimDriver } from "./SimDriver";
import { Fan } from "./Fan";
import { Obstacles } from "./Obstacles";
import { TagRig } from "./TagRig";
import { Exhaust } from "./Exhaust";
import { LabHall } from "./LabHall";
import { DomainBox, Ground, Smoke, Streamlines } from "./Flow";

export default function Scene({ quality }: { quality: Quality }) {
  const [line, setLine] = useState<LineSpec | null>(null);
  const onReady = useCallback((l: LineSpec) => setLine(l), []);
  const dragging = useLab((s) => s.dragging);
  const maxDpr = quality === "high" ? 1.75 : 1.25;
  const [dpr, setDpr] = useState(maxDpr);

  return (
    <Canvas
      className="scene"
      dpr={dpr}
      camera={{ position: [-9.5, 6.2, 12.5], fov: 38, near: 0.1, far: 220 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => useLab.getState().select(null)}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} />
      <color attach="background" args={["#0b0d11"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-6, 10, 7]} intensity={2.2} />
      <directionalLight position={[8, 4, -6]} intensity={0.7} color="#7fa8ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.5} position={[0, 6, 3]} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ff9a5a" position={[-6, 2, -4]} rotation-y={Math.PI / 3} scale={[4, 4, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#8ab4ff" position={[6, 3, 5]} scale={3} />
      </Environment>

      <SimDriver quality={quality} onReady={onReady} />
      <LabHall />
      <Ground />
      <DomainBox />
      <Fan />
      <Obstacles />
      <TagRig />
      <Exhaust />
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
        maxPolarAngle={Math.PI * 0.485}
      />
    </Canvas>
  );
}
