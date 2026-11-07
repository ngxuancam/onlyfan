"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { field } from "@/sim/field";
import { OBJ_LABEL, PRESETS, useLab, type ObjKey, type PresetId } from "@/lib/store";
import { PALETTE_CSS } from "@/lib/palette";
import { PMAX, VMAX } from "@/sim/config";

/* -------------------------------------------------------------- atoms */

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  format,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`slider ${disabled ? "is-disabled" : ""}`}>
      <span className="slider-head">
        <span>{label}</span>
        <output>
          {format ? format(value) : value}
          {unit && <small>{unit}</small>}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle" title={hint}>
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <header>
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------- sections */

const SPEED_STEPS: [number, string][] = [
  [0, "Off"],
  [0.45, "1"],
  [0.7, "2"],
  [1, "3"],
];

/**
 * Blowing direction, live: the thumb follows the oscillating head; the shaded band is the
 * sweep range. Dragging sets the centre of the sweep (the fan's base direction).
 */
function DirectionSlider() {
  const fan = useLab((s) => s.fan);
  const setFan = useLab((s) => s.setFan);
  const [live, setLive] = useState(fan.yaw);
  const held = useRef(false);
  const [holding, setHolding] = useState(false);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 40 || held.current) return;
      last = t;
      setLive(Math.round(field.fan.headYaw));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = holding ? fan.yaw : live;
  const wrap = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
  const pct = (v: number) => ((Math.max(-180, Math.min(180, v)) + 180) / 360) * 100;
  const half = fan.oscillate ? fan.sweep / 2 : 0;
  const band = `linear-gradient(90deg, rgba(255,255,255,.12) ${pct(fan.yaw - half)}%, rgba(255,106,26,.45) ${pct(fan.yaw - half)}%, rgba(255,106,26,.45) ${pct(fan.yaw + half)}%, rgba(255,255,255,.12) ${pct(fan.yaw + half)}%)`;
  return (
    <label className="slider">
      <span className="slider-head">
        <span>
          Direction {fan.oscillate && fan.speed > 0 && <em className="live">live</em>}
        </span>
        <output>
          {wrap(shown)}
          <small>°</small>
        </output>
      </span>
      <input
        type="range"
        className="dir"
        min={-180}
        max={180}
        step={1}
        value={wrap(shown)}
        style={{ "--band": band } as React.CSSProperties}
        onPointerDown={() => ((held.current = true), setHolding(true))}
        onPointerUp={() => ((held.current = false), setHolding(false))}
        onBlur={() => ((held.current = false), setHolding(false))}
        onChange={(e) => {
          setFan({ yaw: Number(e.target.value) });
          setLive(Number(e.target.value));
        }}
      />
    </label>
  );
}

function FanSection() {
  const fan = useLab((s) => s.fan);
  const setFan = useLab((s) => s.setFan);
  return (
    <Section title="Fan" aside={<span className="chip-mono">{(fan.speed * 7.5).toFixed(1)} m/s exit</span>}>
      <div className="speed-row" role="radiogroup" aria-label="Fan speed preset">
        {SPEED_STEPS.map(([v, l]) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={Math.abs(fan.speed - v) < 0.02}
            className={`speed-btn ${Math.abs(fan.speed - v) < 0.02 ? "on" : ""}`}
            onClick={() => setFan({ speed: v })}
          >
            {l}
          </button>
        ))}
      </div>
      <Slider label="Speed" value={Math.round(fan.speed * 100)} min={0} max={100} unit="%" onChange={(v) => setFan({ speed: v / 100 })} />
      <Toggle label="Oscillate" checked={fan.oscillate} onChange={(v) => setFan({ oscillate: v })} />
      <Slider label="Sweep angle" value={fan.sweep} min={10} max={120} unit="°" onChange={(v) => setFan({ sweep: v })} disabled={!fan.oscillate} />
      <DirectionSlider />
      <Slider label="Head tilt" value={fan.tilt} min={-20} max={30} unit="°" onChange={(v) => setFan({ tilt: v })} />
      <Slider label="Height" value={fan.height} min={1.2} max={2.6} step={0.05} unit=" m" format={(v) => v.toFixed(2)} onChange={(v) => setFan({ height: v })} />
    </Section>
  );
}

const OBJ_KEYS: ObjKey[] = ["car", "house", "tree", "shrub", "rig", "exhaust"];

function SuctionSlider() {
  const suction = useLab((s) => s.fan.suction);
  const setFan = useLab((s) => s.setFan);
  return <Slider label="Suction" value={Math.round(suction * 100)} min={0} max={100} unit="%" onChange={(v) => setFan({ suction: v / 100 })} />;
}

