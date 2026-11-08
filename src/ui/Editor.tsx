"use client";
import { useState, type ReactNode } from "react";
import { OBJ_LABEL, PRESETS, useLab, type ObjKey, type PresetId, type Selectable } from "@/lib/store";
import { FAN_MAX_SPEED } from "@/sim/config";
import { site } from "@/lib/site";
import { Choice, DirectionSlider, Group, Legend, Slider, YesNo } from "./Controls";

/* --------------------------------------------------------------- icons */

const I = {
  fan: "M12 12c-1-3-.5-6.5 1.5-8 2 1.3 1.7 5-1.5 8zm0 0c3-1 6.5-.5 8 1.5-1.3 2-5 1.7-8-1.5zm0 0c1 3 .5 6.5-1.5 8-2-1.3-1.7-5 1.5-8zm0 0c-3 1-6.5.5-8-1.5 1.3-2 5-1.7 8 1.5z",
  blower: "M3 7h4v10H3zM7 5h11a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  exhaust: "M4 4h16v16H4zM12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 7v10M7 12h10",
  smoker: "M4 14h11v5H4zM15 15.5h3M18 13c1.5-1 1.5-3 0-4M20 15c2-2 2-5 0-7M7 14v-3h5v3",
  car: "M3 15l2-5a3 3 0 0 1 2.8-2h8.4A3 3 0 0 1 19 10l2 5v3H3zM7 18m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M17 18m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  house: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  tree: "M12 21v-6M12 15c-4 0-6-2.5-6-5.5S8.5 3 12 3s6 3 6 6.5S16 15 12 15z",
  shrub: "M3 19h18M5 19c-1-3 1-6 4-6 1-2 5-2 6 0 3 0 5 3 4 6",
  rig: "M5 3v18M19 3v18M5 5h14M8 5v6M11 5v8M14 5v5M17 5v7",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0",
  eyeOff: "M3 3l18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.6M6.4 7.4A17 17 0 0 0 2 12s3.5 6 10 6a10 10 0 0 0 4.3-1",
  cursor: "M5 3l14 8-6 1.5L10 19z",
  play: "M7 5l12 7-12 7z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
  reset: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  swing: "M4 15a8 8 0 0 1 16 0M2.5 11.5 4 15l3.3-1.4M21.5 11.5 20 15l-3.3-1.4",
  sun: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  hall: "M3 21V8l9-5 9 5v13M7 21v-8h10v8M3 11h18",
  github: "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2z",
};

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICON: Record<Selectable, string> = {
  fan: I.fan,
  blower: I.blower,
  exhaust: I.exhaust,
  smoker: I.smoker,
  car: I.car,
  house: I.house,
  tree: I.tree,
  shrub: I.shrub,
  rig: I.rig,
};

const SOURCES: Selectable[] = ["fan", "blower", "exhaust", "smoker"];
const BODIES: ObjKey[] = ["car", "house", "tree", "shrub", "rig"];

/* ------------------------------------------------------------ outliner */

function Row({ k }: { k: Selectable }) {
  const enabled = useLab((s) => (k === "fan" ? s.fan.enabled : s.objects[k].enabled));
  const selected = useLab((s) => s.selected === k);
  const select = useLab((s) => s.select);
  const setObj = useLab((s) => s.setObj);
  const setFan = useLab((s) => s.setFan);
  const toggle = () => {
    if (k === "fan") setFan({ enabled: !enabled });
    else setObj(k, { enabled: !enabled });
    if (!enabled) select(k);
  };
  return (
    <li className={`row ${selected ? "sel" : ""} ${enabled ? "" : "off"}`}>
      <button type="button" className="row-main" onClick={() => (enabled ? select(selected ? null : k) : toggle())}>
        <Icon d={ICON[k]} />
        <span>{OBJ_LABEL[k]}</span>
      </button>
      <button type="button" className="row-eye" aria-label={`${enabled ? "Hide" : "Show"} ${OBJ_LABEL[k]}`} aria-pressed={enabled} onClick={toggle}>
        <Icon d={enabled ? I.eye : I.eyeOff} size={14} />
      </button>
    </li>
  );
}

