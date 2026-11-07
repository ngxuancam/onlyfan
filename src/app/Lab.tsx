"use client";
import dynamic from "next/dynamic";
import { ControlPanel, Legend } from "@/ui/Controls";
import { Toolbar } from "@/ui/Toolbar";
import { FlowMap2D } from "@/ui/FlowMap2D";
import { useLab } from "@/lib/store";

// WebGL + a Web Worker: client only
const Stage = dynamic(() => import("./Stage"), {
  ssr: false,
  loading: () => <div className="boot">Spinning up the solver…</div>,
});

export function Lab() {
  const view = useLab((s) => s.view);
  return (
    <>
      {/* the 3D stage keeps running in 2D mode: it owns the fan and feeds the solver */}
      <div className={`stage ${view === "2d" ? "is-hidden" : ""}`}>
        <Stage />
      </div>
      <FlowMap2D />
      <Toolbar />
      <ControlPanel />
      <Legend />
    </>
  );
}
