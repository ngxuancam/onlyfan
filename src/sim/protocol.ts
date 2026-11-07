import type { GridSpec, Quality } from "./config";
import type { ObjKind, PlacedObject } from "./obstacles";
import type { FanInput } from "./solver";

export interface LineSpec {
  /** number of streamlines */
  lines: number;
  /** max points per line */
  steps: number;
}

export type ToWorker =
  | { type: "init"; quality: Quality }
  | {
      type: "step";
      dt: number;
      /** the stand fan (streamlines are seeded on it) */
      fan: FanInput;
      /** extra momentum discs: the exhaust fan behind the car */
      extra: FanInput[];
      /** present when the obstacle layout changed */
      objects?: PlacedObject[];
      streamlines: boolean;
    };

export type FromWorker =
  | { type: "ready"; grid: GridSpec; line: LineSpec }
  | {
      type: "field";
      /** interior RGBA8: speed, pressure, drag, solid */
      tex: Uint8Array;
      /** interior velocity, xyz interleaved */
      vel: Float32Array;
      /** interior RGBA8 velocity direction (0.5 = 0, ±VMAX at the ends) */
      dir: Uint8Array;
      /** pressure force (N) on each obstacle, xyz, in the order of forceKinds */
      forces: Float32Array;
      forceKinds: ObjKind[];
      /** streamlines: positions (lines*steps*3), speed and time-of-flight (lines*steps), point count per line */
      lpos?: Float32Array;
      lspd?: Float32Array;
      ltof?: Float32Array;
      llen?: Uint16Array;
      ms: number;
      maxSpeed: number;
    };
