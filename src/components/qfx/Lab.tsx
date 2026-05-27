import { useEffect, useRef, useState, useCallback } from "react";
import { QfxEngine } from "@/lib/qfx/engine";
import { DEFAULT_SETTINGS, type QfxSettings, type MotionMode } from "@/lib/qfx/types";
import { PRESETS } from "@/lib/qfx/presets";
import { randomPalette, PALETTES } from "@/lib/qfx/palettes";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { buildShareUrl, readSettingsFromHash } from "@/lib/qfx/share";
import {
  Play, Pause, Trash2, Shuffle, Camera, Zap, ChevronLeft, Share2,
  Sparkles, Waves, Orbit, Wind, Flame,
} from "lucide-react";


const MOTIONS: { id: MotionMode; label: string; icon: typeof Sparkles }[] = [
  { id: "vortex", label: "Vortex", icon: Orbit },
  { id: "wave", label: "Wave", icon: Waves },
  { id: "explosion", label: "Explosion", icon: Flame },
  { id: "orbit", label: "Orbit", icon: Sparkles },
  { id: "gravity", label: "Drift", icon: Wind },
];

function randomChaos(current: QfxSettings): QfxSettings {
  const motions: MotionMode[] = ["vortex", "wave", "explosion", "orbit", "gravity"];
  return {
    ...current,
    palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
    motion: motions[Math.floor(Math.random() * motions.length)],
    count: 2000 + Math.floor(Math.random() * 5000),
    size: 0.6 + Math.random() * 2,
    speed: 0.4 + Math.random() * 2,
    lifetime: 1 + Math.random() * 3.5,
    bloom: Math.random() > 0.1,
    chromatic: Math.random() > 0.3,
    trails: Math.random() > 0.4,
    noise: Math.random() > 0.6,
    glow: 0.6 + Math.random() * 2.4,
    cycleColors: Math.random() > 0.4,
  };
}

