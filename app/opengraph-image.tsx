import { readFile } from "node:fs/promises";
import { buildDate } from "@/lib/build-date";
import path from "node:path";
import type { CSSProperties, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { JURISDICTIONS, type Jurisdiction } from "@/lib/schemas/common";
import { decodeWoff2, staticArchivo } from "@/lib/og/archivo";
import { site } from "@/lib/site";

// The share image: the cover sheet of the drawing set. Every figure on it is computed
// from the catalog when the image is generated (at build), never typed.

export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Design tokens (app/globals.css).
const C = {
  bg: "#070D18",
  raised: "#0A1322",
  line: "#1C2B43",
  lineStrong: "#2A3E5E",
  lineBold: "#3B5479",
  gridMinor: "rgba(118,156,214,0.045)",
  gridMajor: "rgba(118,156,214,0.085)",
  text: "#E9EFF8",
  muted: "#B4C1D4",
  faint: "#8A9BB5",
  accent: "#86ABDD",
  accentDim: "rgba(134,171,221,0.45)",
  agent: "#52E0A3",
  agentText: "#7CF0BE",
  human: "#F4B652",
  humanText: "#FFC977",
} as const;

const W = size.width;
const H = size.height;
const FRAME_OUT = 18;
const FRAME_IN = 34;
const X0 = 72; // content box
const X1 = W - 72;
const CW = X1 - X0;

const SHORT_JURISDICTION: Record<Jurisdiction, string> = { "us-federal": "Federal", "us-tx": "TX", "us-de": "DE" };

type Mark = "A" | "B" | "H" | "O";
const MARK_FILL: Record<Mark, string> = { A: C.agent, B: "url(#hatch-agent)", H: C.human, O: "url(#hatch-person)" };

const mono = (px: number, color: string = C.faint, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: "Plex Mono",
  fontWeight: 500,
  fontSize: px,
  letterSpacing: px * 0.12,
  textTransform: "uppercase",
  color,
  ...extra,
});

function niceStep(n: number): number {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500]) if (n / s <= 6) return s;
  return 1000;
}

