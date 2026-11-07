"use client";
import dynamic from "next/dynamic";
import { Inspector, LegendDock, Outliner, Toolbar, ViewBar } from "@/ui/Editor";
import { FlowMap2D } from "@/ui/FlowMap2D";
import { useLab } from "@/lib/store";

// WebGL + a Web Worker: client only
const Stage = dynamic(() => import("./Stage"), {
  ssr: false,
  loading: () => <div className="boot">Spinning up the solver…</div>,
});

export function Lab() {
  const view = useLab((s) => s.view);
  const theme = useLab((s) => s.theme);
  return (
    <div className={`editor theme-${theme}`}>
      {/* the 3D stage keeps running in 2D mode: it owns the fans and feeds the solver */}
      <div className={`stage ${view === "2d" ? "is-hidden" : ""}`}>
        <Stage />
      </div>
      <FlowMap2D />
      <Outliner />
      <Inspector />
      <Toolbar />
      <ViewBar />
      <LegendDock />
    </div>
  );
}
