/**
 * World and grid layout shared by the solver worker and the renderer.
 *
 * World axes: +X is the default wind direction, +Y is up, Z is across.
 * One world unit is one metre.
 */
export type Vec3 = [number, number, number];

/** The simulated air volume. Everything outside it is "open air" (pressure 0). */
export const DOMAIN = {
  min: [-7, 0, -6] as Vec3,
  max: [17, 7.2, 6] as Vec3,
};

export const DOMAIN_SIZE: Vec3 = [
  DOMAIN.max[0] - DOMAIN.min[0],
  DOMAIN.max[1] - DOMAIN.min[1],
  DOMAIN.max[2] - DOMAIN.min[2],
];

export type Quality = "high" | "low";

export interface GridSpec {
  nx: number;
  ny: number;
  nz: number;
  /** cell size in metres */
  h: number;
  min: Vec3;
  size: Vec3;
}

export function gridFor(quality: Quality): GridSpec {
  const h = quality === "high" ? 0.3 : 0.4;
  return {
    nx: Math.round(DOMAIN_SIZE[0] / h),
    ny: Math.round(DOMAIN_SIZE[1] / h),
    nz: Math.round(DOMAIN_SIZE[2] / h),
    h,
    min: DOMAIN.min,
    size: DOMAIN_SIZE,
  };
}

/** Speed (m/s) that maps to the top of the colour bar. */
export const VMAX = 7;
/** Kinematic pressure (Pa per kg/m³) packed at either end of the pressure channel. The coarse collocated
 *  projection under-resolves stagnation peaks, so the scale is set to the range the solver actually produces. */
export const PMAX = 3;
/** Fan exit speed at 100 %. */
export const FAN_MAX_SPEED = 7.5;
/** Blade disc radius (m). The fan is a 2.4 m "studio" stand fan. */
export const FAN_RADIUS = 0.7;
/** Exhaust fan: a boxed extractor that pulls air through the scene, like the back end of a wind tunnel. */
export const EXHAUST_RADIUS = 0.85;
export const EXHAUST_HEIGHT = 1.05;
