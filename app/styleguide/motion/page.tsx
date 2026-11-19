import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { pickStory } from "@/components/home/data";
import { HandoffSpecimen } from "@/components/motion/specimens/handoff-specimen";
import { SpecimenMark } from "@/components/motion/specimens/parts";
import { SceneSpecimen } from "@/components/motion/specimens/scene-specimen";
import { ScoreKey, ScoreSpecimen } from "@/components/motion/specimens/score-specimen";
import { SpecimenStyles } from "@/components/motion/specimens/specimen-styles";
import { StepsSpecimen } from "@/components/motion/specimens/steps-specimen";
import { TraceSpecimen, type TraceNode } from "@/components/motion/specimens/trace-specimen";
import { getRecordedAudit } from "@/components/run/data";
import { planLayout, type PlanLayout, type PlanNode } from "@/lib/compute/plan-layout";
import { DEFAULT_VARIANT } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
import { buildBoard } from "@/lib/demo/board";
import type { ParsedCheckOutcome } from "@/lib/demo/findings";
import { getDemoRun } from "@/lib/demo/load";
import { site } from "@/lib/site";

// /styleguide/motion: the motion kit (lib/motion, components/motion) playing on recorded
// data. Not in the sitemap and not indexed, like /styleguide. Everything drawn here is a
// specimen: the real pages draw the same data with components/ui and wrap it in
// SequenceRoot the way these do. docs/MOTION.md is the contract.

export const metadata: Metadata = {
  title: "Motion specimens",
  description: "The motion kit playing on the recorded run: the handoff, the score, a scene, the order of work and the generic rule.",
  robots: { index: false },
};

// One step from each stage, each waiting on the one before: the chain the trace follows.
function longestChain(layout: PlanLayout): PlanNode[] {
  const byNumber = new Map(layout.nodes.map((n) => [n.n, n]));
  const chain: PlanNode[] = [];
  let node = layout.nodes.find((n) => n.stage === layout.stages.length);
  while (node) {
    chain.unshift(node);
    const stageBefore = node.stage - 1;
    node = node.waitsOn.map((k) => byNumber.get(k)).find((p) => p?.stage === stageBefore);
  }
  return chain;
}

const OUTCOME_ORDER: ParsedCheckOutcome[] = ["clear", "finding", "unverified", "not-applicable", "not-checked"];

function Section({ id, title, children, intro, facts }: { id: string; title: string; intro: ReactNode; facts: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="mt-16 md:mt-24">
      <h2 id={`${id}-h`} className="type-title-l m-0 text-text">
        {title}
      </h2>
      <p className="type-body m-0 mt-3 max-w-[68ch] text-muted">{intro}</p>
      <div className="mt-8">{children}</div>
      <p className="type-body-s m-0 mt-4 max-w-[68ch] text-faint">{facts}</p>
    </section>
  );
}