export function Lab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<QfxEngine | null>(null);
  const [settings, setSettings] = useState<QfxSettings>(() => readSettingsFromHash() ?? DEFAULT_SETTINGS);

  
  const [panelOpen, setPanelOpen] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [chaosPulse, setChaosPulse] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new QfxEngine(canvasRef.current, settings);
    engineRef.current = engine;
    engine.randomizeBurst();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((p: Partial<QfxSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      engineRef.current?.update_settings(p);
      return next;
    });
  }, []);

  const applyFull = useCallback((next: QfxSettings) => {
    setSettings(next);
    engineRef.current?.update_settings(next);
  }, []);

  const onPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    const next = p.apply(settings);
    applyFull(next);
    setActivePreset(id);
    engineRef.current?.randomizeBurst();
    toast(p.name, { description: p.hint });
  };

  const onChaos = () => {
    const next = randomChaos(settings);
    applyFull(next);
    setActivePreset(null);
    engineRef.current?.randomizeBurst();
    setChaosPulse((n) => n + 1);
  };

  const onScreenshot = () => {
    const url = engineRef.current?.screenshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `qfx-${Date.now()}.png`;
    a.click();
    toast("Screenshot saved");
  };

  const onShare = async () => {
    const url = buildShareUrl(settings);
    try {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", url);
      }
      await navigator.clipboard.writeText(url);
      toast("Share link copied", { description: "URL encodes preset, colors & effects." });
    } catch {
      toast("Share link ready", { description: url });
    }
  };


  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05060a] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ambient gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,58,237,0.18),transparent_50%),radial-gradient(circle_at_80%_90%,rgba(34,211,238,0.14),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 [background:linear-gradient(180deg,rgba(0,0,0,0.55)_0%,transparent_18%,transparent_82%,rgba(0,0,0,0.55)_100%)]" />

      {/* TOP TOOLBAR */}
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <Brand />
          <Divider />
          <TbBtn onClick={() => patch({ paused: !settings.paused })} title={settings.paused ? "Play" : "Pause"}>
            {settings.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </TbBtn>
          <TbBtn onClick={() => { engineRef.current?.clear(); }} title="Clear">
            <Trash2 className="size-4" />
          </TbBtn>
          <TbBtn onClick={() => { engineRef.current?.randomizeBurst(); }} title="Randomize scene">
            <Shuffle className="size-4" />
          </TbBtn>
          <TbBtn onClick={onScreenshot} title="Screenshot">
            <Camera className="size-4" />
          </TbBtn>
          <Divider />
          <button
            onClick={onChaos}
            className="group relative ml-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 px-3.5 py-1.5 text-xs font-medium tracking-wide text-white shadow-[0_0_30px_-4px_rgba(168,85,247,0.65)] transition active:scale-95"
          >
            <span className="absolute inset-0 rounded-full bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
            <Zap className="size-3.5" />
            CHAOS
            <span
              key={chaosPulse}
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/60 [animation:qfx-ping_700ms_ease-out_forwards]"
            />
          </button>
        </div>
      </div>

      {/* COLLAPSE BUTTON */}
      <button
        onClick={() => setPanelOpen((v) => !v)}
        className="absolute left-4 top-4 z-20 inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 backdrop-blur-xl transition hover:bg-white/[0.08] hover:text-white"
        title={panelOpen ? "Hide panel" : "Show panel"}
      >
        <ChevronLeft className={`size-4 transition-transform ${panelOpen ? "" : "rotate-180"}`} />
      </button>

      {/* LEFT PANEL */}
      <div
        className={`absolute left-4 top-16 z-10 w-[300px] transition-all duration-500 ease-out ${
          panelOpen ? "translate-x-0 opacity-100" : "-translate-x-[110%] opacity-0"
        }`}
      >
        <div className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_20px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-2xl scrollbar-thin">
          <Section title="Presets">
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPreset(p.id)}
                  className={`group relative overflow-hidden rounded-xl border p-2.5 text-left transition ${
                    activePreset === p.id
                      ? "border-white/30 bg-white/[0.08]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="mb-1.5 flex h-6 gap-0.5 overflow-hidden rounded-md">
                    {p.apply(settings).palette.map((c, i) => (
                      <div key={i} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                  <div className="text-[11px] font-medium text-white/90">{p.name}</div>
                  <div className="text-[10px] text-white/40">{p.hint}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Motion">
            <div className="grid grid-cols-5 gap-1.5">
              {MOTIONS.map((m) => {
                const Icon = m.icon;
                const active = settings.motion === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => patch({ motion: m.id })}
                    title={m.label}
                    className={`group flex flex-col items-center gap-1 rounded-lg border py-2 text-[9px] transition ${
                      active
                        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                        : "border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white/80"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Particles">
            <Sl label="Count" value={settings.count} min={500} max={10000} step={100}
              onChange={(v) => patch({ count: v })} fmt={(v) => v.toLocaleString()} />
            <Sl label="Size" value={settings.size} min={0.2} max={3} step={0.05}
              onChange={(v) => patch({ size: v })} fmt={(v) => v.toFixed(2)} />
            <Sl label="Speed" value={settings.speed} min={0.1} max={3} step={0.05}
              onChange={(v) => patch({ speed: v })} fmt={(v) => v.toFixed(2) + "x"} />
            <Sl label="Lifetime" value={settings.lifetime} min={0.4} max={6} step={0.1}
              onChange={(v) => patch({ lifetime: v })} fmt={(v) => v.toFixed(1) + "s"} />
          </Section>

          <Section title="Effects">
            <Tg label="Bloom" value={settings.bloom} onChange={(v) => patch({ bloom: v })} />
            <Tg label="Chromatic Aberration" value={settings.chromatic} onChange={(v) => patch({ chromatic: v })} />
            <Tg label="Trails" value={settings.trails} onChange={(v) => patch({ trails: v })} />
            <Tg label="Noise / Distortion" value={settings.noise} onChange={(v) => patch({ noise: v })} />
            <Sl label="Glow" value={settings.glow} min={0} max={3} step={0.05}
              onChange={(v) => patch({ glow: v })} fmt={(v) => v.toFixed(2)} />
          </Section>

          <Section title="Color">
            <div className="mb-3 flex h-9 gap-1 overflow-hidden rounded-lg ring-1 ring-white/10">
              {settings.palette.map((c, i) => (
                <div key={i} className="flex-1 transition-all" style={{ background: c }} />
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {PALETTES.map((p, i) => (
                <button
                  key={i}
                  onClick={() => patch({ palette: p })}
                  className="h-6 overflow-hidden rounded-md ring-1 ring-white/10 transition hover:ring-white/40"
                  style={{ background: `linear-gradient(90deg, ${p.join(",")})` }}
                />
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 flex-1 bg-white/[0.05] text-[11px] text-white hover:bg-white/[0.1] border-white/10 border"
                onClick={() => patch({ palette: randomPalette() })}
              >
                Random palette
              </Button>
            </div>
            <Tg label="Cycle colors" value={settings.cycleColors} onChange={(v) => patch({ cycleColors: v })} />
          </Section>

          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.18em] text-white/30">
            <span>QFX · v0.1</span>
            <span>Move mouse · click to burst</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes qfx-ping {
          0% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 pl-2 pr-1">
      <div className="relative size-5">
        <div className="absolute inset-0 rounded-md bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400" />
        <div className="absolute inset-[2px] rounded-[5px] bg-[#05060a]" />
        <div className="absolute inset-[5px] rounded-[3px] bg-gradient-to-br from-fuchsia-400 to-cyan-300" />
      </div>
      <div className="text-[11px] font-semibold tracking-[0.18em] text-white/80">QFX · MINI LAB</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-white/10" />;
}

function TbBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex size-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">{title}</div>
      {children}
    </div>
  );
}

function Sl({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-white/60">{label}</span>
        <span className="font-mono text-white/40">{fmt(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="[&_[data-slot=slider-track]]:bg-white/10 [&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-fuchsia-400 [&_[data-slot=slider-range]]:to-cyan-300 [&_[data-slot=slider-thumb]]:border-white/40 [&_[data-slot=slider-thumb]]:bg-white"
      />
    </div>
  );
}

function Tg({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-1.5 flex cursor-pointer items-center justify-between rounded-lg px-1 py-1 text-[11px] text-white/70 transition hover:bg-white/[0.03]">
      <span>{label}</span>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-fuchsia-500 data-[state=checked]:to-cyan-400"
      />
    </label>
  );
}
