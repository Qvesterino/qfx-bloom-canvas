import { DEFAULT_SETTINGS, type QfxSettings, type MotionMode, type Quality } from "./types";
import type { Palette } from "./palettes";

// Compact URL encoding using base64url of a tiny JSON shape (short keys).
type Encoded = {
  c: number; s: number; sp: number; lt: number;
  b: 0 | 1; ca: 0 | 1; tr: 0 | 1; n: 0 | 1; cc: 0 | 1;
  rb?: 0 | 1; df?: 0 | 1; gr?: 0 | 1;
  g: number;
  p: [string, string, string];
  m: MotionMode;
  bk: number; ni: number; co: number; pr: number;
  db?: number; dfo?: number; gri?: number; ss?: number;
  q?: number;
};

const MOTIONS: MotionMode[] = ["vortex", "wave", "explosion", "orbit", "gravity", "shape"];
const LEGACY_QUALITIES: Quality[] = ["low", "medium", "high"];

function toB64Url(s: string): string {
  const b64 = typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const raw = typeof atob !== "undefined"
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("binary");
  try { return decodeURIComponent(escape(raw)); } catch { return raw; }
}

function round(n: number, d = 3) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function isHex(c: unknown): c is string {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

export function encodeSettings(s: QfxSettings): string {
  const data: Encoded = {
    c: s.count,
    s: round(s.size),
    sp: round(s.speed),
    lt: round(s.lifetime),
    b: s.bloom ? 1 : 0,
    ca: s.chromatic ? 1 : 0,
    tr: s.trails ? 1 : 0,
    n: s.noise ? 1 : 0,
    cc: s.cycleColors ? 1 : 0,
    g: round(s.glow),
    p: s.palette,
    m: s.motion,
    bk: s.bloomKernel,
    ni: round(s.noiseIntensity, 3),
    co: round(s.chromaticOffset, 5),
    pr: round(s.pixelRatio, 2),
    rb: s.ribbons ? 1 : 0,
    df: s.dof ? 1 : 0,
    gr: s.godRays ? 1 : 0,
    db: round(s.dofBokeh, 2),
    dfo: round(s.dofFocus, 3),
    gri: round(s.godRaysIntensity, 3),
    ss: round(s.shapeStrength, 3),
  };
  return toB64Url(JSON.stringify(data));
}

export function decodeSettings(token: string): QfxSettings | null {
  try {
    const obj = JSON.parse(fromB64Url(token)) as Partial<Encoded>;
    if (!obj || typeof obj !== "object") return null;
    const palette = Array.isArray(obj.p) && obj.p.length === 3 && obj.p.every(isHex)
      ? (obj.p as Palette)
      : DEFAULT_SETTINGS.palette;
    const motion = MOTIONS.includes(obj.m as MotionMode) ? (obj.m as MotionMode) : DEFAULT_SETTINGS.motion;

    // Back-compat: derive per-effect defaults from legacy `q` quality index.
    const legacyQ = typeof obj.q === "number" ? LEGACY_QUALITIES[clampInt(obj.q, 0, 2)] : undefined;
    const legacyBloomKernel = legacyQ === "low" ? 1 : legacyQ === "medium" ? 2 : legacyQ === "high" ? 3 : undefined;
    const legacyChromatic = legacyQ === "low" ? 0.0010 : legacyQ === "medium" ? 0.0014 : legacyQ === "high" ? 0.0018 : undefined;
    const legacyPR = legacyQ === "low" ? 1 : legacyQ === "medium" ? 1.5 : legacyQ === "high" ? 2 : undefined;

    return {
      ...DEFAULT_SETTINGS,
      count: clamp(Number(obj.c ?? DEFAULT_SETTINGS.count), 500, 10000),
      size: clamp(Number(obj.s ?? DEFAULT_SETTINGS.size), 0.2, 3),
      speed: clamp(Number(obj.sp ?? DEFAULT_SETTINGS.speed), 0.1, 3),
      lifetime: clamp(Number(obj.lt ?? DEFAULT_SETTINGS.lifetime), 0.4, 6),
      bloom: !!obj.b,
      chromatic: !!obj.ca,
      trails: !!obj.tr,
      noise: !!obj.n,
      cycleColors: !!obj.cc,
      glow: clamp(Number(obj.g ?? DEFAULT_SETTINGS.glow), 0, 3),
      bloomKernel: clampInt(Number(obj.bk ?? legacyBloomKernel ?? DEFAULT_SETTINGS.bloomKernel), 0, 5),
      noiseIntensity: clamp(Number(obj.ni ?? DEFAULT_SETTINGS.noiseIntensity), 0, 1),
      chromaticOffset: clamp(Number(obj.co ?? legacyChromatic ?? DEFAULT_SETTINGS.chromaticOffset), 0, 0.005),
      pixelRatio: clamp(Number(obj.pr ?? legacyPR ?? DEFAULT_SETTINGS.pixelRatio), 1, 3),
      palette,
      motion,
      paused: false,
    };
  } catch {
    return null;
  }
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

export function buildShareUrl(s: QfxSettings): string {
  const token = encodeSettings(s);
  if (typeof window === "undefined") return `#s=${token}`;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${token}`;
}

export function readSettingsFromHash(): QfxSettings | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash || "";
  const m = h.match(/[#&]s=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  return decodeSettings(m[1]);
}
