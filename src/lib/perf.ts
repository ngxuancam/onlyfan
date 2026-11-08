/**
 * Rendering budgets. The solver grid is fixed per device (see Stage); everything that only
 * costs GPU / main-thread time scales with the performance level, which the user can pick
 * in the inspector and which steps down automatically when the frame rate drops.
 */
export type Perf = "high" | "balanced" | "low";

export interface PerfBudget {
  /** max device pixel ratio */
  dpr: number;
  /** post-processing: none, tone/vignette/SMAA, or that plus bloom */
  effects: "none" | "basic" | "full";
  /** key-light shadow map size; 0 = no shadows */
  shadowMap: number;
  /** re-render the shadow map every N frames */
  shadowEvery: number;
  /** smoke particle budget */
  smoke: number;
  /** fbm octaves in the smoke shader */
  octaves: number;
}

export const PERF: Record<Perf, PerfBudget> = {
  high: { dpr: 1.5, effects: "full", shadowMap: 2048, shadowEvery: 1, smoke: 14000, octaves: 5 },
  balanced: { dpr: 1.15, effects: "basic", shadowMap: 1024, shadowEvery: 2, smoke: 9000, octaves: 3 },
  low: { dpr: 1, effects: "none", shadowMap: 0, shadowEvery: 4, smoke: 4500, octaves: 3 },
};

export const PERF_ORDER: Perf[] = ["high", "balanced", "low"];

export function lowerPerf(p: Perf): Perf {
  const i = PERF_ORDER.indexOf(p);
  return PERF_ORDER[Math.min(PERF_ORDER.length - 1, i + 1)];
}
