"use client";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { Quality } from "@/sim/config";

/**
 * Post-processing for the "photographed" look:
 * a filmic tone curve (AgX), a soft bloom on the light bars and softboxes, a light vignette
 * and SMAA. (N8AO ambient occlusion breaks render targets with three 0.187, so it is left out.)
 * Phones skip the composer entirely.
 */
export function Effects({ quality }: { quality: Quality }) {
  if (quality === "low") return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.15} intensity={0.55} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <Vignette offset={0.28} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
