import type { Palette } from "./palettes";

export type MotionMode = "vortex" | "wave" | "explosion" | "orbit" | "gravity";
export type Quality = "low" | "medium" | "high";

export interface QfxSettings {
  // particles
  count: number;          // max particle pool size
  size: number;           // particle base size
  speed: number;          // global speed multiplier
  lifetime: number;       // seconds
  // effects
  bloom: boolean;
  chromatic: boolean;
  trails: boolean;
  noise: boolean;
  glow: number;           // 0..3
  // color
  palette: Palette;
  cycleColors: boolean;
  // motion
  motion: MotionMode;
  // performance
  quality: Quality;
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
  palette: ["#7c3aed", "#ec4899", "#22d3ee"],
  cycleColors: false,
  motion: "vortex",
  quality: "high",
  paused: false,
};
