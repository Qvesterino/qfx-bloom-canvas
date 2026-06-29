import type { Palette } from "./palettes";

export type MotionMode = "vortex" | "wave" | "explosion" | "orbit" | "gravity" | "shape";
/** Legacy quality preset — kept only for share-link back-compat. */
export type Quality = "low" | "medium" | "high";

export interface QfxSettings {
  // particles
  count: number;
  size: number;
  speed: number;
  lifetime: number;
  // effects (on/off)
  bloom: boolean;
  chromatic: boolean;
  trails: boolean;       // points-only trails (longer lifetime)
  noise: boolean;
  ribbons: boolean;      // mesh ribbon trails (Resolume-style)
  dof: boolean;          // depth of field + bokeh
  godRays: boolean;      // volumetric god rays from center
  glow: number;
  // per-effect quality controls
  bloomKernel: number;
  noiseIntensity: number;
  chromaticOffset: number;
  pixelRatio: number;
  dofBokeh: number;      // 0..6 bokeh scale
  dofFocus: number;      // 0..1 focus distance (composer space)
  godRaysIntensity: number; // 0..1
  // color
  palette: Palette;
  cycleColors: boolean;
  // motion
  motion: MotionMode;
  shapeStrength: number; // 0..1 how strongly particles snap to shape
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
  ribbons: false,
  dof: false,
  godRays: false,
  glow: 1.4,
  bloomKernel: 3,
  noiseIntensity: 0.25,
  chromaticOffset: 0.0018,
  pixelRatio: 2,
  dofBokeh: 2.5,
  dofFocus: 0.5,
  godRaysIntensity: 0.6,
  palette: ["#7c3aed", "#ec4899", "#22d3ee"],
  cycleColors: false,
  motion: "vortex",
  shapeStrength: 0.55,
  paused: false,
};
