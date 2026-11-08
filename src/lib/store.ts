"use client";
import { create } from "zustand";
import type { ObjKind } from "@/sim/obstacles";
import type { Perf } from "./perf";

/** Everything that can be placed in the scene besides the stand fan. */
export type ObjKey = ObjKind | "rig" | "exhaust" | "blower" | "smoker";
export type Selectable = ObjKey | "fan";

export interface ObjState {
  enabled: boolean;
  x: number;
  z: number;
  /** degrees */
  yaw: number;
}

export interface FanState {
  /** the stand fan itself can be switched off as a source */
  enabled: boolean;
  /** 0..1 */
  speed: number;
  oscillate: boolean;
  /** total sweep, degrees */
  sweep: number;
  /** base direction, degrees (0 = +X) */
  yaw: number;
  /** head tilt, degrees */
  tilt: number;
  /** head height, metres */
  height: number;
  x: number;
  z: number;
  /** exhaust fan suction, 0..1 */
  suction: number;
}

/** Per-source settings for the extra wind / smoke / leaf sources. */
export interface SourceParams {
  /** industrial blower: 0..1 power, tilt in degrees */
  blowerPower: number;
  blowerTilt: number;
  /** smoke machine: output 0..1, nozzle jet 0..1, nozzle height m */
  smokeOutput: number;
  smokeJet: number;
  smokeHeight: number;
  /** tree: drop leaves, leaves per second */
  leaves: boolean;
  leafRate: number;
}

export interface Layers {
  /** smoke-gun rake in front of the stand fan */
  smoke: boolean;
  /** speed-coloured streamlines (CFD post-processing style) */
  streamlines: boolean;
  /** wind load (surface pressure) on the obstacles */
  surfaceHeat: boolean;
  /** near-ground wind speed slice */
  groundHeat: boolean;
  xray: boolean;
}

export interface Stats {
  fps: number;
  stepMs: number;
  simHz: number;
  maxSpeed: number;
  grid: string;
}

export type View = "3d" | "2d";
export type Theme = "studio" | "hall";
export type CameraMode = "perspective" | "orthographic";

interface S {
  /** rendering budget (see lib/perf.ts) */
  perf: Perf;
  /** true once the user picked a level: no more automatic downgrades */
  perfPinned: boolean;
  setPerf: (p: Perf, pinned?: boolean) => void;
  view: View;
  theme: Theme;
  camera: CameraMode;
  /** solver paused */
  paused: boolean;
  /** bump to clear the flow field */
  resetToken: number;
  /** height of the horizontal slice shown in 2D mode, metres */
  slice: number;
  fan: FanState;
  params: SourceParams;
  objects: Record<ObjKey, ObjState>;
  layers: Layers;
  selected: Selectable | null;
  dragging: boolean;
  /** bumps whenever the obstacle layout changes (re-voxelise) */
  layoutVersion: number;
  stats: Stats;
  setView: (v: View) => void;
  setTheme: (t: Theme) => void;
  setCamera: (c: CameraMode) => void;
  setPaused: (p: boolean) => void;
  resetFlow: () => void;
  setSlice: (y: number) => void;
  setFan: (p: Partial<FanState>) => void;
  setParams: (p: Partial<SourceParams>) => void;
  setObj: (k: ObjKey, p: Partial<ObjState>) => void;
  setLayers: (p: Partial<Layers>) => void;
  select: (k: Selectable | null) => void;
  setDragging: (d: boolean) => void;
  setStats: (s: Partial<Stats>) => void;
  applyPreset: (id: PresetId) => void;
}

export type PresetId = "playground" | "tunnel" | "ventilation" | "shelter";

const DEFAULT_FAN: FanState = {
  enabled: true,
  suction: 0.8,
  speed: 0.8,
  oscillate: true,
  sweep: 60,
  yaw: 0,
  tilt: 4,
  height: 2.0,
  x: -4.5,
  z: 0,
};

const DEFAULT_PARAMS: SourceParams = {
  blowerPower: 0.8,
  blowerTilt: 0,
  smokeOutput: 0.7,
  smokeJet: 0.35,
  smokeHeight: 0.6,
  leaves: true,
  leafRate: 6,
};

const off = (x: number, z: number, yaw = 0): ObjState => ({ enabled: false, x, z, yaw });
const on = (x: number, z: number, yaw = 0): ObjState => ({ enabled: true, x, z, yaw });

/** objects that do not change the voxel layout when moved */
const NON_SOLID: ObjKey[] = ["rig", "exhaust", "blower", "smoker"];

export const PRESETS: Record<
  PresetId,
  { label: string; hint: string; fan: Partial<FanState>; params?: Partial<SourceParams>; objects: Record<ObjKey, ObjState> }
