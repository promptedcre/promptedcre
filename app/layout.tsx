import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PageMotion } from "@/components/motion/page-motion";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PrintFolds } from "@/components/ui/print-folds";
import { StatusLine } from "@/components/ui/status-line";
import { buildDate } from "@/lib/build-date";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { site } from "@/lib/site";

// Type. Archivo Variable (weight and width axes) for every word, IBM Plex Mono 400 and 500 for
// prompts, commands, paths, ids and measured figures: no 600, and no third family.
//
// Archivo is the fontsource package's own files, declared through next/font so the Latin file
// (it draws the headline, the largest text on any page) is preloaded and the other two subsets
// are fetched only by a page that uses their characters. All three share one family name,
// which --font-sans in globals.css names; the metric-matched "Archivo Fallback" faces there
// hold every line break until the file arrives, so the swap does not re-wrap the headline.
// (next/font needs each call written out as literals; the calls differ only in file and range.)
const archivoVietnamese = localFont({
  src: "../node_modules/@fontsource-variable/archivo/files/archivo-vietnamese-wdth-normal.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Archivo Variable'" },
    { prop: "font-stretch", value: "62% 125%" },
    {
      prop: "unicode-range",
      value: "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
    },
  ],
});
const archivoLatinExt = localFont({
  src: "../node_modules/@fontsource-variable/archivo/files/archivo-latin-ext-wdth-normal.woff2",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Archivo Variable'" },
    { prop: "font-stretch", value: "62% 125%" },
    {
      prop: "unicode-range",
      value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});
const archivoLatin = localFont({
  src: "../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Archivo Variable'" },
    { prop: "font-stretch", value: "62% 125%" },
    {
      prop: "unicode-range",
      value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
});
// The faces are used through their shared family name, not through these handles.
void [archivoVietnamese, archivoLatinExt, archivoLatin];

export const metadata: Metadata = {
  // Share links resolve against the public address, not the host that built the page.
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  // The share image comes from app/opengraph-image.tsx; Next fills it in for both.
  openGraph: { type: "website", siteName: site.name, title: site.name, description: site.description, url: site.url },
  twitter: { card: "summary_large_image", title: site.name, description: site.description },
};

// The ground of each theme: --bg of Night and of Paper in app/globals.css. The browser reads a
// theme color before any CSS, so both are written out here; __tests__/tokens.test.ts fails if
// either drifts from its token.
// design-lint-disable-next-line color-literal -- the browser reads these before any CSS: each theme's --bg, written out
const GROUND = { night: "#0b131f", paper: "#f3f6fa" } as const;

export const viewport: Viewport = {
  // The browser's own surfaces take Paper's ground, as the page does for every visitor (D218).
  // A visitor who chose Night: components/ui/theme-toggle.tsx adds that theme's ground first.
  themeColor: GROUND.paper,
  colorScheme: "light dark",
};

// Runs before the first paint. It tells CSS and the motion code what the server cannot know:
// scripts are on (class "js" on <html>); how much motion the reader asked for (<html
// data-motion="full"> or "reduced", kept in step if the setting changes); and the theme the
// visitor chose, if they chose one (<html data-theme="paper"> or "night", from localStorage
// "pcre-theme"), so the page is never painted in the other one first. With scripts off none of
// the three is present: every page is its finished, still self, in the system's theme. If the
// page's own motion (components/motion/page-motion.tsx) has not started 2.5 s on, it sets
// data-reveal-off, so a reveal never leaves anything hidden (D224).
const BOOT = `(function(){var d=document.documentElement,q=window.matchMedia("(prefers-reduced-motion: reduce)");function m(){d.setAttribute("data-motion",q.matches?"reduced":"full")}d.classList.add("js");m();if(q.addEventListener)q.addEventListener("change",m);try{var t=localStorage.getItem("pcre-theme");if(t==="paper"||t==="night")d.setAttribute("data-theme",t)}catch(e){}setTimeout(function(){if(!d.hasAttribute("data-reveal-ready"))d.setAttribute("data-reveal-off","")},2500)})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The status line's counts come from the catalog; the date is when they were computed (the build).
  const corpus = getCorpus();
  const facts = siteFacts(corpus);
  const computedOn = buildDate();
  // Situations and audits are read at /playbooks/<slug>; the header marks their own section.
  const sectionOf: Record<string, string> = {};
  for (const pb of corpus.playbooks) {
    if (pb.kind === "situation") sectionOf[`/playbooks/${pb.slug}`] = "/situations";
    else if (pb.kind === "audit") sectionOf[`/playbooks/${pb.slug}`] = "/audit";
  }
  return (
    // The boot script adds a class and up to two attributes to <html> before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="btn btn--primary sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
          Skip to content
        </a>
        <SiteHeader sectionOf={sectionOf} />
        <main id="main" className="w-full flex-1 pb-6">
          {children}
        </main>
        <StatusLine facts={facts} computedOn={computedOn} className="mt-16 mb-0" />
        <SiteFooter />
        <PrintFolds />
        <PageMotion />
        {/* Page views (answer 18, CH08): Vercel's Web Analytics, which sets no cookies. Only a
            build on Vercel draws it, so a local build loads no script it cannot serve. */}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
