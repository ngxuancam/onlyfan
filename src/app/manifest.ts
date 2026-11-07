import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.title,
    short_name: site.name,
    description: site.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#05060a",
    theme_color: "#05060a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
