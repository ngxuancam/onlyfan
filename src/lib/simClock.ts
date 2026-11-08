import { useLab } from "./store";

/**
 * Simulation time. Everything that moves (solver, rotors, swing, smoke, leaves, tags,
 * streamline pulses, the 2D streaks) advances on this clock, so the Pause button freezes
 * the whole scene in place; camera and UI stay live.
 */
export const simClock = { t: 0 };

/** Frame step for animated things: 0 while paused, else the real delta capped at `max`. */
export function simDt(delta: number, max = 1 / 30): number {
  return useLab.getState().paused ? 0 : Math.min(delta, max);
}
