"use client";
import { create } from "zustand";
import type { ObjKind } from "@/sim/obstacles";

export type ObjKey = ObjKind | "rig" | "exhaust";
export type Selectable = ObjKey | "fan";

export interface ObjState {
  enabled: boolean;
  x: number;
  z: number;
  /** degrees */
  yaw: number;
}

export interface FanState {
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

export interface Layers {
  /** smoke-gun streaklines from a nozzle rake in front of the fan */
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

interface S {
  view: View;
  /** height of the horizontal slice shown in 2D mode, metres */
  slice: number;
  setView: (v: View) => void;
  setSlice: (y: number) => void;
  fan: FanState;
  objects: Record<ObjKey, ObjState>;
  layers: Layers;
  selected: Selectable | null;
  dragging: boolean;
  /** bumps whenever the obstacle layout changes (re-voxelise) */
  layoutVersion: number;
  stats: Stats;
  setFan: (p: Partial<FanState>) => void;
  setObj: (k: ObjKey, p: Partial<ObjState>) => void;
  setLayers: (p: Partial<Layers>) => void;
  select: (k: Selectable | null) => void;
  setDragging: (d: boolean) => void;
  setStats: (s: Partial<Stats>) => void;
  applyPreset: (id: PresetId) => void;
}

export type PresetId = "playground" | "tunnel" | "ventilation" | "shelter";

const DEFAULT_FAN: FanState = { suction: 0.8, speed: 0.8, oscillate: true, sweep: 60, yaw: 0, tilt: 4, height: 2.0, x: -4.5, z: 0 };

const off = (x: number, z: number, yaw = 0): ObjState => ({ enabled: false, x, z, yaw });
const on = (x: number, z: number, yaw = 0): ObjState => ({ enabled: true, x, z, yaw });

export const PRESETS: Record<PresetId, { label: string; hint: string; fan: Partial<FanState>; objects: Record<ObjKey, ObjState> }> = {
  playground: {
    label: "Playground",
    hint: "Everything at once — the head sweeps across car, house and tree.",
    fan: { ...DEFAULT_FAN },
    objects: { car: on(0.8, -2.4), house: on(7.5, 1.6), tree: on(3.4, 3.4), shrub: off(3, -3.8), rig: on(-1.6, 1.6, 0), exhaust: off(4.6, -2.4) },
  },
  tunnel: {
    label: "Wind tunnel",
    hint: "Blower in front, exhaust fan behind: air is pushed onto the nose and pulled off the tail, like a car driving at speed. Watch the load on the nose and the wake.",
    fan: { speed: 1, oscillate: false, yaw: 0, tilt: -2, height: 1.25, x: -3.4, z: 0 },
    objects: { car: on(0.6, 0), house: off(8, 2), tree: off(4, 3.5), shrub: off(3, -3.6), rig: off(4.6, 0, 0), exhaust: on(4.4, 0) },
  },
  ventilation: {
    label: "Cross ventilation",
    hint: "Window-height jet into the windward opening; it turns at the partition and leaves through the far window and door.",
    fan: { speed: 1, oscillate: false, yaw: 0, tilt: -3, height: 1.4, x: -3.6, z: 0 },
    objects: { car: off(0, -3), house: on(1.8, 0), tree: off(5, 3.5), shrub: off(-1.5, -3), rig: on(-1.2, 0, 0), exhaust: off(6, 0) },
  },
  shelter: {
    label: "Tree & shrub",
    hint: "A tree canopy and a hedge between the fan and the house: porous foliage bleeds speed and lifts the flow over the roof.",
    fan: { speed: 1, oscillate: true, sweep: 30, yaw: 0, tilt: 6, height: 2.2, x: -5, z: 0 },
    objects: { car: off(0, -3.5), house: on(6.2, 0), tree: on(1.2, 1.1), shrub: on(2.6, -1.4), rig: on(-2.2, -1.6, 0), exhaust: off(9, 0) },
  },
};

export const useLab = create<S>((set) => ({
  view: "3d",
  slice: 1.0,
  setView: (view) => set({ view }),
  setSlice: (slice) => set({ slice }),
  fan: { ...DEFAULT_FAN },
  objects: PRESETS.playground.objects,
  layers: { smoke: true, streamlines: false, surfaceHeat: true, groundHeat: false, xray: false },
  selected: null,
  dragging: false,
  layoutVersion: 0,
  stats: { fps: 0, stepMs: 0, simHz: 0, maxSpeed: 0, grid: "" },
  setFan: (p) => set((s) => ({ fan: { ...s.fan, ...p } })),
  setObj: (k, p) =>
    set((s) => ({
      objects: { ...s.objects, [k]: { ...s.objects[k], ...p } },
      layoutVersion: k === "rig" || k === "exhaust" ? s.layoutVersion : s.layoutVersion + 1,
    })),
  setLayers: (p) => set((s) => ({ layers: { ...s.layers, ...p } })),
  select: (k) => set({ selected: k }),
  setDragging: (d) => set({ dragging: d }),
  setStats: (st) => set((s) => ({ stats: { ...s.stats, ...st } })),
  applyPreset: (id) =>
    set((s) => ({
      fan: { ...DEFAULT_FAN, ...PRESETS[id].fan },
      objects: structuredClone(PRESETS[id].objects),
      layers: { ...s.layers, xray: id === "ventilation" },
      layoutVersion: s.layoutVersion + 1,
      selected: null,
    })),
}));

export const OBJ_LABEL: Record<Selectable, string> = {
  fan: "Fan",
  car: "Car",
  house: "House",
  tree: "Tree",
  shrub: "Shrub",
  rig: "Tag rig",
  exhaust: "Exhaust fan",
};
