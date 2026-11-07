"use client";
import { useLab } from "@/lib/store";

/** View switch (3D scene / 2D plan slice), fan swing on/off, and the slice height in 2D. */
export function Toolbar() {
  const view = useLab((s) => s.view);
  const setView = useLab((s) => s.setView);
  const swing = useLab((s) => s.fan.oscillate);
  const setFan = useLab((s) => s.setFan);
  const slice = useLab((s) => s.slice);
  const setSlice = useLab((s) => s.setSlice);
  return (
    <div className="toolbar glass" role="toolbar" aria-label="View">
      <div className="segmented" role="radiogroup" aria-label="View mode">
        {(["3d", "2d"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>
      <button type="button" className={`swing ${swing ? "on" : ""}`} aria-pressed={swing} onClick={() => setFan({ oscillate: !swing })}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M3 10a5.5 5.5 0 0 1 10 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M2 7.5 3 10l2.4-1M14 7.5 13 10l-2.4-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Swing {swing ? "on" : "off"}
      </button>
      {view === "2d" && (
        <label className="slice">
          <span>Slice</span>
          <input
            type="range"
            min={0.3}
            max={3.6}
            step={0.05}
            value={slice}
            style={{ "--pct": `${((slice - 0.3) / 3.3) * 100}%` } as React.CSSProperties}
            onChange={(e) => setSlice(Number(e.target.value))}
          />
          <output>{slice.toFixed(2)} m</output>
        </label>
      )}
    </div>
  );
}
