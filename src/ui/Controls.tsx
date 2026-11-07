"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { field } from "@/sim/field";
import { useLab } from "@/lib/store";
import { PALETTE_CSS } from "@/lib/palette";
import { PMAX, VMAX } from "@/sim/config";

/* --------------------------------------------------------------- atoms */

export function Slider({
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
    <label className={`field slider ${disabled ? "is-disabled" : ""}`}>
      <span className="field-label">{label}</span>
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
      <output>
        {format ? format(value) : value}
        {unit && <small>{unit}</small>}
      </output>
    </label>
  );
}

/** Yes / No pill pair, as in a 3D editor's inspector. */
export function YesNo({ label, value, onChange, yes = "Yes", no = "No" }: { label: string; value: boolean; onChange: (v: boolean) => void; yes?: string; no?: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="pills" role="radiogroup" aria-label={label}>
        <button type="button" role="radio" aria-checked={value} className={value ? "on" : ""} onClick={() => onChange(true)}>
          {yes}
        </button>
        <button type="button" role="radio" aria-checked={!value} className={!value ? "on" : ""} onClick={() => onChange(false)}>
          {no}
        </button>
      </div>
    </div>
  );
}

export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="pills" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Group({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="group">
      <header>
        <h3>{title}</h3>
        {aside}
      </header>
      <div className="group-body">{children}</div>
    </section>
  );
}

/**
 * Blowing direction, live: the thumb follows the oscillating head; the shaded band is the
 * sweep range. Dragging sets the centre of the sweep (the fan's base direction).
 */
export function DirectionSlider() {
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
  const band = `linear-gradient(90deg, rgba(255,255,255,.1) ${pct(fan.yaw - half)}%, rgba(47,128,255,.55) ${pct(fan.yaw - half)}%, rgba(47,128,255,.55) ${pct(fan.yaw + half)}%, rgba(255,255,255,.1) ${pct(fan.yaw + half)}%)`;
  return (
    <label className="field slider">
      <span className="field-label">
        Direction {fan.oscillate && fan.speed > 0 && <em className="live">live</em>}
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
      <output>
        {wrap(shown)}
        <small>°</small>
      </output>
    </label>
  );
}

/* -------------------------------------------------------------- legend */

export function Legend() {
  const speedLayers = useLab((s) => s.layers.streamlines || s.layers.groundHeat);
  const view = useLab((s) => s.view);
  // load map: t = 0.15 + (g - 0.5) * 2.4 with g = 0.5 + p / (2 PMAX); Pa with rho = 1.2 kg/m3
  const pa = (t: number) => (((t - 0.15) / 2.4) * 2 * PMAX * 1.2).toFixed(1);
  if (view === "2d")
    return (
      <div className="legend">
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
          <b style={{ color: "#ff6b6b" }}>D</b> drag along the oncoming wind · <b style={{ color: "#3ee08f" }}>S</b> side force across it.
        </p>
      </div>
    );
  return (
    <div className="legend">
      <div className="legend-title">
        <span>Wind load on objects</span>
        <small>Pa</small>
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
            <small>m/s</small>
          </div>
          <div className="ticks">
            <span>0</span>
            <span>{(VMAX / 2).toFixed(1)}</span>
            <span>{VMAX.toFixed(0)}+</span>
          </div>
        </>
      )}
    </div>
  );
}