> = {
  playground: {
    label: "Playground",
    hint: "Everything at once: the head sweeps across car, house and tree, and the tree sheds leaves into the wind.",
    fan: { ...DEFAULT_FAN },
    objects: {
      car: on(1.0, -2.6),
      house: on(7.5, 1.6),
      tree: on(3.4, 3.4),
      shrub: off(3, -3.8),
      rig: on(-1.6, 1.6, 0),
      exhaust: off(4.6, -2.4),
      blower: off(-5, -4),
      smoker: off(-2.5, -1.2),
    },
  },
  tunnel: {
    label: "Wind tunnel",
    hint: "Blower in front, exhaust fan behind and a smoke machine at the nose: air is pushed onto the car and pulled off the tail, as if it were driving.",
    fan: { enabled: false, speed: 1, oscillate: false, yaw: 0, tilt: -2, height: 1.25, x: -3.4, z: 3 },
    params: { blowerPower: 0.9, blowerTilt: 0, smokeHeight: 0.45, smokeJet: 0.25, smokeOutput: 0.8 },
    objects: {
      car: on(1.2, 0),
      house: off(8, 2),
      tree: off(4, 3.5),
      shrub: off(3, -3.6),
      rig: off(4.6, 0, 0),
      exhaust: on(5.6, 0),
      blower: on(-4.4, 0),
      smoker: on(-2.6, 0),
    },
  },
  ventilation: {
    label: "Cross ventilation",
    hint: "Window-height jet into the windward opening; it turns at the partition and leaves through the far window and door.",
    fan: { speed: 1, oscillate: false, yaw: 0, tilt: -3, height: 1.4, x: -3.6, z: 0 },
    objects: {
      car: off(0, -3),
      house: on(1.8, 0),
      tree: off(5, 3.5),
      shrub: off(-1.5, -3),
      rig: on(-1.2, 0, 0),
      exhaust: off(6, 0),
      blower: off(-5, -4),
      smoker: off(-2, 2),
    },
  },
  shelter: {
    label: "Tree & shrub",
    hint: "A tree canopy and a hedge between the fan and the house: porous foliage bleeds speed, lifts the flow over the roof and sheds leaves downwind.",
    fan: { speed: 1, oscillate: true, sweep: 30, yaw: 0, tilt: 6, height: 2.2, x: -5, z: 0 },
    params: { leaves: true, leafRate: 10 },
    objects: {
      car: off(0, -3.5),
      house: on(6.2, 0),
      tree: on(1.2, 1.1),
      shrub: on(2.6, -1.4),
      rig: on(-2.2, -1.6, 0),
      exhaust: off(9, 0),
      blower: off(-5, -4),
      smoker: off(-3, 3),
    },
  },
};

export const useLab = create<S>((set) => ({
  perf: "balanced",
  perfPinned: false,
  setPerf: (perf, pinned = false) => set((s) => ({ perf, perfPinned: pinned || s.perfPinned })),
  view: "3d",
  theme: "studio",
  camera: "perspective",
  paused: false,
  resetToken: 0,
  slice: 1.0,
  fan: { ...DEFAULT_FAN },
  params: { ...DEFAULT_PARAMS },
  objects: structuredClone(PRESETS.playground.objects),
  layers: { smoke: true, streamlines: false, surfaceHeat: true, groundHeat: false, xray: false },
  selected: null,
  dragging: false,
  layoutVersion: 0,
  stats: { fps: 0, stepMs: 0, simHz: 0, maxSpeed: 0, grid: "" },
  setView: (view) => set({ view }),
  setTheme: (theme) => set({ theme }),
  setCamera: (camera) => set({ camera }),
  setPaused: (paused) => set({ paused }),
  resetFlow: () => set((s) => ({ resetToken: s.resetToken + 1 })),
  setSlice: (slice) => set({ slice }),
  setFan: (p) => set((s) => ({ fan: { ...s.fan, ...p } })),
  setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
  setObj: (k, p) =>
    set((s) => ({
      objects: { ...s.objects, [k]: { ...s.objects[k], ...p } },
      layoutVersion: NON_SOLID.includes(k) ? s.layoutVersion : s.layoutVersion + 1,
    })),
  setLayers: (p) => set((s) => ({ layers: { ...s.layers, ...p } })),
  select: (k) => set({ selected: k }),
  setDragging: (d) => set({ dragging: d }),
  setStats: (st) => set((s) => ({ stats: { ...s.stats, ...st } })),
  applyPreset: (id) =>
    set((s) => ({
      fan: { ...DEFAULT_FAN, ...PRESETS[id].fan },
      params: { ...DEFAULT_PARAMS, ...PRESETS[id].params },
      objects: structuredClone(PRESETS[id].objects),
      layers: { ...s.layers, xray: id === "ventilation" },
      layoutVersion: s.layoutVersion + 1,
      selected: null,
    })),
}));

export const OBJ_LABEL: Record<Selectable, string> = {
  fan: "Stand fan",
  blower: "Industrial blower",
  exhaust: "Exhaust fan",
  smoker: "Smoke machine",
  car: "Car",
  house: "House",
  tree: "Tree",
  shrub: "Shrub",
  rig: "Tag rig",
};
