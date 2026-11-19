import type { Metadata } from "next";
import {
  DOC_LABEL,
  OpenCommands,
  RunBoard,
  RunDocuments,
  RunStyles,
  SCENE_PANEL,
  SceneNote,
  SceneSwitch,
  SourcesElsewhere,
  ownerPhrase,
  runTotals,
  sceneDocuments,
  type RunDocument,
  type SceneTab,
} from "@/components/run";
import { ButtonLink, Callout, Container, Disclosure, PageHead, RoleMark, Sheet, SheetPart, TextLink, TitleBlock, TitleCell, type PageFact } from "@/components/ui";
import { getDemoRun } from "@/lib/demo/load";
import { site } from "@/lib/site";
import type { DemoScene } from "@/lib/schemas/demo";

export const metadata: Metadata = {
  title: "A recorded run",
  description:
    "The engine run on a fictional example firm, step by step: what the agent did, where the engine refused it, and what a person recorded. Every command and its real output, and the files it wrote.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const joinWords = (w: string[]) => (w.length < 2 ? (w[0] ?? "") : `${w.slice(0, -1).join(", ")} and ${w.at(-1)}`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// A space a line never breaks at.
const NBSP = String.fromCharCode(0xa0);

// A name in the recording stays a name ("Alex Example"); a role passed with --by reads as one ("The CPA").
const isName = (by: string) => /[A-Z]/.test(by);
const personName = (by: string) => (isName(by) ? by : capital(ownerPhrase(by)));

function sceneCounts(scene: DemoScene) {
  return {
    steps: scene.steps.length,
    refused: scene.steps.filter((s) => s.exit === 1).length,
  };
}

// Who ran a scene's commands, in the order they first appear: the agent, and each person as recorded.
function sceneCast(scene: DemoScene): { agent: boolean; people: string[] } {
  return {
    agent: scene.steps.some((s) => s.by === null),
    people: [...new Set(scene.steps.flatMap((s) => (s.by === null ? [] : [personName(s.by)])))],
  };
}

// "the findings report and a sheet for the principal", from the files themselves.
function filesInWords(docs: RunDocument[]): string {
  return joinWords(docs.map((d) => (d.kind === "findings" ? "the findings report" : d.kind === "calendar" ? "the calendar file" : `a sheet for ${ownerPhrase(d.doc.owner)}`)));
}

const fileName = (path: string) => path.split("/").at(-1) ?? path;

// What this recording is, said once and following site.engineReleased: the refusals are the
// engine's, and the hosted connector gives an agent the playbooks without refusing anything.
// The engine's state is the first sentence and stays in the head at every width. The
// sentence about the connector sits with it from 768 px; on a phone it closes the page,
// above the way on to the playbooks, so the board starts a screen sooner.
const CONNECTOR_NOTE = "The hosted connector gives your agent the playbooks, and every step tells your agent who does it and where to stop.";

function WhatThisIs() {
  return (
    <Callout title="What you are looking at">
      <div className="type-body-s grid gap-2">
        <p className="m-0">
          {site.engineReleased ? (
            <>
              The engine runs on your own machine
              {site.repoUrl && (
                <>
                  {" "}
                  (
                  <TextLink href={site.repoUrl} tone="accent">
                    get it from the repository
                  </TextLink>
                  )
                </>
              )}
              . It refuses the agent at a person&rsquo;s step; the name it then records is the agent&rsquo;s word that the person did it,
              not proof.
            </>
          ) : (
            <>This is the local engine. It is not released yet.</>
          )}
        </p>
        <p className="m-0 hidden md:block">{CONNECTOR_NOTE}</p>
      </div>
    </Callout>
  );
}

export default function RunPage() {
  const run = getDemoRun();
  const totals = runTotals(run);
  // One wording for a count wherever it is said: "Recorded by a person" here and on each sheet.
  const facts: PageFact[] = [
    { label: totals.refused === 1 ? "step the engine refused" : "steps the engine refused", value: totals.refused, lead: true },
    { label: "Steps", value: totals.commands },
    { label: "Recorded by a person", value: totals.byPeople },
    { label: "Date", value: <time dateTime={run.recordedOn}>{run.recordedOn}</time>, mono: true },
  ];
  // The people named in the recording ("Alex Example"); a role passed with --by ("cpa") is not a name.
  const people = [...new Set(run.scenes.flatMap((s) => s.steps).flatMap((s) => (s.by && isName(s.by) ? [s.by] : [])))];
  // A scene's counts ("7 steps · 1 refused") are said once at any width: on its tab where the
  // tabs are one row, in its sheet head where they are not (see SceneNote). A narrow tab
  // breaks the note between its two counts, never inside one.
  const scenes = run.scenes.map((scene) => {
    const counts = sceneCounts(scene);
    const note = [plural(counts.steps, "step"), counts.refused ? `${counts.refused} refused` : null].flatMap((part) => (part ? [part.replace(/ /g, NBSP)] : [])).join(" · ");
    return { scene, counts, note, cast: sceneCast(scene), docs: sceneDocuments(scene) };
  });
  const tabs: SceneTab[] = scenes.map(({ scene, note }) => ({ id: scene.id, title: scene.title, note }));
  // The audit a scene's findings report belongs to, by the report's own id.
  const auditOf = (docs: RunDocument[]) => docs.flatMap((d) => (d.kind === "findings" ? [d.doc.auditId] : []))[0] ?? null;

  return (
    // On paper the page's own margins are the gutter, which keeps the board on two lanes.
    <Container className="print:px-0">
      <RunStyles />
      <PageHead
        title="A recorded run"
        lede={
          <>
            The engine, run on a fictional firm, {run.firm}
            {people.length > 0 && <>; {joinWords(people)} {people.length === 1 ? "is" : "are"} fictional too</>}. Your agent does its own
            steps. When it tries a person&rsquo;s step, the engine refuses, and the step is recorded in the person&rsquo;s name once they say it&rsquo;s
            done.
          </>
        }
        aside={<WhatThisIs />}
        facts={facts}
        factsLabel="About this recording"
      >
        {/* Paper holds the boards. What it leaves out, and where that is, is said before the first one. */}
        <p className="type-body-s measure m-0 mt-4 hidden text-muted print:block">
          On paper: the {plural(run.scenes.length, "scene")} as boards. Each step&rsquo;s command, the engine&rsquo;s output and the files
          it wrote are on the page itself, {site.url.replace(/^https?:\/\//, "")}/run.
        </p>
      </PageHead>

      {/* ---------- The scenes, one sheet at a time ---------- */}
      <SceneSwitch tabs={tabs} label="Scenes of the recorded run" className="mt-8 md:mt-12">
        {scenes.map(({ scene, counts, note, cast, docs }, i) => {
          const next = run.scenes[i + 1];
          // An audit still under way is mostly unanswered checks: its report keeps the checks
          // behind a fold. The finished audit's report is drawn in full.
          const unfinished = docs.some((d) => d.kind === "findings" && d.doc.checks.some((ch) => ch.outcome === "not-checked"));
          // A later scene's report of the same audit lists the same rules and sources for
          // every check, so an earlier report points to it instead of drawing them twice.
          const audit = auditOf(docs);
          const later = audit === null ? undefined : scenes.slice(i + 1).findLast((x) => auditOf(x.docs) === audit);
          return (
            <section key={scene.id} id={scene.id} aria-labelledby={`${scene.id}-title`} className={`${SCENE_PANEL} scroll-mt-40 md:scroll-mt-24`}>
              <Sheet
                as="div"
                level={2}
                title={scene.title}
                titleId={`${scene.id}-title`}
                note={<SceneNote n={i + 1} of={run.scenes.length} note={note} />}
                flush
                titleBlock={
                  // What the sheet is, so a printed scene names itself: whose firm, when, the
                  // files it wrote and who ran its steps. Its counts are on its tab, or in
                  // its head. One band from 640 px, which is also how wide a sheet of paper is.
                  <TitleBlock label={`Title block: ${scene.title}`} className="grid-cols-2 sm:grid-cols-[minmax(0,5fr)_auto_minmax(0,6fr)_minmax(0,6fr)]">
                    <TitleCell label="Firm" className="col-span-2 sm:col-span-1">
                      {run.firm}, fictional
                    </TitleCell>
                    <TitleCell label="Date" mono>
                      <time dateTime={run.recordedOn} className="whitespace-nowrap">
                        {run.recordedOn}
                      </time>
                    </TitleCell>
                    <TitleCell label="Files written" mono={docs.length > 0}>
                      {docs.length === 0
                        ? "None"
                        : docs.map((d) => (
                            <span key={d.path} className="block">
                              {fileName(d.path)}
                            </span>
                          ))}
                    </TitleCell>
                    <TitleCell label="Run by" className="col-span-2 sm:col-span-1">
                      <span className="flex flex-wrap gap-x-4 gap-y-1">
                        {cast.agent && <RoleMark mode="A" label="Your agent" size="sm" className="type-body-s font-medium" />}
                        {cast.people.map((p) => (
                          <RoleMark key={p} mode="H" label={p} size="sm" className="type-body-s font-medium" />
                        ))}
                      </span>
                    </TitleCell>
                  </TitleBlock>
                }
                footer={
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                    <p className="m-0">
                      A person&rsquo;s step has a cut corner.{counts.refused > 0 && " The red cloud marks a step the engine refused."}
                    </p>
                    <OpenCommands count={counts.steps} />
                  </div>
                }
              >
                <SheetPart className="py-4">
                  <p className="type-body measure m-0 text-muted">{scene.summary}</p>
                </SheetPart>
                <RunBoard scene={scene.id} className="border-t border-line" />
              </Sheet>

              {/* In a wrapper of its own: a fold that sits directly in the URL's target is shown
                  open by the fold's own rules, and this scene is the target whenever it is the
                  one in view. On paper the line that names the files prints and the sheets do not. */}
              {docs.length > 0 && (
                <div className="border-b border-line-strong">
                  <Disclosure summaryClassName="type-body-s font-medium" bodyClassName="pb-6 pt-1 print:hidden" summary={`The ${plural(docs.length, "file")} it wrote: ${filesInWords(docs)}`}>
                    <p className="type-body-s m-0 mb-4 text-muted">Drawn from the files in the firm folder on the operator&rsquo;s machine. {DOC_LABEL}</p>
                    <RunDocuments
                      docs={docs}
                      checksCollapsed={unfinished}
                      sourcesAt={later ? <SourcesElsewhere href={`#${later.scene.id}`} where={`the report in “${later.scene.title}”`} /> : undefined}
                      docLabel={false}
                    />
                  </Disclosure>
                </div>
              )}

              {/* A plain anchor: the next scene is shown by :target, which only a real jump to the fragment sets. */}
              {next && (
                <p className="type-body-s m-0 mt-4 text-muted print:hidden">
                  Next scene:{" "}
                  <a href={`#${next.id}`} className="link">
                    {next.title}
                  </a>
                </p>
              )}
            </section>
          );
        })}
      </SceneSwitch>

      {/* ---------- Where to go next ---------- */}
      <div className="mb-6 mt-10 md:mt-12">
        <p className="type-body-s measure m-0 mb-4 text-muted md:hidden">{CONNECTOR_NOTE}</p>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <ButtonLink href="/playbooks">Read the playbooks</ButtonLink>
          <ButtonLink href="/audit" variant="secondary">
            See the audit
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}
