import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { TermsList } from "@/components/connect";
import { GROUP_LABEL, ReadingSection, TIER_LABEL, VerdictLegend } from "@/components/rankings";
import { Container, PageHead, TextLink, cx } from "@/components/ui";
import { RANKINGS_DIR } from "@/lib/content/load";
import { getRankings } from "@/lib/rankings/load";
import { GOLDEN_CELLS, GOLDEN_TO_PUBLISH } from "@/lib/rankings/state";
import { TIERS } from "@/lib/schemas/rankings";
import { contestUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "How software is scored",
  description: "How PromptedCRE scores software on agent-readiness: the tasks, the evidence, the judge, the math and the rules.",
};

const TIER_WHAT: Record<(typeof TIERS)[number], string> = {
  probe: "a script checked it: an llms.txt file, a spec file, a page that resolves",
  code: "a public repository or package",
  independent: "a third party's write-up",
  "vendor-claim": "the vendor's own pages",
};

const PIPELINE = [
  {
    name: "Probe",
    text: "keyless scripted checks for llms.txt, API spec files, MCP and SDK pages, and packages on public registries. Only definite results count; a refused request records nothing.",
  },
  { name: "Collect", text: "the four pages above, plus whatever a task needs, stored as verbatim excerpts." },
  {
    name: "Judge",
    text: "a fresh AI model instance per vendor, given only the tasks and that vendor's evidence. No outside knowledge; no evidence means none. Each verdict cites evidence ids, and any quality below 10 names what is missing. A vendor is judged again only when its evidence changes.",
  },
  { name: "Validate", text: "a script rejects verdicts that cite missing evidence, skip a task or lack a reason." },
  {
    name: "Calibrate",
    text: `${GOLDEN_CELLS} cells per market are checked by hand before the judge runs. A market publishes only when the judge agrees on at least ${GOLDEN_TO_PUBLISH}.`,
  },
];

const SECTIONS = [
  { id: "tasks", title: "Tasks" },
  { id: "evidence", title: "Evidence" },
  { id: "pipeline", title: "Pipeline" },
  { id: "judge-prompt", title: "The judge prompt" },
  { id: "score", title: "Score" },
  { id: "money", title: "Money, review and disputes" },
  { id: "terms", title: "Terms" },
  { id: "license", title: "Data license" },
] as const;

const title = (id: (typeof SECTIONS)[number]["id"]) => SECTIONS.find((s) => s.id === id)?.title ?? id;

// The judge prompt as stored, without its version comment; the version is read from that
// comment ("prompt version: judge-v1 (2026-11-12)") and shown beside the heading.
function readJudgePrompt() {
  const raw = fs.readFileSync(path.join(RANKINGS_DIR, "judge-prompt.md"), "utf8");
  const version = raw.match(/<!--\s*prompt version:\s*([^\s(]+)\s*\(([^)]+)\)/);
  // The file is hard-wrapped near 88 characters; the well is narrower, so each paragraph and
  // list item is rejoined into one line and the well wraps it. No word is changed.
  const body = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "").trimEnd();
  return {
    text: body.replace(/([^\n])\n[ \t]*(?!\n|[-*] |\d+\. )/g, "$1 "),
    version: version ? `${version[1]} · ${version[2]}` : null,
  };
}

