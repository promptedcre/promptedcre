import fs from "node:fs";
import { buildDate } from "@/lib/build-date";
import path from "node:path";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { ReviewChip, Tag } from "@/components/chips";
import { PromptWell } from "@/components/connect/prompt-card";
import { StructureSwitch } from "@/components/structure-switch";
import { VariantSwitch } from "@/components/variant-switch";
import {
  ApprovalCells,
  Band,
  Button,
  ButtonLink,
  Callout,
  Container,
  CountsLine,
  DimensionLine,
  Disclosure,
  Elevation,
  GateGlyph,
  Heading,
  ICON_NAMES,
  Icon,
  LaneTag,
  Lede,
  Logo,
  MARK_ORDER,
  Marks,
  Outcome,
  PageHead,
  Monogram,
  PropertyLine,
  RefusedBadge,
  RevisionCloud,
  RoleMark,
  Sheet,
  SheetHeader,
  Stamp,
  TermLine,
  Terminal,
  TextLink,
  ThemeToggle,
  TitleBlock,
  TitleCell,
  stepGates,
  type MarkGroup,
} from "@/components/ui";
import { MARK_OF, siteFacts, type StepMark } from "@/lib/compute/site-facts";
import { applicableSteps, DEFAULT_VARIANT } from "@/lib/compute/variant";
import { getCorpus, getPlaybook } from "@/lib/content/load";
import { getDemoRun } from "@/lib/demo/load";
import { HOSTS, statusLine } from "@/lib/hosts";
import { PHASE_LABEL, STRUCTURE_LABEL } from "@/lib/labels";
import { REVIEW_LEVELS, STRUCTURES } from "@/lib/schemas/common";
import { PHASES, STEP_MODES } from "@/lib/schemas/playbook";
import { doors, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Styleguide",
  description: "The drawing-set system: tokens, type roles and every shared component, with real content.",
  robots: { index: false },
};

// ---------- tokens, read from globals.css so this page cannot drift from it ----------

// A token as globals.css declares it: its value, the OKLCH it was computed from, and its role
// (both read from the comment beside it).
type Token = { name: string; value: string; source: string | null; role: string };

// The two themes, in the order the stylesheet declares them: Night is the first :root block,
// Paper the `@utility theme-paper` block.
const THEMES = [
  { id: "night", label: "Night", block: /:root\s*{([\s\S]*?)}/ },
  { id: "paper", label: "Paper", block: /@utility theme-paper\s*{([\s\S]*?)}/ },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

function readTokens(): Record<ThemeId, Map<string, Token>> {
  const css = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  const parse = (block: string) =>
    new Map(
      [...block.matchAll(/--([\w-]+):\s*([^;]+);[ \t]*(?:\/\*\s*(.*?)\s*\*\/)?/g)].map((m) => {
        const note = m[3] ?? "";
        const source = /^oklch\([^)]*\)/.exec(note)?.[0] ?? null;
        const token: Token = { name: m[1] ?? "", value: (m[2] ?? "").trim(), source, role: source ? note.slice(source.length).trim() : note };
        return [token.name, token] as const;
      }),
    );
  const read = (id: ThemeId) => parse(css.match(THEMES.find((t) => t.id === id)!.block)?.[1] ?? "");
  return { night: read("night"), paper: read("paper") };
}

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): string {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi! + 0.05) / (lo! + 0.05)).toFixed(1);
}
const isHex = (v: string | undefined): v is string => /^#[0-9a-f]{6}$/i.test(v ?? "");

// The palette by role, the same names in both themes. `on` names the surface a token's
// contrast is quoted against, in its own theme: a sheet's paper for inks, lines and marks.
const PALETTE: Array<{ label: string; names: string[]; on?: string }> = [
  { label: "Surfaces", names: ["bg", "bg-raised", "bg-inset", "bg-panel", "bg-tile"] },
  { label: "Lines", names: ["line", "line-strong", "line-bold", "grid-minor", "grid-major", "dim-line", "dim-ext"], on: "bg-raised" },
  { label: "Ink", names: ["text", "text-muted", "text-faint"], on: "bg-raised" },
  { label: "Drafting blue", names: ["accent", "accent-strong"], on: "bg-raised" },
  { label: "An agent", names: ["agent", "agent-text", "agent-mid", "agent-deep"], on: "bg-raised" },
  { label: "A person", names: ["human", "human-text", "human-mid", "human-deep"], on: "bg-raised" },
  { label: "Status", names: ["danger", "warn"], on: "bg-raised" },
  { label: "Controls", names: ["accent-ink", "human-ink", "fill-hover", "selection", "scrim", "shadow"] },
];
// One row of the palette: the token's name, then a cell for each theme.
const PALETTE_ROW = "grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)]";
// The monograms design.md names for the four hosts (our own tiles, not logos).
const MONOGRAM: Record<string, string> = { "claude-code": "CC", claude: "Cl", chatgpt: "GP", codex: "Cx" };

// ---------- small page-local pieces ----------

