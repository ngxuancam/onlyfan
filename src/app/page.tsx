import { Lab } from "./Lab";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="app">
      <h1 className="sr-only">{site.title}</h1>
      <p className="sr-only">{site.description}</p>
      <Lab />
      <noscript>
        <p className="boot">This simulator needs JavaScript and WebGL 2.</p>
      </noscript>
    </main>
  );
}
