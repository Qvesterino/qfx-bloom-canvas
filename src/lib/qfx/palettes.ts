export type Palette = [string, string, string];

export const PALETTES: Palette[] = [
  ["#7c3aed", "#ec4899", "#22d3ee"],
  ["#06b6d4", "#a78bfa", "#f472b6"],
  ["#f97316", "#ef4444", "#eab308"],
  ["#10b981", "#06b6d4", "#3b82f6"],
  ["#f43f5e", "#8b5cf6", "#06b6d4"],
  ["#fde047", "#fb7185", "#a78bfa"],
  ["#34d399", "#fbbf24", "#f472b6"],
  ["#22d3ee", "#818cf8", "#e879f9"],
  ["#84cc16", "#06b6d4", "#a855f7"],
  ["#fb923c", "#f472b6", "#60a5fa"],
];

export function randomPalette(): Palette {
  return PALETTES[Math.floor(Math.random() * PALETTES.length)];
}