// A specimen: the call that draws it, then the thing itself. Ruled off, never boxed, so a
// component that has its own frame is not drawn inside another one.
function Specimen({
  name,
  note,
  children,
  className,
  surface,
}: {
  name: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  surface?: "raised";
}) {
  return (
    <div className="min-w-0 border-t border-line-strong pt-3">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <code className="type-data text-accent-strong">{name}</code>
        {note && <span className="type-note text-faint">{note}</span>}
      </div>
      <div
        className={`${surface === "raised" ? "bg-raised p-4 sm:p-6" : ""} ${className ?? ""}`}
        style={surface === "raised" ? ({ "--dim-surface": "var(--bg-raised)" } as CSSProperties) : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// A row of the foundations: what it is on the left, the thing itself on the right.
function Row({ name, spec, children }: { name: ReactNode; spec?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-8 gap-y-2 border-b border-line py-4 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="type-data m-0 text-text">{name}</p>
        {spec && <p className="type-note m-0 mt-1 text-faint">{spec}</p>}
      </div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

const SECTIONS = [
  ["foundations", "Foundations"],
  ["layout", "Layout and frame"],
  ["heads", "Headers and title blocks"],
  ["drafting", "Drafting marks"],
  ["elevation", "Elevation and marks"],
  ["roles", "Who does a step"],
  ["chips", "Chips"],
  ["run", "Terminal and the cloud"],
  ["actions", "Actions and links"],
  ["switches", "Switches and the prompt"],
] as const;

const SECTION = "mt-24 md:mt-32";
const SUB = "type-title-m m-0 mt-16 mb-2 text-text";

export default function StyleguidePage() {
  const tokens = readTokens();
  const facts = siteFacts(getCorpus());
  const run = getDemoRun();
  const view = facts.share.syndication;

  // The home elevation: every written step, syndication view, sorted by who does it.
  const allMarks: StepMark[] = facts.records.flatMap((r) => r.byStructure.syndication.marks);
  // The same steps grouped by phase.
  const phaseGroups: MarkGroup[] = PHASES.map((phase) => ({
    label: PHASE_LABEL[phase],
    marks: facts.records.filter((r) => r.phase === phase).flatMap((r) => r.byStructure.syndication.marks),
  })).filter((g) => g.marks.length > 0);

  // One playbook, in step order, and its signature step.
  const formD = facts.records.find((r) => r.slug === "file-form-d-and-state-notices") ?? facts.records[0];
  const pb = formD ? getPlaybook(formD.slug) : undefined;
  const steps = pb ? applicableSteps(pb, DEFAULT_VARIANT) : [];
  const signIndex = steps.findIndex((s) => s.approval === "signature" && s.mode !== "agent");
  const signStep = steps[signIndex];
  const drafter = signStep ? steps.find((s) => signStep.after.includes(s.id) && MARK_OF[s.mode] === "A") : undefined;
  const agentSteps = steps.filter((s) => s.mode === "agent" || s.mode === "agent-browser");
  const personSteps = steps.filter((s) => s.mode === "human-online" || s.mode === "human-offline");

  // The recorded run: the first scene, and its refused step.
  const scene = run.scenes[0];
  const refusedAt = scene ? scene.steps.findIndex((s) => s.exit === 1) : -1;
  const shown = scene ? scene.steps.slice(Math.max(0, refusedAt - 2), refusedAt + 2) : [];
  const approval = run.scenes
    .flatMap((s) => s.steps)
    .find((s) => s.by && s.command.startsWith("pcre audit approve-lookups"));
  const refusal = run.scenes
    .flatMap((s) => s.steps)
    .find((s) => s.exit === 1 && s.command.startsWith("pcre deal"))
    ?.output.trim();

  const tested = HOSTS.filter((h) => h.status === "tested");
  const documented = HOSTS.filter((h) => h.status === "documented");
  // The stamp's one meaning: a person reviewed a record, on a date (content/reviews.json).
  const personReview =
    getCorpus()
      .reviews.filter((r) => r.kind === "playbook" && r.id === pb?.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const drafted = facts.records.find((r) => r.review === "ai-drafted" && r.lastVerified);
  const computedOn = buildDate();
  const rows = facts.records.slice(0, 5);

  // Every type role, set in a sentence the site really says.
  const TYPE_ROLES: Array<[string, string, ReactNode]> = [
    ["type-hero", "clamp(2.75rem, 4.2vw + 1.25rem, 5rem) / 0.98 · 620 · width 110 · the home h1 only", <p key="hero" className="type-hero m-0">{site.tagline}</p>],
    ["type-page", "2.75rem / 1.04 (2rem under 640 px) · 600 · width 108 · every other h1", <p key="page" className="type-page m-0">{facts.audits[0]?.title ?? "Audit"}</p>],
    ["type-title-l", "1.875rem / 1.14 (1.5rem under 640 px) · 600 · width 104 · h2", <p key="tl" className="type-title-l m-0">{formD?.title}</p>],
    ["type-title-m", "1.375rem / 1.24 · 600 · width 102 · h3, a sheet's title", <p key="tm" className="type-title-m m-0">{scene?.title}</p>],
    ["type-title-s", "1.125rem / 1.32 · 600 · row and step titles, h4", <p key="ts" className="type-title-s m-0">{steps[0]?.title}</p>],
    ["type-lede", "1.25rem / 1.5 (1.125rem under 640 px) · 400 · muted · one per page head", <p key="lede" className="type-lede measure m-0">{site.description}</p>],
    ["type-body", "1rem / 1.6 · 420 · prose, with `measure` (68ch)", <p key="body" className="type-body measure m-0 text-muted">{steps[0]?.instruction}</p>],
    ["type-body-s", "0.875rem / 1.5 · 430 · secondary rows, table cells, captions", <p key="bs" className="type-body-s measure m-0 text-muted">{signStep?.modeBasis}</p>],
    ["type-label", "0.8125rem / 1.35 · 540 · controls, table heads, chips, keys", <p key="label" className="type-label m-0 text-muted">A person&rsquo;s step has a cut corner</p>],
    ["type-note", "0.75rem / 1.4 · 480 · the floor: chart ticks, fine print", <p key="note" className="type-note m-0 text-faint">{facts.coverage.label}</p>],
    ["type-figure", "clamp(3.5rem, 6vw, 6rem) / 0.9 · 600 · width 110 · tabular · one per sheet", <p key="fig" className="type-figure m-0">{view.pct}%</p>],
    ["type-code", "Plex Mono 0.875rem / 1.55 · 400 · prompts and commands", <p key="code" className="type-code m-0 text-text [overflow-wrap:anywhere]">{scene?.steps[0]?.command}</p>],
    ["type-data", "Plex Mono 0.8125rem / 1.4 · 500 · dimension labels, ids, dates", <p key="data" className="type-data m-0 text-muted">{run.recordedOn}</p>],
  ];

  return (
    <Container>
      <PageHead
        title="Styleguide"
        lede={
          <>
            The drawing-set system: the tokens, the type roles and each shared component, shown with real content from the
            catalog and the recorded run. Import components from{" "}
            <code className="type-code text-accent-strong">@/components/ui</code>.
          </>
        }
      />
      <nav aria-label="On this page" className="mt-8">
        <ul className="type-body-s m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <TextLink href={`#${id}`} tone="muted">
                {label}
              </TextLink>
            </li>
          ))}
          <li>
            <TextLink href="/styleguide/motion" tone="muted">
              Motion specimens
            </TextLink>
          </li>
        </ul>
      </nav>

      {/* ---------------- Foundations ---------------- */}
      <section className={SECTION} aria-labelledby="foundations">
        <SheetHeader
          id="foundations"
          title="Foundations: ink, type, marks and the sheet."
          note="Tokens are read from app/globals.css"
        />

        <h3 className={SUB}>Palette: two themes, one set of names</h3>
        <p className="type-body measure m-0 text-muted">
          Night is the drawing set at night. Paper is the same set on a desk in daylight: a cool white sheet on a greyer
          table, and every color a writing instrument. The system setting picks one, and the switch overrides it.
          Authored in OKLCH, stored as hex. Color says who does a step and what state a thing is in: a mark carries it,
          the words beside the mark stay in the reading ink. <code className="type-code">__tests__/tokens.test.ts</code>{" "}
          holds every ink to 4.5:1 and every mark to 3:1 on every surface it sits on, in both themes. The ratio beside a
          value is its contrast on a sheet&rsquo;s paper in the same theme.
        </p>
        <div className="mt-6 border-t border-line-strong">
          <Row name="<ThemeToggle />" spec="says what it will do; not drawn with scripts off">
            <ThemeToggle />
          </Row>
        </div>
        <div className="mt-10 grid gap-y-10">
          {PALETTE.map((g) => (
            <div key={g.label} className="min-w-0">
              <div className={`${PALETTE_ROW} border-b border-line-strong pb-2`}>
                <h4 className="type-label m-0 text-faint max-md:col-span-2">{g.label}</h4>
                {THEMES.map((theme) => (
                  <span key={theme.id} aria-hidden className="type-label text-faint">
                    {theme.label}
                  </span>
                ))}
              </div>
              <ul className="m-0 list-none p-0">
                {g.names.map((n) => (
                  <li key={n} className={`${PALETTE_ROW} border-b border-line py-3`}>
                    <code className="type-data text-text max-md:col-span-2">--{n}</code>
                    {THEMES.map((theme) => {
                      const t = tokens[theme.id].get(n);
                      const on = g.on ? tokens[theme.id].get(g.on)?.value : undefined;
                      return (
                        <span key={theme.id} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3">
                          <span aria-hidden className="block h-10 border border-line-strong" style={{ background: t?.value }} />
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            <span className="type-data block text-text">
                              <span className="sr-only">{theme.label}: </span>
                              {t?.value ?? "missing"}
                              {isHex(t?.value) && isHex(on) && ` · ${contrast(t.value, on)}:1`}
                            </span>
                            <span className="type-note block text-faint">
                              {t?.role}
                              {t?.source && ` · ${t.source}`}
                            </span>
                          </span>
                        </span>
                      );
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h3 className={SUB}>Type roles</h3>
        <p className="type-body measure m-0 text-muted">
          Archivo for every word; Plex Mono, at 400 and 500, for prompts, commands, paths, ids and measured figures. One
          scale, named by job: a role sets size, leading, weight, width and tracking, and nothing else is used.
        </p>
        <div className="mt-6 border-t border-line-strong">
          {TYPE_ROLES.map(([role, spec, sample]) => (
            <Row key={role} name={role} spec={spec}>
              {sample}
            </Row>
          ))}
        </div>

        <h3 className={SUB}>Icons</h3>
        <p className="type-body measure m-0 text-muted">
          One drawn set, a 1.5 px stroke with square caps, at 16 and 20 px, in the color of the text beside it.
        </p>
        <ul className="m-0 mt-6 grid list-none grid-cols-2 gap-x-6 border-t border-line-strong p-0 sm:grid-cols-3 lg:grid-cols-5">
          {ICON_NAMES.map((name) => (
            <li key={name} className="flex items-center gap-3 border-b border-line py-3 text-text">
              <Icon name={name} />
              <Icon name={name} size={20} />
              <code className="type-data min-w-0 text-muted">{name}</code>
            </li>
          ))}
        </ul>

        <h3 className={SUB}>Marks</h3>
        <p className="type-body measure m-0 text-muted">
          Who does a step, by shape as well as color: a person&rsquo;s mark has its corner cut, a variant is hatched.
          Never under 12 px, where the cut stops showing.
        </p>
        <div className="mt-6 border-t border-line-strong">
          {(["sm", "md", "lg"] as const).map((size) => (
            <Row key={size} name={`<RoleMark size="${size}">`} spec={size === "sm" ? "12 px" : size === "md" ? "14 px, the default" : "20 px"}>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {MARK_ORDER.map((m) => (
                  <RoleMark key={m} mode={m} size={size} />
                ))}
              </div>
            </Row>
          ))}
          <Row name="inked={false}" spec="penciled: before a sequence inks it">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {MARK_ORDER.map((m) => (
                <RoleMark key={m} mode={m} size="lg" inked={false} />
              ))}
            </div>
          </Row>
          <Row name="<LaneTag lane>" spec="whose lane this is: a mark and a word, no side stripe">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <LaneTag lane="agent" />
              <LaneTag lane="person" />
              <LaneTag lane="person" mark="O">
                A person, offline
              </LaneTag>
            </div>
          </Row>
          {formD && (
            <Row name="<Marks marks>" spec={formD.title}>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <Marks marks={formD.byStructure.syndication.marks} size="sm" />
                <Marks marks={formD.byStructure.syndication.marks} />
              </div>
            </Row>
          )}
        </div>

        <h3 className={SUB}>The sheet</h3>
        <p className="type-body measure m-0 text-muted">
          A drawing has one border, the drafting grid inside its drawing area, and one title block along its bottom
          edge. Inside it there are rules, never another box.
        </p>
        {formD && pb && (
          <Sheet
            className="mt-6"
            title={formD.title}
            titleId="sg-sheet-title"
            note="1 mark = 1 step"
            grid
            titleBlock={
              <TitleBlock label="Title block" cols={5}>
                <TitleCell label="Project">{site.name}</TitleCell>
                <TitleCell label="Sheet">Styleguide</TitleCell>
                <TitleCell label="Review" tone={personReview ? "accent" : "default"}>
                  {personReview
                    ? `${personReview.level === "attorney-reviewed" ? "Attorney" : "Practitioner"}, ${personReview.date}`
                    : "AI-drafted"}
                </TitleCell>
                <TitleCell label="Sources checked" mono>
                  {formD.lastVerified}
                </TitleCell>
                <TitleCell label="Connector" tone={site.connectorLive ? "agent" : "human"}>
                  {site.connectorLive ? "Live" : "Not live yet"}
                </TitleCell>
              </TitleBlock>
            }
            footer={
              <>
                Counted from the catalog on <time dateTime={computedOn}>{computedOn}</time>. A person&rsquo;s step has a cut corner.
              </>
            }
          >
            <DimensionLine>
              <b className="font-medium text-text">{formD.byStructure.syndication.total}</b> steps
            </DimensionLine>
            <div className="mt-2 flex gap-0.5" aria-hidden>
              {formD.byStructure.syndication.marks.map((m, i) => (
                <i key={i} className={`mk mk-${m} h-10 w-auto min-w-0 flex-1 [--cut:10px]`} />
              ))}
            </div>
            <p className="type-body-s m-0 mt-4 text-muted">
              An agent can do {formD.byStructure.syndication.agent} of {formD.byStructure.syndication.total}; a person does
              the rest, and signs.
            </p>
          </Sheet>
        )}

        <h3 className={SUB}>The stamp and the cloud</h3>
        <p className="type-body measure m-0 text-muted">
          A stamp means a person reviewed this, on this date: one color, never a lane color. The revision cloud circles
          the one thing the engine refused, and nothing else. Both can be drawn: penciled, then inked.
        </p>
        <div className="mt-6 border-t border-line-strong">
          <Row name="<Stamp>" spec="inked, and inked={false}">
            <div className="flex flex-wrap items-center gap-6">
              {personReview && (
                <>
                  <Stamp
                    word={personReview.level === "attorney-reviewed" ? "Attorney" : "Practitioner"}
                    datePrefix="reviewed"
                    date={personReview.date}
                  />
                  <Stamp
                    word={personReview.level === "attorney-reviewed" ? "Attorney" : "Practitioner"}
                    datePrefix="reviewed"
                    date={personReview.date}
                    inked={false}
                  />
                </>
              )}
            </div>
          </Row>
          <Row name="<RevisionCloud draw={0.5}>" spec="--draw: 0.5, drawn clockwise from the top left">
            <RevisionCloud label="Refused" draw={0.5} className="max-w-xl">
              <Outcome kind="refused">
                <b>Refused.</b> {refusal}
              </Outcome>
            </RevisionCloud>
          </Row>
          <Row name="<RevisionCloud>" spec="--draw: 1, the finished state">
            <RevisionCloud label="Refused" delta={1} className="max-w-xl">
              <Outcome kind="refused">
                <b>Refused.</b> {refusal}
              </Outcome>
            </RevisionCloud>
          </Row>
          <Row name='data-inked="false"' spec="penciled: the cloud waits in pencil, --draw: 0">
            <div data-inked="false">
              <RevisionCloud label="Refused" draw={0} className="max-w-xl">
                <div className="flex items-start gap-3">
                  <RefusedBadge n={5} />
                  <Outcome kind="refused">
                    <b>Refused.</b> {refusal}
                  </Outcome>
                </div>
              </RevisionCloud>
            </div>
          </Row>
          <Row name="--draw: 0.5" spec="set once on a parent: a dimension, the property line and an icon's stroke, each half drawn from its start">
            <div className="grid max-w-xl gap-4" style={{ "--draw": 0.5 } as CSSProperties}>
              <DimensionLine>
                <b className="font-medium text-text">{formD?.byStructure.syndication.total}</b> steps
              </DimensionLine>
              <PropertyLine label="Property line" />
              <p className="type-body-s m-0 flex items-center gap-3 text-muted">
                <Icon name="check" size={20} draw className="text-text" />
                Copied
              </p>
            </div>
          </Row>
        </div>

        <h3 className={SUB}>Buttons</h3>
        <p className="type-body measure m-0 text-muted">
          Primary is filled, secondary outlined, quiet is text. Every one is at least 44 px tall under 768 px. The
          hover, pressed and focus columns are still pictures of those states, drawn from the same tokens.
        </p>
        <div className="mt-6 overflow-x-auto border-t border-line-strong">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr>
                {["Variant", "Rest", "Hover", "Pressed", "Focus", "Disabled", "Small"].map((h) => (
                  <th key={h} scope="col" className="type-label border-b border-line py-3 pr-4 text-faint">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["primary", "bg-fill-hover border-fill-hover", "bg-muted border-muted"],
                  ["secondary", "bg-tile border-faint", "bg-panel"],
                  ["quiet", "bg-tile", "bg-panel"],
                ] as const
              ).map(([variant, hover, pressed]) => (
                <tr key={variant}>
                  <th scope="row" className="type-data border-b border-line py-3 pr-4 text-muted">
                    {variant}
                  </th>
                  <td className="border-b border-line py-3 pr-4">
                    <Button variant={variant}>Copy the sentence</Button>
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    <Button variant={variant} tabIndex={-1} className={hover}>
                      Copy the sentence
                    </Button>
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    <Button variant={variant} tabIndex={-1} className={pressed}>
                      Copy the sentence
                    </Button>
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    <Button variant={variant} tabIndex={-1} className="outline-2 outline-offset-2 outline-accent-strong">
                      Copy the sentence
                    </Button>
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    <Button variant={variant} disabled>
                      Copy the sentence
                    </Button>
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    <Button variant={variant} size="sm">
                      Copy
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className={SUB}>The fold and the callout</h3>
        <div className="mt-4 grid gap-x-12 gap-y-8 lg:grid-cols-2">
          <div className="min-w-0 border-y border-line-strong">
            <Disclosure summary={steps[0]?.title ?? "A step"} chevron="end" name="sg-fold" summaryClassName="type-title-s py-3" bodyClassName="pb-4">
              <p className="type-body measure m-0 text-muted">{steps[0]?.instruction}</p>
            </Disclosure>
            <Disclosure
              summary={steps[1]?.title ?? "A step"}
              chevron="end"
              name="sg-fold"
              className="border-t border-line"
              summaryClassName="type-title-s py-3"
              bodyClassName="pb-4"
            >
              <p className="type-body measure m-0 text-muted">{steps[1]?.instruction}</p>
            </Disclosure>
            <Disclosure summary="The engine's command (optional)" size="sm" className="border-t border-line" summaryClassName="type-body-s text-muted" bodyClassName="pb-4">
              <p className="type-code m-0 text-muted [overflow-wrap:anywhere]">{scene?.steps[0]?.command}</p>
            </Disclosure>
          </div>
          <div className="grid min-w-0 content-start gap-6">
            {signStep && (
              <Callout tone="person" icon={<RoleMark mode="H" showLabel={false} />} title="Why a person does it">
                {signStep.modeBasis}
              </Callout>
            )}
            <Callout title="A recorded run">
              {run.firm} is a fictional firm. The run was recorded on <time dateTime={run.recordedOn}>{run.recordedOn}</time>.
            </Callout>
          </div>
        </div>
      </section>

      {/* ---------------- Layout ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="layout" title="A compact head on every page, one quiet line of facts." />
        <div className="grid gap-12">
          <Specimen name="<PageHead title lede crumbs facts />" note="one quiet line of facts; at most one lead fact, first">
            <PageHead
              headingLevel={2}
              className="pt-0 md:pt-0"
              crumbs={[{ href: "/playbooks", label: "Playbooks" }, { label: formD?.title ?? "A playbook" }]}
              title={formD?.title ?? "A playbook"}
              lede="A title, one or two lines, a line of counted facts. The thing the page is for starts right under it."
              facts={[
                {
                  lead: true,
                  label: "steps an agent can do",
                  value: formD ? `${formD.byStructure.syndication.agent} of ${formD.byStructure.syndication.total}` : null,
                },
                { label: "Sources checked", mono: true, value: formD?.lastVerified ?? null },
                { label: "Coverage", value: facts.coverage.label },
              ]}
            />
          </Specimen>
          <Specimen name="<PageHead title actions aside />" note="aside sits to the right from 1024 px, under the text below it">
            <PageHead
              headingLevel={2}
              className="pt-0 md:pt-0"
              title={`${facts.audits[0]?.title ?? "An audit"}, checked against the public record and the firm's own files`}
              lede={`${facts.audits[0]?.checks ?? 0} checks, each saying who verifies it and where it comes from.`}
              actions={
                <>
                  <ButtonLink href="/audit">See the audit</ButtonLink>
                  <ButtonLink href="/run" variant="secondary">
                    Watch a recorded run
                  </ButtonLink>
                </>
              }
              aside={
                <TitleBlock label="The audit in counts" cols={2}>
                  <TitleCell label="Checks" mono>
                    {facts.audits[0]?.checks}
                  </TitleCell>
                  <TitleCell label="An agent can do" mono>
                    {facts.audits[0]?.agentChecks}
                  </TitleCell>
                </TitleBlock>
              }
            />
          </Specimen>
          <Specimen name="<Container> · <Band>" note="1128 px content inside a 1240 frame; Band is a full-width stripe">
            <p className="type-body m-0 text-muted">
              This page sits in one Container. The stripe below is a Band (tone raised), shown inside this specimen.
            </p>
            <Band tone="raised" contained={false} className="mt-4 px-4 py-4" label="Example band">
              <p className="type-body m-0 text-text">
                {facts.counts.written} of {facts.counts.playbooks} records are written at full depth.
              </p>
            </Band>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Headers and title blocks ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="heads" title="Section heads and title blocks: the heading, and nothing above it." />
        <div className="grid gap-12">
          <Specimen name="<SheetHeader title note />" note="an h2 in type-title-l; a quiet note to its right">
            <SheetHeader level={2} title="Your agent does the work. The playbook holds the line." note={`Recorded run · ${run.recordedOn}`} flush />
          </Specimen>
          <Specimen name="<SheetHeader level={3} />" note="an h3 in type-title-m">
            <SheetHeader level={3} title="The whole catalog, one floor per playbook." flush />
          </Specimen>
          <Specimen name="<SheetHeader>{control}</SheetHeader>" note="a control in the right slot">
            <div id="sg-structure" data-structure="syndication">
              <SheetHeader level={3} title="The steps change with the capital structure.">
                <StructureSwitch rootId="sg-structure" />
              </SheetHeader>
              {STRUCTURES.map((s) => (
                <p key={s} data-s={s} className="type-body m-0 text-muted">
                  {STRUCTURE_LABEL[s]}: {facts.share[s].total} written steps apply.
                </p>
              ))}
            </div>
          </Specimen>
          <Specimen name="<CountsLine catalog />" note="the one counting model, from siteFacts(corpus).catalog; the status line opens with it">
            <p className="type-body m-0">
              <CountsLine catalog={facts.catalog} />
            </p>
          </Specimen>
          <Specimen name="<TitleBlock> <TitleCell>" note="what a sheet is; every value computed. On its own, one ruled band">
            <TitleBlock label="Title block">
              <TitleCell label="Project">{site.name}</TitleCell>
              <TitleCell label="Sheet">Styleguide</TitleCell>
              <TitleCell label="Date" mono>
                {computedOn}
              </TitleCell>
              <TitleCell label="Scale">1 mark = 1 step</TitleCell>
              <TitleCell label="Coverage">{facts.coverage.label}</TitleCell>
              <TitleCell label="Connector" tone={site.connectorLive ? "agent" : "human"}>
                {site.connectorLive ? "Live" : "Not live yet"}
              </TitleCell>
            </TitleBlock>
          </Specimen>
          {pb && signStep && (
            <Specimen name="<ApprovalCells drawnBy signer />" note="no approval yet: a line to sign">
              <TitleBlock label={`Approval for ${signStep.title}`}>
                <TitleCell label="Playbook" wide>
                  {pb.title}
                </TitleCell>
                <TitleCell label={`Step ${String(signIndex + 1).padStart(2, "0")}`} wide>
                  {signStep.title}
                </TitleCell>
                <TitleCell label="Gates">
                  <span className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {stepGates(signStep).map((g) => (
                      <GateGlyph key={g} kind={g} />
                    ))}
                  </span>
                </TitleCell>
                <ApprovalCells drawnBy={drafter ? "agent" : (signStep.actor ?? "a person")} signer={signStep.actor} />
              </TitleBlock>
              {drafter && (
                <p className="type-note m-0 mt-3 text-faint">
                  Drawn by: the agent step before it, &ldquo;{drafter.title}&rdquo;.
                </p>
              )}
            </Specimen>
          )}
          {approval && (
            <Specimen name="<ApprovalCells drawnBy approvedBy={{ name, date }} />" note="from the recorded run">
              <TitleBlock label="Lookups approved">
                <TitleCell label="Command" mono wide>
                  {approval.command}
                </TitleCell>
                <ApprovalCells drawnBy="agent" approvedBy={{ name: approval.by ?? "", date: run.recordedOn }} />
              </TitleBlock>
            </Specimen>
          )}
        </div>
      </section>

      {/* ---------------- Drafting marks ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="drafting" title="Dimensions measure. A stamp means a person reviewed it." />
        <div className="grid gap-12 lg:grid-cols-2">
          <Specimen name="<DimensionLine>" note="horizontal above, below; vertical">
            <div className="flex gap-4">
              <div className="min-w-0 flex-1">
                <DimensionLine>
                  <b className="font-medium text-text">{facts.counts.written}</b> written
                </DimensionLine>
                <div className="mt-1 flex h-12 gap-0.5" aria-hidden>
                  <span className="block bg-accent" style={{ flexGrow: facts.counts.written }} />
                  <span className="block border border-dashed border-line-bold" style={{ flexGrow: facts.counts.outlined }} />
                </div>
                <DimensionLine placement="below">
                  <b className="font-medium text-text">{facts.counts.playbooks}</b> records
                </DimensionLine>
              </div>
              <DimensionLine orientation="v">{facts.counts.rules} rules</DimensionLine>
            </div>
          </Specimen>
          <Specimen name="<Stamp word datePrefix date>" note="one meaning: a person reviewed this record; flat everywhere">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              {personReview && pb && (
                <span className="flex items-center gap-4">
                  <Stamp
                    word={personReview.level === "attorney-reviewed" ? "Attorney" : "Practitioner"}
                    datePrefix="reviewed"
                    date={personReview.date}
                  />
                  <span className="type-body-s text-muted">{pb.title}</span>
                </span>
              )}
            </div>
            <p className="type-body-s m-0 mt-4 text-muted">Every other status is a flat chip:</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {tested[0] && (
                <Tag tone="agent" dot>
                  {tested[0].status} {tested[0].checked}
                </Tag>
              )}
              {documented[0] && (
                <Tag tone="accent">
                  {documented[0].status} {documented[0].checked}
                </Tag>
              )}
              {drafted?.lastVerified && <Tag dashed>AI-drafted, sources checked {drafted.lastVerified}</Tag>}
              <Tag tone="human" dashed dot>
                Not live yet
              </Tag>
              <Tag dashed>Outline</Tag>
            </div>
          </Specimen>
          <Specimen name="<Logo id name size government>" note="a company's own icon, always beside its name (D218); a letter tile of ours where none was got, one glyph for a government source">
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
              {HOSTS.map((h) => (
                <li key={h.id} className="flex items-center gap-3">
                  <Logo id={h.id} name={h.name} size="lg" />
                  <span className="flex flex-col">
                    <span className="type-body-s font-medium text-text">{h.name}</span>
                    <span className="type-note text-faint">{statusLine(h)}</span>
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-3">
                <Logo id="costar" name="CoStar" size="lg" />
                <span className="type-body-s font-medium text-text">CoStar (no icon on file)</span>
              </li>
              <li className="flex items-center gap-3">
                <Logo id="irs-ein" name="IRS EIN" size="lg" government />
                <span className="type-body-s font-medium text-text">IRS (a government source)</span>
              </li>
            </ul>
          </Specimen>
          <Specimen name="<Monogram size active>" note="our own two-letter tile, kept for a tile of ours">
            <div className="flex items-center gap-3">
              <Monogram size="md" active>
                {MONOGRAM["claude-code"] ?? "CC"}
              </Monogram>
              <Monogram size="md">{MONOGRAM.codex ?? "Cx"}</Monogram>
            </div>
          </Specimen>
          <Specimen name="<PropertyLine orientation='v' label>" note="agent | person; folds flat under 768 px">
            <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr] md:gap-4">
              <ul className="m-0 list-none p-0">
                {agentSteps.slice(0, 4).map((s) => (
                  <li key={s.id} className="type-body-s border-b border-line py-3 text-text">
                    {s.title}
                  </li>
                ))}
              </ul>
              <PropertyLine orientation="v" label="The line" />
              <ul className="m-0 list-none p-0">
                {personSteps.slice(0, 4).map((s) => (
                  <li key={s.id} className="type-body-s border-b border-line py-3 text-text">
                    {s.title}
                  </li>
                ))}
              </ul>
            </div>
          </Specimen>
          <Specimen name="<PropertyLine label>" note="horizontal: the operator's machine above, the hosted site below">
            <p className="type-body m-0 text-muted">The firm folder, on your own machine.</p>
            <PropertyLine label="Property line" className="my-3" />
            <p className="type-body m-0 text-muted">The public catalog, on the hosted site.</p>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Elevation and marks ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="elevation" title="Every written step, drawn." note="Computed from siteFacts(getCorpus())" />
        <div className="grid gap-12">
          <Specimen name='<Elevation marks sort size="lg" />' note="every written step, sorted by who does it">
            <Elevation
              marks={allMarks}
              sort
              caption={
                <>
                  <b>Elevation</b> &nbsp;Every written step, syndication view
                </>
              }
              note="1 mark = 1 step"
            />
          </Specimen>
          <Specimen name='<Elevation groups size="lg" />' note="grouped by phase, in step order within each">
            <Elevation groups={phaseGroups} caption="Written steps by phase" legend={false} />
          </Specimen>
          {formD && (
            <Specimen name='<Elevation marks size="md" />' note="one playbook, in step order">
              <Elevation
                marks={formD.byStructure.syndication.marks}
                size="md"
                caption={
                  <>
                    <b>Elevation</b> &nbsp;{formD.title}
                  </>
                }
                note="1 cell = 1 step"
              />
            </Specimen>
          )}
          <Specimen name="<Marks marks />" note="row scale, step order; a list row gives counts, never a percentage">
            <ul className="m-0 list-none border-t border-line-strong p-0">
              {rows.map((r) => (
                <li
                  key={r.slug}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 border-b border-line py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <span className="type-body font-medium text-text">{r.title}</span>
                  <Marks marks={r.byStructure.syndication.marks} size="sm" className="max-md:col-start-1 max-md:row-start-2" />
                  <span className="type-data whitespace-nowrap text-muted">
                    <b className="font-medium text-text">{r.byStructure.syndication.agent}</b> of {r.byStructure.syndication.total}
                  </span>
                </li>
              ))}
            </ul>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Who does a step ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="roles" title="A mark, a word, and the gates." />
        <div className="grid gap-12 lg:grid-cols-2">
          <Specimen name="<RoleMark mode />" note="hatched for the variants">
            <div className="flex flex-col gap-3">
              {STEP_MODES.map((m) => (
                <RoleMark key={m} mode={m} />
              ))}
            </div>
          </Specimen>
          <Specimen name="<GateGlyph kind showLabel />" note="each with a text alternative">
            <div className="flex flex-col gap-3">
              <GateGlyph kind="signature" />
              <GateGlyph kind="irreversible" />
              <GateGlyph kind="hard-to-undo" />
              <p className="type-note m-0 mt-2 flex items-center gap-3 text-faint">
                Glyph only:
                <GateGlyph kind="signature" showLabel={false} />
                <GateGlyph kind="irreversible" showLabel={false} />
                <GateGlyph kind="hard-to-undo" showLabel={false} />
              </p>
            </div>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Chips ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="chips" title="Solid for facts, dashed for not yet." note="components/chips.tsx" />
        <div className="grid gap-12 lg:grid-cols-2">
          <Specimen name="<Tag tone dashed dot>" note="the frame and the square carry the color; the word is neutral ink">
            <div className="flex flex-wrap gap-3">
              <Tag>{facts.coverage.label}</Tag>
              <Tag tone="accent">Documented</Tag>
              <Tag tone="agent" dot>
                Tested
              </Tag>
              <Tag tone="human" dashed dot>
                Not live yet
              </Tag>
              <Tag dashed>Outline</Tag>
              <Tag tone="danger">Act within hours</Tag>
              <Tag tone="warn">Act within days</Tag>
              <Tag>Act within weeks</Tag>
            </div>
          </Specimen>
          <Specimen name="<ReviewChip review>" note="one review color; AI-drafted is a dashed neutral outline">
            <div className="flex flex-wrap gap-3">
              {REVIEW_LEVELS.map((r) => (
                <ReviewChip key={r} review={r} />
              ))}
            </div>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Terminal and the cloud ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="run" title="Real output. One refusal, circled." note={`getDemoRun() · ${run.recordedOn}`} />
        <div className="grid gap-12">
          {scene && (
            <Specimen name="<Terminal> <TermLine kind actor delta>" note={scene.title}>
              <Terminal
                title={
                  <>
                    <b>Recorded run</b> &nbsp;{run.firm}, a fictional firm
                  </>
                }
                label="Recorded engine output"
              >
                {shown.map((s) => (
                  <div key={s.command + s.exit} className="contents">
                    <TermLine kind="command" actor={s.by ?? "agent"}>
                      {s.command}
                    </TermLine>
                    {s.exit === 1 ? (
                      <TermLine kind="refused" delta={1} note="Refused · this step belongs to a person">
                        {s.output.trimEnd()}
                      </TermLine>
                    ) : (
                      <TermLine kind="output">{s.output.trimEnd()}</TermLine>
                    )}
                  </div>
                ))}
              </Terminal>
            </Specimen>
          )}
          <Specimen name="<RevisionCloud delta label>" note="around the one thing the engine refused; whole scallops at any width">
            <div className="max-w-xl">
              <RevisionCloud delta={1} label="Refused" className="type-body text-text">
                {refusal}
              </RevisionCloud>
            </div>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Actions and links ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="actions" title="One primary per screen." />
        <div className="grid gap-12 lg:grid-cols-2">
          <Specimen name="<ButtonLink variant size> · <Button>">
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href="/plans">Connect your agent</ButtonLink>
              <ButtonLink href="/run" variant="secondary">
                Watch a recorded run
              </ButtonLink>
              <ButtonLink href="/playbooks" size="sm" variant="secondary" arrow={false}>
                Read the playbooks
              </ButtonLink>
              <Button variant="quiet" size="sm">
                <Icon name="replay" />
                Replay
              </Button>
            </div>
          </Specimen>
          <Specimen name="<TextLink tone mono>">
            <p className="type-body m-0 text-muted">
              Every step says where it comes from: <TextLink href="/rules">the rule cards</TextLink>, the{" "}
              <TextLink href="/playbooks" tone="accent">
                playbooks
              </TextLink>{" "}
              and <TextLink href="/install" tone="muted" mono>/install</TextLink> for agents.
            </p>
          </Specimen>
          <Specimen name="<Heading level> · <Lede>">
            <Heading level={3}>Audit the firm you already run.</Heading>
            <Lede className="mt-3">
              {facts.audits[0]?.checks} cited checks of the entity&rsquo;s standing, and a list of what to fix.
            </Lede>
          </Specimen>
        </div>
      </section>

      {/* ---------------- Switches and the prompt ---------------- */}
      <section className={SECTION}>
        <SheetHeader id="switches" title="Works with scripts off." />
        <div id="sg-doors" data-mode="start" className="grid gap-12">
          <Specimen name="<VariantSwitch rootId param attr options label>" note="the root's data attribute picks the variant">
            <VariantSwitch
              rootId="sg-doors"
              param="mode"
              attr="data-mode"
              label="Start a firm or audit one"
              options={doors.map((d) => ({ value: d.id, label: d.label }))}
            />
            <div className="mt-4">
              {doors.map((d) => (
                <div key={d.id} data-m={d.id}>
                  <PromptWell text={d.prompt(site.url)} id={`sg-prompt-${d.id}`} />
                </div>
              ))}
            </div>
            <p className="type-note m-0 mt-3 text-faint">&lt;PromptWell text id /&gt; under the switch.</p>
          </Specimen>
        </div>
        <p className="type-body-s measure m-0 mt-12 text-muted">
          The status line, one quiet line of real counts, closes every page just above the footer.
        </p>
      </section>
    </Container>
  );
}
