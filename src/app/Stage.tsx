"use client";
import { useState } from "react";
import Scene from "@/scene/Scene";
import type { Quality } from "@/sim/config";

/** Picks the solver resolution once, on the client: phones and small GPUs get the coarse grid. */
function detectQuality(): Quality {
  const q = new URLSearchParams(location.search).get("q");
  if (q === "low" || q === "high") return q;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(innerWidth, innerHeight) < 600;
  return coarse || small || cores <= 4 ? "low" : "high";
}

export default function Stage() {
  const [quality] = useState<Quality>(detectQuality);
  return <Scene quality={quality} />;
}