export default function MotionSpecimens() {
  const run = getDemoRun();
  const corpus = getCorpus();
  const board = buildBoard(run, corpus.playbooks);
  const scene = board.find((s) => s.id === "run");
  if (!scene) throw new Error('The recorded run has no scene "run".');
  const story = pickStory(scene);
  const audit = getRecordedAudit();

  // The playbook the recorded scene works through, for the order-of-work trace.
  const slug = /^pcre run done (\S+)\s/.exec(story.own.command)?.[1];
  const playbook = corpus.playbooks.find((p) => p.slug === slug);
  if (!playbook) throw new Error(`The recorded run names playbook "${slug}", which is not in the catalog.`);
  const chain: TraceNode[] = longestChain(planLayout(playbook, DEFAULT_VARIANT)).map((n) => ({ n: n.n, stage: n.stage, title: n.title, person: n.side === "person" }));

  const scenes = run.scenes.map((s) => ({ id: s.id, title: s.title, summary: s.summary, steps: s.steps.length, refused: s.steps.filter((x) => x.exit === 1).length }));
  const outcomes = OUTCOME_ORDER.filter((o) => audit.findings.checks.some((c) => c.outcome === o));

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 pt-10 pb-16 md:px-10 md:pt-16 lg:px-14">
      <SpecimenStyles />
      <nav aria-label="Breadcrumb" className="type-label text-faint">
        <Link href="/styleguide" className="text-accent-strong underline underline-offset-4 hover:text-text">
          Styleguide
        </Link>{" "}
        / Motion
      </nav>
      <h1 className="type-page m-0 mt-4 text-text">Motion specimens</h1>
      <p className="type-lede m-0 mt-4 max-w-[68ch] text-muted">
        These are specimens, not pages of the site. Each one plays the motion kit on the recorded run, with stand-in marks drawn for this page only.
      </p>
      <p className="type-body m-0 mt-4 max-w-[68ch] text-muted">
        The run is a recording of the engine on {run.firm}, a fictional firm, made on <time dateTime={run.recordedOn}>{run.recordedOn}</time>.
        {!site.engineReleased && " The engine is not released yet."} Nothing here is staged: every step, title and outcome is the recording’s or the catalog’s. With
        scripts off, or when you ask your device for less motion, each drawing is simply finished.
      </p>

      <Section
        id="handoff"
        title="The handoff"
        intro="The one authored sequence. Your agent does a step that is its own, then tries a person’s step. The engine refuses it, and the step is recorded in the person’s name once they say it’s done."
        facts="Plays once, when half of it is in view. A click or a key press inside it ends it. Pause while it plays, Replay after."
      >
        <HandoffSpecimen rows={story} sceneTitle={scene.title} sceneSteps={scene.rows.length} firm={run.firm} recordedOn={run.recordedOn} href={`/run#${scene.id}`} />
        <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-8 gap-y-2 p-0" aria-label="Key to the drawing">
          <li className="type-label flex items-center gap-2 text-muted">
            <SpecimenMark person={false} />
            Your agent’s step
          </li>
          <li className="type-label flex items-center gap-2 text-muted">
            <SpecimenMark person />
            A person’s step has a cut corner
          </li>
          <li className="type-label flex items-center gap-2 text-muted">
            <span className="sp-key-line" aria-hidden="true" />
            The property line, between your agent’s side and a person’s
          </li>
          <li className="type-label text-muted">The red cloud marks the step the engine refused</li>
        </ul>
      </Section>

      <Section
        id="score"
        title="The score"
        intro="The finished audit’s boxes ink by outcome: the clear checks, then the findings, then the unverified one. The figure does not count up."
        facts="Plays once, when half of it is in view, in under 1.2 seconds."
      >
        <ScoreSpecimen doc={audit.findings} firm={audit.firm} recordedOn={audit.recordedOn} />
        <div className="mt-4">
          <ScoreKey outcomes={outcomes} />
        </div>
      </Section>

      <Section
        id="steps"
        title="The generic rule"
        intro="Any list can be inked in order: each step’s rule is drawn, then the step goes from pencil to ink. These five rows are the five scenes of the recorded run."
        facts="No named choreography: data-seq-step on each row, data-draw on its rule, data-ink on its words."
      >
        <StepsSpecimen rows={scenes} />
      </Section>

      <Section
        id="scene"
        title="A scene, started by you"
        intro="On the run board nothing moves until you ask. Play this scene and its rows ink in the order the engine recorded them; the refusal draws its cloud, and the connector draws to the row where a person picks it up."
        facts="Starts only from its control. This is the first scene of the recording, in one column."
      >
        <SceneSpecimen title={scene.title} rows={scene.rows} firm={run.firm} recordedOn={run.recordedOn} />
      </Section>

      <Section
        id="trace"
        title="The order of work"
        intro={`One line traces the longest chain of “${playbook.title}”, the playbook the recorded scene works through, stage by stage. At each person’s step the line holds a beat.`}
        facts="Plays once, when half of it is in view. Replay after."
      >
        <TraceSpecimen nodes={chain} />
      </Section>
    </div>
  );
}
