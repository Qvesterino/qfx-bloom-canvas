import type { Palette } from "./palettes";

export type MotionMode = "vortex" | "wave" | "explosion" | "orbit" | "gravity";
/** Legacy quality preset — kept only for share-link back-compat. */
export type Quality = "low" | "medium" | "high";

export interface QfxSettings {
  // particles
  count: number;          // max particle pool size
  size: number;           // particle base size
  speed: number;          // global speed multiplier
  lifetime: number;       // seconds
  // effects (on/off)
  bloom: boolean;
  chromatic: boolean;
  trails: boolean;
  noise: boolean;
  glow: number;           // 0..3
  // per-effect quality controls
  bloomKernel: number;       // 0..5 (postprocessing KernelSize: VERY_SMALL..HUGE)
  noiseIntensity: number;    // 0..1 (overlay opacity)
  chromaticOffset: number;   // 0..0.005 (uv offset)
  pixelRatio: number;        // 1..3 (capped by devicePixelRatio at runtime)
  // color
  palette: Palette;
  cycleColors: boolean;
  // motion
  motion: MotionMode;
  // state
  paused: boolean;
}

export const DEFAULT_SETTINGS: QfxSettings = {
  count: 4000,
  size: 1.4,
  speed: 1,
  lifetime: 2.4,
  bloom: true,
  chromatic: true,
  trails: true,
  noise: false,
  glow: 1.4,
  bloomKernel: 3,        // LARGE
  noiseIntensity: 0.25,
  chromaticOffset: 0.0018,
  pixelRatio: 2,
  palette: ["#7c3aed", "#ec4899", "#22d3ee"],
  cycleColors: false,
  motion: "vortex",
  paused: false,
};