function ObjectsSection() {
  const objects = useLab((s) => s.objects);
  const selected = useLab((s) => s.selected);
  const setObj = useLab((s) => s.setObj);
  const select = useLab((s) => s.select);
  const sel = selected && selected !== "fan" ? selected : null;
  return (
    <Section title="Obstacles" aside={<span className="hint">drag in the scene</span>}>
      <div className="chips">
        {OBJ_KEYS.map((k) => {
          const o = objects[k];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={o.enabled}
              className={`chip ${o.enabled ? "on" : ""} ${sel === k ? "sel" : ""}`}
              onClick={() => {
                if (!o.enabled) {
                  setObj(k, { enabled: true });
                  select(k);
                } else if (sel === k) {
                  setObj(k, { enabled: false });
                  select(null);
                } else select(k);
              }}
            >
              <span className="dot" />
              {OBJ_LABEL[k]}
            </button>
          );
        })}
      </div>
      {sel && objects[sel].enabled ? (
        <div className="selected">
          <div className="selected-head">
            <strong>{OBJ_LABEL[sel]}</strong>
            <span className="chip-mono">
              x {objects[sel].x.toFixed(1)} · z {objects[sel].z.toFixed(1)}
            </span>
            <button type="button" className="link" onClick={() => (setObj(sel, { enabled: false }), select(null))}>
              Remove
            </button>
          </div>
          <Slider label="Rotation" value={objects[sel].yaw} min={-180} max={180} unit="°" onChange={(v) => setObj(sel, { yaw: v })} />
          {sel === "exhaust" && <SuctionSlider />}
        </div>
      ) : (
        <p className="hint block">Tap a chip to add or select. Tap a selected chip again to remove it.</p>
      )}
    </Section>
  );
}

function LayersSection() {
  const layers = useLab((s) => s.layers);
  const set = useLab((s) => s.setLayers);
  return (
    <Section title="Layers">
      <Toggle label="Smoke gun" checked={layers.smoke} onChange={(v) => set({ smoke: v })} />
      <Toggle label="Streamlines (speed colour)" checked={layers.streamlines} onChange={(v) => set({ streamlines: v })} />
      <Toggle label="Wind load on objects" checked={layers.surfaceHeat} onChange={(v) => set({ surfaceHeat: v })} />
      <Toggle label="Ground wind-speed map" checked={layers.groundHeat} onChange={(v) => set({ groundHeat: v })} />
      <Toggle label="X-ray walls & roof" checked={layers.xray} onChange={(v) => set({ xray: v })} />
    </Section>
  );
}

function PresetsSection() {
  const apply = useLab((s) => s.applyPreset);
  const [active, setActive] = useState<PresetId>("playground");
  return (
    <Section title="Scenarios">
      <div className="presets">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`preset ${active === id ? "on" : ""}`}
            onClick={() => {
              apply(id);
              setActive(id);
            }}
          >
            {PRESETS[id].label}
          </button>
        ))}
      </div>
      <p className="hint block">{PRESETS[active].hint}</p>
    </Section>
  );
}

/* --------------------------------------------------------------- panel */

export function ControlPanel() {
  const [open, setOpen] = useState(true);
  return (
    <aside className={`panel glass ${open ? "is-open" : ""}`} aria-label="Simulation controls">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{open ? "Hide controls" : "Controls"}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d={open ? "M3 9l4-4 4 4" : "M3 5l4 4 4-4"} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      <div className="panel-body">
        <PresetsSection />
        <FanSection />
        <ObjectsSection />
        <LayersSection />
      </div>
    </aside>
  );
}

export function Legend() {
  const st = useLab((s) => s.stats);
  const speedLayers = useLab((s) => s.layers.streamlines || s.layers.groundHeat);
  // load map: t = 0.15 + (g - 0.5) * 2.4 with g = 0.5 + p / (2 PMAX); Pa with rho = 1.2 kg/m3
  const pa = (t: number) => (((t - 0.15) / 2.4) * 2 * PMAX * 1.2).toFixed(1);
  const view = useLab((s) => s.view);
  if (view === "2d")
    return (
      <div className="legend glass">
        <div className="legend-title">
          <span>In-plane wind speed</span>
          <small>m/s</small>
        </div>
        <div className="bar" style={{ background: "linear-gradient(90deg, #0b1d4a, #2f6fe0, #8fc0ff, #ffffff)" }} />
        <div className="ticks">
          <span>0</span>
          <span>{(VMAX / 2).toFixed(1)}</span>
          <span>{VMAX.toFixed(0)}+</span>
        </div>
        <p className="legend-note">
          <b style={{ color: "#ff6b6b" }}>D</b> drag along the oncoming wind · <b style={{ color: "#3ee08f" }}>S</b> side force across it — pressure integrated over each body.
        </p>
      </div>
    );
  return (
    <div className="legend glass">
      <div className="legend-title">
        <span>Wind load on objects</span>
        <small>surface pressure, Pa</small>
      </div>
      <div className="bar" style={{ background: PALETTE_CSS }} />
      <div className="ticks">
        <span>{pa(0)} suction</span>
        <span>0</span>
        <span>+{pa(1)} impact</span>
      </div>
      {speedLayers && (
        <>
          <div className="legend-title sub">
            <span>Streamlines / ground</span>
            <small>wind speed, m/s</small>
          </div>
          <div className="ticks">
            <span>0</span>
            <span>{(VMAX / 2).toFixed(1)}</span>
            <span>{VMAX.toFixed(0)}+</span>
          </div>
        </>
      )}
      <dl className="stats">
        <div>
          <dt>Render</dt>
          <dd>{st.fps} fps</dd>
        </div>
        <div>
          <dt>Solver</dt>
          <dd>
            {st.simHz} Hz · {st.stepMs.toFixed(1)} ms
          </dd>
        </div>
        <div>
          <dt>Grid</dt>
          <dd>{st.grid || "…"}</dd>
        </div>
        <div>
          <dt>Peak</dt>
          <dd>{st.maxSpeed.toFixed(1)} m/s</dd>
        </div>
      </dl>
    </div>
  );
}
