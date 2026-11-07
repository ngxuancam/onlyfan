import { ImageResponse } from "next/og";
import { site } from "@/lib/site";
import { STOPS } from "@/lib/palette";

export const alt = site.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const rgb = (t: number) => {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [p0, a] = STOPS[i - 1];
      const [p1, b] = STOPS[i];
      const f = (t - p0) / (p1 - p0);
      return `rgb(${a.map((v, k) => Math.round((v + (b[k] - v) * f) * 255)).join(",")})`;
    }
  }
  return "rgb(235,15,20)";
};

/** Streamlines bending around a body: a potential-flow-ish sketch, drawn as SVG. */
function lines() {
  const out: { d: string; c: string }[] = [];
  for (let i = 0; i < 26; i++) {
    const y0 = 120 + i * 17;
    const off = y0 - 345;
    let d = `M 0 ${y0}`;
    for (let x = 0; x <= 1200; x += 20) {
      const dx = (x - 860) / 150;
      const bump = (90 * Math.sign(off || 1) * Math.exp(-dx * dx)) / (1 + Math.abs(off) / 60);
      const wave = Math.sin(x / 70 + i) * (x > 900 ? 6 : 1.5);
      d += ` L ${x} ${(y0 + bump + wave).toFixed(1)}`;
    }
    const t = 1 - Math.min(1, Math.abs(off) / 230);
    out.push({ d, c: rgb(0.15 + 0.8 * t) });
  }
  return out;
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#05060a", color: "#e8ecf2", fontFamily: "sans-serif" }}>
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          {lines().map((l, i) => (
            <path key={i} d={l.d} stroke={l.c} strokeWidth="2.4" fill="none" strokeOpacity="0.85" />
          ))}
          <ellipse cx="860" cy="345" rx="120" ry="46" fill="#05060a" stroke="#ff6a1a" strokeOpacity="0.6" strokeWidth="2" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: "100%", height: "100%" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, color: "#ff6a1a" }}>REAL-TIME 3D WIND LAB</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640, padding: 28, background: "rgba(5,6,10,0.78)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>OnlyFan</div>
            <div style={{ fontSize: 32, color: "#aab3c0", lineHeight: 1.3 }}>{site.tagline}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#7d8796" }}>
            <span>{site.url.host}</span>
            <span>stable fluids · streamlines · pressure maps</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