export function Outliner() {
  const [open, setOpen] = useState(true);
  return (
    <aside className={`dock dock-left ${open ? "" : "toggled"}`} aria-label="Scene outliner">
      <header className="dock-head">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
          {[0, 120, 240].map((a) => (
            <path key={a} d="M16 16c-1.5-4.5-.8-9.5 2.2-11.6 2.6 1.9 2.4 7.1-2.2 11.6z" fill="#ff6a1a" transform={`rotate(${a} 16 16)`} />
          ))}
          <circle cx="16" cy="16" r="2.2" fill="#16181c" stroke="#ff6a1a" strokeWidth="1.2" />
        </svg>
        <div className="brand-text">
          <h1>OnlyFan Studio</h1>
          <p>Wind lab · Scene 01</p>
        </div>
        <button type="button" className="icon-btn dock-collapse" aria-expanded={open} aria-label="Toggle outliner" onClick={() => setOpen(!open)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d={open ? "M9 3L5 7l4 4" : "M5 3l4 4-4 4"} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="dock-body">
        <p className="dock-label">Wind sources</p>
        <ul className="rows">
          {SOURCES.map((k) => (
            <Row key={k} k={k} />
          ))}
        </ul>
        <p className="dock-label">Bodies</p>
        <ul className="rows">
          {BODIES.map((k) => (
            <Row key={k} k={k} />
          ))}
        </ul>
        <p className="dock-hint">Eye toggles a source or body. Select it to edit in the inspector, drag it in the viewport to move it.</p>
      </div>
      <footer className="dock-foot">
        <a href={site.repo} target="_blank" rel="noreferrer">
          <Icon d={I.github} size={14} /> Source on GitHub
        </a>
        <a href={site.author.url} target="_blank" rel="noreferrer">
          by Nguyen Xuan Cam
        </a>
      </footer>
    </aside>
  );
}

/* ----------------------------------------------------------- inspector */

function Position({ k }: { k: Selectable }) {
  const o = useLab((s) => (k === "fan" ? s.fan : s.objects[k]));
  return (
    <div className="field">
      <span className="field-label">Position</span>
      <div className="xyz">
        <span>
          <b>X</b>
          {o.x.toFixed(2)}
        </span>
        <span>
          <b>Z</b>
          {o.z.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function Rotation({ k }: { k: ObjKey }) {
  const yaw = useLab((s) => s.objects[k].yaw);
  const setObj = useLab((s) => s.setObj);
  return <Slider label="Rotation" value={yaw} min={-180} max={180} unit="°" onChange={(v) => setObj(k, { yaw: v })} />;
}

const SPEED_STEPS: [number, string][] = [
  [0, "Off"],
  [0.45, "1"],
  [0.7, "2"],
  [1, "3"],
];

function FanInspector() {
  const fan = useLab((s) => s.fan);
  const setFan = useLab((s) => s.setFan);
  const rake = useLab((s) => s.layers.smoke);
  const setLayers = useLab((s) => s.setLayers);
  return (
    <>
      <Group title="Motor" aside={<span className="mono">{(fan.speed * FAN_MAX_SPEED).toFixed(1)} m/s</span>}>
        <div className="field">
          <span className="field-label">Speed</span>
          <div className="pills" role="radiogroup" aria-label="Fan speed preset">
            {SPEED_STEPS.map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={Math.abs(fan.speed - v) < 0.02} className={Math.abs(fan.speed - v) < 0.02 ? "on" : ""} onClick={() => setFan({ speed: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <Slider label="Power" value={Math.round(fan.speed * 100)} min={0} max={100} unit="%" onChange={(v) => setFan({ speed: v / 100 })} />
      </Group>
      <Group title="Swing">
        <YesNo label="Oscillate" value={fan.oscillate} onChange={(v) => setFan({ oscillate: v })} />
        <Slider label="Sweep" value={fan.sweep} min={10} max={120} unit="°" onChange={(v) => setFan({ sweep: v })} disabled={!fan.oscillate} />
        <DirectionSlider />
      </Group>
      <Group title="Head">
        <Slider label="Tilt" value={fan.tilt} min={-20} max={30} unit="°" onChange={(v) => setFan({ tilt: v })} />
        <Slider label="Height" value={fan.height} min={1.2} max={2.6} step={0.05} unit=" m" format={(v) => v.toFixed(2)} onChange={(v) => setFan({ height: v })} />
        <YesNo label="Smoke rake" value={rake} onChange={(v) => setLayers({ smoke: v })} />
      </Group>
    </>
  );
}

function SourceInspector({ k }: { k: Selectable }) {
  const p = useLab((s) => s.params);
  const setParams = useLab((s) => s.setParams);
  const suction = useLab((s) => s.fan.suction);
  const setFan = useLab((s) => s.setFan);
  const xray = useLab((s) => s.layers.xray);
  const setLayers = useLab((s) => s.setLayers);
  switch (k) {
    case "fan":
      return <FanInspector />;
    case "blower":
      return (
        <Group title="Motor" aside={<span className="mono">{(p.blowerPower * 11).toFixed(1)} m/s</span>}>
          <Slider label="Power" value={Math.round(p.blowerPower * 100)} min={0} max={100} unit="%" onChange={(v) => setParams({ blowerPower: v / 100 })} />
          <Slider label="Tilt" value={p.blowerTilt} min={-15} max={30} unit="°" onChange={(v) => setParams({ blowerTilt: v })} />
          <Rotation k="blower" />
        </Group>
      );
    case "exhaust":
      return (
        <Group title="Extractor">
          <Slider label="Suction" value={Math.round(suction * 100)} min={0} max={100} unit="%" onChange={(v) => setFan({ suction: v / 100 })} />
          <Rotation k="exhaust" />
        </Group>
      );
    case "smoker":
      return (
        <Group title="Fog output">
          <Slider label="Output" value={Math.round(p.smokeOutput * 100)} min={0} max={100} unit="%" onChange={(v) => setParams({ smokeOutput: v / 100 })} />
          <Slider label="Nozzle jet" value={Math.round(p.smokeJet * 100)} min={0} max={100} unit="%" onChange={(v) => setParams({ smokeJet: v / 100 })} />
          <Slider label="Height" value={p.smokeHeight} min={0.3} max={2.2} step={0.05} unit=" m" format={(v) => v.toFixed(2)} onChange={(v) => setParams({ smokeHeight: v })} />
          <Rotation k="smoker" />
        </Group>
      );
    case "tree":
      return (
        <Group title="Foliage">
          <YesNo label="Drop leaves" value={p.leaves} onChange={(v) => setParams({ leaves: v })} />
          <Slider label="Leaves / s" value={p.leafRate} min={1} max={30} onChange={(v) => setParams({ leafRate: v })} disabled={!p.leaves} />
          <Rotation k="tree" />
        </Group>
      );
    case "house":
      return (
        <Group title="Building">
          <YesNo label="X-ray" value={xray} onChange={(v) => setLayers({ xray: v })} />
          <Rotation k="house" />
        </Group>
      );
    default:
      return (
        <Group title="Body">
          <Rotation k={k as ObjKey} />
        </Group>
      );
  }
}

function SceneInspector() {
  const apply = useLab((s) => s.applyPreset);
  const [active, setActive] = useState<PresetId>("playground");
  const theme = useLab((s) => s.theme);
  const setTheme = useLab((s) => s.setTheme);
  const camera = useLab((s) => s.camera);
  const setCamera = useLab((s) => s.setCamera);
  const perf = useLab((s) => s.perf);
  const setPerf = useLab((s) => s.setPerf);
  const layers = useLab((s) => s.layers);
  const set = useLab((s) => s.setLayers);
  const st = useLab((s) => s.stats);
  return (
    <>
      <Group title="Scenario">
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
        <p className="note">{PRESETS[active].hint}</p>
      </Group>
      <Group title="Environment">
        <Choice
          label="Stage"
          value={theme}
          options={[
            ["studio", "Studio"],
            ["hall", "Test hall"],
          ]}
          onChange={setTheme}
        />
        <Choice
          label="Quality"
          value={perf}
          options={[
            ["high", "High"],
            ["balanced", "Balanced"],
            ["low", "Low"],
          ]}
          onChange={(p) => setPerf(p, true)}
        />
        <Choice
          label="Camera"
          value={camera}
          options={[
            ["perspective", "Persp."],
            ["orthographic", "Ortho"],
          ]}
          onChange={setCamera}
        />
      </Group>
      <Group title="Visualisation">
        <YesNo label="Wind load" value={layers.surfaceHeat} onChange={(v) => set({ surfaceHeat: v })} />
        <YesNo label="Smoke rake" value={layers.smoke} onChange={(v) => set({ smoke: v })} />
        <YesNo label="Streamlines" value={layers.streamlines} onChange={(v) => set({ streamlines: v })} />
        <YesNo label="Ground map" value={layers.groundHeat} onChange={(v) => set({ groundHeat: v })} />
        <YesNo label="X-ray" value={layers.xray} onChange={(v) => set({ xray: v })} />
      </Group>
      <Group title="Solver">
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
      </Group>
    </>
  );
}

export function Inspector() {
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  const setObj = useLab((s) => s.setObj);
  const setFan = useLab((s) => s.setFan);
  const [open, setOpen] = useState(true);
  return (
    <aside className={`dock dock-right ${open ? "" : "toggled"}`} aria-label="Inspector">
      <header className="dock-head">
        {selected ? (
          <>
            <span className="insp-icon">
              <Icon d={ICON[selected]} />
            </span>
            <div className="brand-text">
              <h2>{OBJ_LABEL[selected]}</h2>
              <p>{SOURCES.includes(selected) ? "Wind source" : "Body"}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => select(null)} aria-label="Back to scene settings">
              ✕
            </button>
          </>
        ) : (
          <>
            <div className="brand-text">
              <h2>Scene</h2>
              <p>Nothing selected</p>
            </div>
          </>
        )}
        <button type="button" className="icon-btn dock-collapse" aria-expanded={open} aria-label="Toggle inspector" onClick={() => setOpen(!open)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d={open ? "M5 3l4 4-4 4" : "M9 3L5 7l4 4"} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="dock-body">
        {selected ? (
          <>
            <Group title="Transform">
              <Position k={selected} />
            </Group>
            <SourceInspector k={selected} />
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (selected === "fan") setFan({ enabled: false });
                else setObj(selected, { enabled: false });
                select(null);
              }}
            >
              Hide from scene
            </button>
          </>
        ) : (
          <SceneInspector />
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- toolbar */

function Tool({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`tool ${active ? "on" : ""}`} aria-label={label} title={label} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function Toolbar() {
  const view = useLab((s) => s.view);
  const setView = useLab((s) => s.setView);
  const swing = useLab((s) => s.fan.oscillate);
  const setFan = useLab((s) => s.setFan);
  const paused = useLab((s) => s.paused);
  const setPaused = useLab((s) => s.setPaused);
  const reset = useLab((s) => s.resetFlow);
  const theme = useLab((s) => s.theme);
  const setTheme = useLab((s) => s.setTheme);
  const slice = useLab((s) => s.slice);
  const setSlice = useLab((s) => s.setSlice);
  const select = useLab((s) => s.select);
  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      <Tool label="Select" active onClick={() => select(null)}>
        <Icon d={I.cursor} />
      </Tool>
      <span className="sep" />
      <div className="seg" role="radiogroup" aria-label="View mode">
        {(["3d", "2d"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>
      <span className="sep" />
      <Tool label={swing ? "Swing on" : "Swing off"} active={swing} onClick={() => setFan({ oscillate: !swing })}>
        <Icon d={I.swing} />
      </Tool>
      <Tool label={paused ? "Run solver" : "Pause solver"} active={paused} onClick={() => setPaused(!paused)}>
        <Icon d={paused ? I.play : I.pause} />
      </Tool>
      <Tool label="Reset the air (still air)" onClick={reset}>
        <Icon d={I.reset} />
      </Tool>
      <Tool label={theme === "studio" ? "Switch to test hall" : "Switch to studio"} onClick={() => setTheme(theme === "studio" ? "hall" : "studio")}>
        <Icon d={theme === "studio" ? I.hall : I.sun} />
      </Tool>
      {view === "2d" && (
        <>
          <span className="sep" />
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
        </>
      )}
      <span className="sep" />
      <span className="tool-status">
        <i className={paused ? "" : "on"} />
        {paused ? "Paused" : "Live"}
      </span>
    </div>
  );
}

/** Bottom-centre camera switch under the axis gizmo. */
export function ViewBar() {
  const camera = useLab((s) => s.camera);
  const setCamera = useLab((s) => s.setCamera);
  const view = useLab((s) => s.view);
  if (view === "2d") return null;
  return (
    <div className="viewbar" role="radiogroup" aria-label="Projection">
      {(
        [
          ["orthographic", "Orthographic"],
          ["perspective", "Perspective"],
        ] as const
      ).map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={camera === v} className={camera === v ? "on" : ""} onClick={() => setCamera(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function LegendDock() {
  return (
    <div className="legend-dock">
      <Legend />
    </div>
  );
}
