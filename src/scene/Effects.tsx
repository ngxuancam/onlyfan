"use client";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { PerfBudget } from "@/lib/perf";

/**
 * Post-processing for the "photographed" look: a filmic tone curve (AgX), a light vignette
 * and SMAA; the high level adds a soft bloom on the light bars and softboxes. The low level
 * skips the composer (the renderer applies its own tone mapping).
 * (N8AO ambient occlusion breaks render targets with three 0.187, so it is left out.)
 */
export function Effects({ mode }: { mode: PerfBudget["effects"] }) {
  if (mode === "none") return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {mode === "full" ? <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.15} intensity={0.55} /> : <></>}
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.28} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
