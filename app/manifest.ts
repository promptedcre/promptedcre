import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

// Paper's ground color from the design tokens (--bg in app/globals.css), the theme every visitor
// starts on (D218). A manifest cannot read a CSS variable, so it is written out here and in
// app/layout.tsx (themeColor); __tests__/tokens.test.ts fails if either drifts from the token.
const GROUND = "#f3f6fa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    display: "standalone",
    background_color: GROUND,
    theme_color: GROUND,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/favicon.ico", sizes: "32x32 48x48", type: "image/x-icon" },
    ],
  };
}