// A dimension: hairline with 45-degree tick ends and a label that breaks the line.
function Dim({ left, width, below = false, children }: { left: number; width: number; below?: boolean; children: ReactNode }) {
  const lineY = below ? 8 : 20;
  const tick: CSSProperties = {
    position: "absolute",
    top: lineY - 6,
    width: 1,
    height: 13,
    background: C.accent,
    transform: "rotate(45deg)",
  };
  return (
    <div style={{ position: "absolute", left, width, top: 0, height: 30, display: "flex", justifyContent: "center" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: lineY, height: 1, background: C.accentDim }} />
      <div style={{ ...tick, left: 0 }} />
      <div style={{ ...tick, right: 0 }} />
      <div
        style={{
          display: "flex",
          position: "relative",
          top: below ? 14 : 12,
          padding: "0 7px",
          background: C.bg,
          fontFamily: "Plex Mono",
          fontSize: 14,
          lineHeight: 1,
          height: 16,
          alignItems: "center",
          color: C.muted,
          whiteSpace: "pre",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Fig({ n, tone, word }: { n: number; tone: string; word?: string }) {
  return (
    <div style={{ display: "flex", whiteSpace: "pre" }}>
      <span style={{ color: tone, fontWeight: 600 }}>{String(n)}</span>
      {word ? <span>{` ${word}`}</span> : null}
    </div>
  );
}

function Cell({ k, v, tone = C.text, grow = false }: { k: string; v: string; tone?: string; grow?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: grow ? 1 : 0,
        padding: "7px 14px 8px",
        borderLeft: `1px solid ${C.lineStrong}`,
      }}
    >
      <div style={mono(10.5)}>{k}</div>
      <div style={{ display: "flex", marginTop: 4, fontFamily: "Plex Mono", fontSize: 15, color: tone, whiteSpace: "pre" }}>{v}</div>
    </div>
  );
}

export default async function Image() {
  const facts = siteFacts(getCorpus());
  const { counts, share } = facts;
  const view = share.syndication;
  const modes = view.modes;
  const runs: Array<{ mark: Mark; n: number; word: string }> = [
    { mark: "A", n: modes.agent, word: "agent" },
    { mark: "B", n: modes["agent-browser"], word: "in a browser" },
    { mark: "H", n: modes["human-online"], word: "person online" },
    { mark: "O", n: modes["human-offline"], word: "offline" },
  ];
  const steps = runs.reduce((s, r) => s + r.n, 0);
  const agentSteps = modes.agent + modes["agent-browser"];
  const personSteps = steps - agentSteps;
  const pitch = steps > 0 ? CW / steps : 0;
  const xAt = (i: number) => i * pitch;
  const bounds = runs.reduce<number[]>((acc, r) => [...acc, (acc[acc.length - 1] ?? 0) + r.n], [0]);
  const scaleStep = niceStep(steps);
  const scale = [...Array.from({ length: Math.floor(steps / scaleStep) + 1 }, (_, i) => i * scaleStep)];
  if (steps - (scale[scale.length - 1] ?? 0) < scaleStep * 0.4) scale.pop();
  scale.push(steps);

  const coverage = JURISDICTIONS.filter((j) => counts.rulesByJurisdiction[j] > 0).map((j) => SHORT_JURISDICTION[j]);
  const others = (["fund", "jv"] as const)
    .map((s) => ({ label: s === "jv" ? "JV" : "Fund", ...share[s] }))
    .filter((s) => s.pct !== null && s.total > 0);
  const computedOn = buildDate();
  const host = site.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const fonts = await loadFonts();

  const BAR_TOP = 408;
  const BAR_H = 56;

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: W, height: H, background: C.bg, fontFamily: "Archivo", color: C.text }}>
        {/* The drafting grid, the frame, and the marks of the elevation. */}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
          <defs>
            <pattern id="minor" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0V24H0" fill="none" stroke={C.gridMinor} strokeWidth="1" />
            </pattern>
            <pattern id="major" width="120" height="120" patternUnits="userSpaceOnUse">
              <path d="M120 0V120H0" fill="none" stroke={C.gridMajor} strokeWidth="1" />
            </pattern>
            <pattern id="hatch-agent" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.7" height="4" fill={C.agent} />
            </pattern>
            <pattern id="hatch-person" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.7" height="4" fill={C.human} />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#minor)" />
          <rect width={W} height={H} fill="url(#major)" />
          <rect x={FRAME_OUT + 0.5} y={FRAME_OUT + 0.5} width={W - 2 * FRAME_OUT - 1} height={H - 2 * FRAME_OUT - 1} fill="none" stroke={C.lineStrong} />
          <rect x={FRAME_IN + 0.5} y={FRAME_IN + 0.5} width={W - 2 * FRAME_IN - 1} height={H - 2 * FRAME_IN - 1} fill="none" stroke={C.lineBold} />
          {Array.from({ length: 5 }, (_, i) => {
            const x = FRAME_IN + ((i + 1) * (W - 2 * FRAME_IN)) / 6;
            return <path key={`zx${i}`} d={`M${x} ${FRAME_OUT}V${FRAME_IN}M${x} ${H - FRAME_IN}V${H - FRAME_OUT}`} stroke={C.lineStrong} />;
          })}
          {Array.from({ length: 2 }, (_, i) => {
            const y = FRAME_IN + ((i + 1) * (H - 2 * FRAME_IN)) / 3;
            return <path key={`zy${i}`} d={`M${FRAME_OUT} ${y}H${FRAME_IN}M${W - FRAME_IN} ${y}H${W - FRAME_OUT}`} stroke={C.lineStrong} />;
          })}
          {/* extension lines at the dimension boundaries */}
          {[0, agentSteps, steps].map((i) => (
            <path key={`ext${i}`} d={`M${X0 + xAt(i)} ${BAR_TOP - 44}V${BAR_TOP + BAR_H + 36}`} stroke={C.accentDim} strokeWidth="1" />
          ))}
          {runs.flatMap((r, ri) =>
            Array.from({ length: r.n }, (_, k) => {
              const i = (bounds[ri] ?? 0) + k;
              return (
                <rect
                  key={`m${i}`}
                  x={X0 + xAt(i) + pitch * 0.12}
                  y={BAR_TOP}
                  width={pitch * 0.76}
                  height={BAR_H}
                  fill={MARK_FILL[r.mark]}
                />
              );
            }),
          )}
        </svg>

        {/* zone numbers in the frame band */}
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={`zn${i}`}
            style={{
              ...mono(10, C.faint, { letterSpacing: 1 }),
              position: "absolute",
              top: FRAME_OUT + 2,
              left: FRAME_IN + (i * (W - 2 * FRAME_IN)) / 6,
              width: (W - 2 * FRAME_IN) / 6,
              height: FRAME_IN - FRAME_OUT - 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {String(i + 1)}
          </div>
        ))}
        {["A", "B", "C"].map((z, i) => (
          <div
            key={`zl${z}`}
            style={{
              ...mono(10, C.faint, { letterSpacing: 0 }),
              position: "absolute",
              left: FRAME_OUT,
              width: FRAME_IN - FRAME_OUT,
              top: FRAME_IN + (i * (H - 2 * FRAME_IN)) / 3 + (H - 2 * FRAME_IN) / 6 - 7,
              display: "flex",
              justifyContent: "center",
            }}
          >
            {z}
          </div>
        ))}

        {/* header: the mark and the wordmark; the address */}
        <div style={{ position: "absolute", left: X0, top: 62, width: CW, display: "flex", alignItems: "center" }}>
          {/* The brand mark of components/ui/wordmark.tsx (D218): five floors as a caret, the cursor slab. */}
          <svg width="30" height="30" viewBox="0 0 22 22">
            {[1, 4, 7, 4, 1].map((x, i) => (
              <rect key={i} x={x} y={1.5 + i * 4} width="8" height="3" fill={C.agent} />
            ))}
            <path d="M13 17.5H19.5L21 19V20.5H13Z" fill={C.human} />
          </svg>
          <div style={{ display: "flex", marginLeft: 13, fontFamily: "Archivo Wide", fontWeight: 600, fontSize: 27, letterSpacing: -0.3 }}>
            <span>{site.wordmark.left}</span>
            <span style={{ fontWeight: 400 }}>{site.wordmark.right}</span>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", ...mono(13, C.accent, { letterSpacing: 13 * 0.06, textTransform: "none" }) }}>
            {host}
          </div>
        </div>

        {/* eyebrow, headline, the measured line */}
        <div style={{ position: "absolute", left: X0, top: 106, display: "flex", ...mono(14, C.agentText, { letterSpacing: 14 * 0.14 }) }}>
          {site.eyebrow}
        </div>
        <div
          style={{
            position: "absolute",
            left: X0 - 4,
            top: 132,
            width: 800,
            display: "flex",
            fontFamily: "Archivo",
            fontWeight: 600,
            fontSize: 76,
            lineHeight: 0.98,
            letterSpacing: -76 * 0.03,
            color: C.text,
          }}
        >
          {site.tagline}
        </div>
        {view.pct !== null ? (
          <div style={{ position: "absolute", left: X0, top: 296, height: 36, display: "flex", alignItems: "center" }}>
            <div style={{ width: 3, height: 36, background: C.agent, marginRight: 16 }} />
            <div style={{ display: "flex", fontFamily: "Archivo", fontWeight: 500, fontSize: 29, color: C.text, whiteSpace: "pre" }}>
              <span>Agents can do </span>
              <span style={{ color: C.agentText, fontWeight: 600 }}>{`${view.pct}%`}</span>
              <span>{` of the ${view.total} written steps.`}</span>
            </div>
          </div>
        ) : null}

        {/* elevation caption */}
        <div style={{ position: "absolute", left: X0, top: BAR_TOP - 56, width: CW, display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", ...mono(12, C.muted) }}>Every written step · syndication view</div>
          <div style={{ display: "flex", ...mono(12, C.faint) }}>
            {others.map((s) => `${s.label} ${s.pct}% of ${s.total}`).join("  ·  ")}
          </div>
        </div>

        {/* dimensions above: agent and person */}
        <div style={{ position: "absolute", left: X0, top: BAR_TOP - 34, width: CW, height: 30, display: "flex" }}>
          <Dim left={0} width={xAt(agentSteps)}>
            <Fig n={agentSteps} tone={C.agentText} word="agent" />
          </Dim>
          <Dim left={xAt(agentSteps)} width={xAt(personSteps)}>
            <Fig n={personSteps} tone={C.humanText} word="person" />
          </Dim>
        </div>

        {/* dimensions below: each way a step is done */}
        <div style={{ position: "absolute", left: X0, top: BAR_TOP + BAR_H + 4, width: CW, height: 30, display: "flex" }}>
          {runs.map((r, i) => {
            const w = xAt(r.n);
            return r.n > 0 ? (
              <Dim key={r.mark} left={xAt(bounds[i] ?? 0)} width={w} below>
                <Fig n={r.n} tone={r.mark === "A" || r.mark === "B" ? C.agentText : C.humanText} word={w > 150 ? r.word : undefined} />
              </Dim>
            ) : null;
          })}
        </div>

        {/* scale bar */}
        <div style={{ position: "absolute", left: X0, top: BAR_TOP + BAR_H + 46, width: CW, height: 14, display: "flex" }}>
          {scale.map((v) => (
            <div
              key={`s${v}`}
              style={{
                position: "absolute",
                left: xAt(v) - 30,
                width: 60,
                display: "flex",
                justifyContent: "center",
                fontFamily: "Plex Mono",
                fontSize: 11,
                color: C.faint,
              }}
            >
              {String(v)}
            </div>
          ))}
        </div>

        {/* the scale note, and the title block seated in the corner of the sheet */}
        <div style={{ position: "absolute", left: X0, bottom: FRAME_IN + 14, display: "flex", ...mono(11, C.faint) }}>
          Scale: 1 mark = 1 step
        </div>
        <div
          style={{
            position: "absolute",
            right: FRAME_IN + 1,
            bottom: FRAME_IN + 1,
            display: "flex",
            borderTop: `1px solid ${C.lineBold}`,
            background: C.raised,
          }}
        >
          <Cell k="Project" v={site.name} />
          <Cell k="Coverage" v={coverage.join(" · ")} />
          <Cell k="Written" v={`${counts.written} of ${counts.playbooks}`} tone={C.agentText} />
          <Cell k="Computed" v={computedOn} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

// ---- fonts ------------------------------------------------------------------------

const FONT_DIR = path.join(process.cwd(), "node_modules", "@fontsource-variable", "archivo", "files");
const MONO_DIR = path.join(process.cwd(), "node_modules", "@fontsource", "ibm-plex-mono", "files");

type FontOption = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" };
let loaded: Promise<FontOption[]> | null = null;

function loadFonts(): Promise<FontOption[]> {
  loaded ??= (async () => {
    const archivo = decodeWoff2(await readFile(path.join(FONT_DIR, "archivo-latin-wdth-normal.woff2")));
    const plex = (w: number) => readFile(path.join(MONO_DIR, `ibm-plex-mono-latin-${w}-normal.woff`));
    const asBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    return [
      // Display: Archivo 600 at width 110, as the headline is set on the site.
      { name: "Archivo", data: staticArchivo(archivo, { wght: 600, wdth: 110 }), weight: 600, style: "normal" },
      { name: "Archivo", data: staticArchivo(archivo, { wght: 500, wdth: 100 }), weight: 500, style: "normal" },
      // The wordmark: Archivo 620 at width 118.
      { name: "Archivo Wide", data: staticArchivo(archivo, { wght: 620, wdth: 118 }), weight: 600, style: "normal" },
      { name: "Plex Mono", data: asBuffer(await plex(400)), weight: 400, style: "normal" },
      { name: "Plex Mono", data: asBuffer(await plex(500)), weight: 500, style: "normal" },
      { name: "Plex Mono", data: asBuffer(await plex(600)), weight: 600, style: "normal" },
    ];
  })();
  return loaded;
}
