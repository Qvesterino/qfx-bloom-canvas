import { DEFAULT_SETTINGS, type QfxSettings, type MotionMode } from "./types";
import type { Palette } from "./palettes";

// Compact URL encoding using base64url of a tiny JSON shape (short keys).
type Encoded = {
  c: number; s: number; sp: number; lt: number;
  b: 0 | 1; ca: 0 | 1; tr: 0 | 1; n: 0 | 1; cc: 0 | 1;
  g: number;
  p: [string, string, string];
  m: MotionMode;
};

const MOTIONS: MotionMode[] = ["vortex", "wave", "explosion", "orbit", "gravity"];

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
