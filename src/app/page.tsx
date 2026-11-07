import { Lab } from "./Lab";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="app">
      <Lab />
      <header className="brand">
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeOpacity=".35" />
          {[0, 120, 240].map((a) => (
            <path key={a} d="M16 16c-1.5-4.5-.8-9.5 2.2-11.6 2.6 1.9 2.4 7.1-2.2 11.6z" fill="#ff6a1a" transform={`rotate(${a} 16 16)`} />
          ))}
          <circle cx="16" cy="16" r="2.2" fill="#0b0c10" stroke="#ff6a1a" strokeWidth="1.2" />
        </svg>
        <div>
          <h1>
            OnlyFan <span>wind lab</span>
          </h1>
          <p>{site.tagline}</p>
        </div>
      </header>
      <footer className="foot">
        <span className="kbd-hint">Drag objects to move them · drag empty space to orbit · scroll to zoom</span>
        <span>
          Stable-fluids solver, {""}
          <a href={site.repo} target="_blank" rel="noreferrer">
            source
          </a>{" "}
          · by{" "}
          <a href={site.author.url} target="_blank" rel="noreferrer">
            Nguyen Xuan Cam
          </a>
        </span>
      </footer>
      <noscript>
        <p className="boot">This simulator needs JavaScript and WebGL 2.</p>
      </noscript>
    </main>
  );
}