// A reading page: plain ground, type-body at the 68-character measure, headings with air above
// them, the judge prompt and the license shown as text in a well. The contents list stays in
// view from 1024 px.
export default function MethodologyPage() {
  const { stories, storiesVersion, markets } = getRankings();
  const license = fs.readFileSync(path.join(RANKINGS_DIR, "DATA-LICENSE"), "utf8");
  const prompt = readJudgePrompt();
  const listed = markets.reduce((sum, m) => sum + m.vendors.length, 0);
  const taskCounts = markets.map((m) => m.market.tasks.length);
  const taskMin = Math.min(...taskCounts);
  const taskMax = Math.max(...taskCounts);
  const taskWeights = [...new Set(markets.flatMap((m) => m.market.tasks.map((t) => t.weight)))].sort((a, b) => a - b);
  const taskNote = `every market also has ${taskMin === taskMax ? taskMin : `${taskMin} to ${taskMax}`} tasks of its own, weight ${taskWeights.join(" or ")}${taskWeights.length === 1 ? " each" : ""}`;

  return (
    <Container>
      <PageHead
        crumbs={[{ href: "/rankings", label: "Software" }, { label: "Methodology" }]}
        title="How the rankings work"
        lede={
          <>
            Every market is scored on the same tasks, plus a few of its own, about how well an AI agent can operate the software. A
            judge reads only the public evidence we stored and cites it; the score is arithmetic on the verdicts.
          </>
        }
      />

      <div className="mt-12 grid gap-x-16 gap-y-12 md:mt-16 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="max-lg:border-y max-lg:border-line max-lg:py-4">
          <div className="lg:sticky lg:top-24">
            <p className="type-label m-0 mb-2 text-muted">On this page</p>
            <ul className="m-0 grid list-none gap-x-6 p-0 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="type-body-s flex min-h-11 items-center text-muted underline decoration-transparent underline-offset-4 hover:text-text hover:decoration-accent lg:min-h-8"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-20 md:space-y-24">
          <ReadingSection id="tasks" title={title("tasks")} note={`${storiesVersion} · ${taskNote}`}>
            <p className="m-0">
              A task is one thing an AI agent needs to do with a product, asked as a question the evidence can answer. Each has a
              weight. These apply to every market:
            </p>
            {(["access", "openness"] as const).map((g) => (
              <div key={g} className="not-first:mt-10">
                <h3 className="type-title-s m-0 mb-3 text-text">{GROUP_LABEL[g]}</h3>
                <dl className="m-0 border-t border-line">
                  {stories
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 border-b border-line py-4">
                        <dt className="type-body text-text">{s.title}</dt>
                        <dd className="type-data row-span-2 m-0 self-start pt-1 text-muted">
                          <span className="sr-only">weight </span>×{s.weight}
                        </dd>
                        <dd className="type-body-s m-0 mt-1 text-muted">{s.question}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
            <p className="m-0">
              Self-serve access and public pricing weigh as much as a public API: in real estate software they are often what
              stands between a small firm and the product.
            </p>
          </ReadingSection>

          <ReadingSection id="evidence" title={title("evidence")} note="Strongest first">
            <p className="m-0">
              Each item stores the page, a verbatim excerpt of 25 words or fewer, the date and a hash. Evidence comes in four
              tiers:
            </p>
            <ol className="m-0 list-none border-t border-line p-0">
              {TIERS.map((t, i) => (
                <li key={t} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-3">
                  <span className="tabular-nums text-faint">{i + 1}</span>
                  <span>
                    <span className="text-text">{TIER_LABEL[t]}</span>: {TIER_WHAT[t]}
                  </span>
                </li>
              ))}
            </ol>
            <p className="m-0">
              For each vendor we open the documentation home, the API page, the pricing page and the changelog. A vendor is
              judged only when all four are recorded (found, or checked and absent). Sites that refuse automated requests stay
              untested; we do not work around bot walls.
            </p>
          </ReadingSection>

          <ReadingSection id="pipeline" title={title("pipeline")}>
            <ol className="m-0 list-none border-t border-line p-0">
              {PIPELINE.map((step, i) => (
                <li key={step.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-4">
                  <span className="tabular-nums text-faint">{i + 1}</span>
                  <p className="m-0">
                    <span className="text-text">{step.name}:</span> {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </ReadingSection>

          <ReadingSection id="judge-prompt" title={title("judge-prompt")} note={prompt.version ?? undefined}>
            <p className="m-0">
              This is the prompt the judge is given, as stored. Changing it means a new version; each judged vendor&apos;s page
              names the version it was judged with.
            </p>
            {/* Scrolls inside its well on screen, so it is a focusable, named region; on paper it runs in full. */}
            <pre
              tabIndex={0}
              role="region"
              aria-label="The judge prompt"
              className="type-code m-0 max-h-[36rem] overflow-auto whitespace-pre-wrap break-words border border-line bg-inset px-5 py-4 text-text print:max-h-none print:overflow-visible"
            >
              {prompt.text.split("\n").map((line, i) => {
                // A list line hangs its wrapped lines under its text, past the marker.
                const marker = line.match(/^(\s*)([-*]|\d+\.) /);
                return (
                  <span
                    key={i}
                    className={cx("block", marker && ((marker[2]?.length ?? 1) > 1 ? "pl-6 -indent-6" : "pl-4 -indent-4"))}
                  >
                    {line === "" ? "\u00a0" : line}
                  </span>
                );
              })}
            </pre>
          </ReadingSection>

          <ReadingSection id="score" title={title("score")}>
            <pre className="type-code m-0 overflow-x-auto border border-line bg-inset px-5 py-4 text-text">
              {`cell  = weight × (quality ÷ 10) × factor
score = round(100 × Σ cell ÷ Σ weight)`}
            </pre>
            <p className="m-0">Each verdict sets the factor; a task that does not apply is left out:</p>
            <VerdictLegend factors kinds={["full", "partial", "disputed", "none", "na"]} className="border-y border-line py-4" />
            <p className="m-0">
              Only applicable tasks count, in both sums. Untested vendors have no score and sort last. Scores are computed
              when the site is built and never stored.
            </p>
          </ReadingSection>

          <ReadingSection id="money" title={title("money")}>
            <p className="m-0">
              <span className="text-text">No vendor money.</span> No paid listings, sponsorships, affiliate links or referral
              fees. A vendor cannot pay to be listed, ranked, reviewed or left out.
            </p>
            <p className="m-0">
              <span className="text-text">Review.</span> A market shows “practitioner-reviewed” only after a practitioner has
              read it. Until then it says “not yet reviewed”.
            </p>
            <p className="m-0">
              <span className="text-text">Contest a verdict</span> with a public page that shows what the evidence missed.{" "}
              {contestUrl() ? (
                <TextLink href={contestUrl() ?? ""} tone="accent">
                  Open a contest
                </TextLink>
              ) : (
                <span className="text-faint">The form opens with the public repository.</span>
              )}
            </p>
            <p className="type-body-s m-0 text-faint">
              <span className="tabular-nums">{markets.length}</span> markets · <span className="tabular-nums">{listed}</span> vendors and
              public sources listed.
            </p>
          </ReadingSection>

          <ReadingSection id="terms" title={title("terms")} note="The same words /install, /llms.txt and the connector give an agent">
            <TermsList />
          </ReadingSection>

          <ReadingSection id="license" title={title("license")} note="Covers rankings/ only · draft, not attorney-reviewed">
            <figure className="m-0">
              <figcaption className="type-data mb-2 text-faint">rankings/DATA-LICENSE</figcaption>
              <pre className="type-code m-0 whitespace-pre-wrap break-words border border-line bg-inset px-5 py-4 text-muted">{license}</pre>
            </figure>
          </ReadingSection>
        </div>
      </div>
    </Container>
  );
}
