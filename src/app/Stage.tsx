"use client";
import { useState } from "react";
import Scene from "@/scene/Scene";
import type { Quality } from "@/sim/config";
import { useLab } from "@/lib/store";
import type { Perf } from "@/lib/perf";

/** Picks the solver resolution once, on the client: phones and small GPUs get the coarse grid. */
function detectQuality(): Quality {
  const q = new URLSearchParams(location.search).get("q");
  if (q === "low" || q === "high") return q;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(innerWidth, innerHeight) < 600;
  return coarse || small || cores <= 4 ? "low" : "high";
}

/** Starting render budget: balanced on desktops, low on phones; `?perf=` overrides. */
function detectPerf(quality: Quality): Perf {
  const p = new URLSearchParams(location.search).get("perf");
  if (p === "high" || p === "balanced" || p === "low") return p;
  return quality === "low" ? "low" : "balanced";
}

export default function Stage() {
  const [quality] = useState<Quality>(() => {
    const q = detectQuality();
    useLab.getState().setPerf(detectPerf(q));
    return q;
  });
  return <Scene quality={quality} />;
}
