import type { Metadata } from "next";
import { CheckSchedule, CoverageTiles, LookupsPanel, findingStakes, getAuditPage } from "@/components/audit";
import { NotLiveChip, PromptCard } from "@/components/connect";
import { CalendarSheet, FindingsReport, Fold, OwnerSheet, RunStyles, getRecordedAudit, getRecordedCalendar, sceneDocuments } from "@/components/run";
import { ButtonLink, Callout, Container, PageHead, SheetHeader, TextLink } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Audit a firm",
  description:
    "Audit the firm you already run: cited checks of the entity's standing with the state, the tax office and its own documents. Your AI agent checks what it can, a person confirms the rest, and you get a score, a findings file, a sheet for each person with something to fix, and a calendar.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// A catalog name inside a sentence: "Certificate of formation" reads "certificate of formation"; "EIN confirmation" stays.
const inSentence = (name: string) => (/^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);
// On paper a section heading stays with what it heads.
const KEEP = "print:break-after-avoid";

// The page leads with the result. Its order is what a firm's owner asks, in turn: what do I
// get (the finished audit: the report, a sheet for each person, the calendar), how do I
// start, what is checked, what does the agent do on its own (the lookup approval), and what
// is not covered. Each section takes a different interval, so the result and the handoff
// get the air and the lists do not.
//
// What is not available is said once each (decision D131): the engine's state above the
// finished audit, where its output first appears, and the connector's beside the one
// prompt box. Both follow lib/site.ts.
export default function AuditPage() {
  const { audit, prompt, coverage, approval } = getAuditPage();
  const recorded = getRecordedAudit();
  const calendar = getRecordedCalendar();
  const docs = sceneDocuments(recorded.scene);
  const findingsPath = docs.find((d) => d.kind === "findings")?.path;
  const sheetPath = (owner: string) => docs.find((d) => d.kind === "sheet" && d.doc.owner === owner)?.path;
  const stakes = findingStakes(audit, recorded.sheets);

  return (
    // On paper the page's own margins are the gutter.
    <Container className="print:px-0">
      <RunStyles />
      <PageHead
        id="audit-title"
        title="Audit the firm you already run."
        lede="Your AI agent checks the entity's standing with the state, the tax office and its own documents; a person confirms the rest. You get a score, a findings file, a sheet for each person with something to fix, and a calendar."
        actions={
          <ButtonLink href="#start" variant="secondary" arrow={false} className="print:hidden">
            Start your own audit
          </ButtonLink>
        }
        factsLabel="The audit"
        facts={[
          { label: `an agent verifies ${audit.agentChecks}, a person confirms ${audit.personChecks}`, value: plural(audit.checks, "check"), lead: true },
          { label: "Covers", value: audit.covers },
          {
            label: "Review",
            value: audit.lastVerified ? (
              <>
                {audit.reviewWord}, sources checked <time dateTime={audit.lastVerified}>{audit.lastVerified}</time>
              </>
            ) : (
              audit.reviewWord
            ),
          },
        ]}
      />

      {/* ---------- The finished audit: the result leads ---------- */}
      <section id="finished" aria-labelledby="finished-title" className="mt-10 md:mt-12">
        <SheetHeader id="finished-title" title="The finished audit" flush className={KEEP} />
        <Callout className="mb-6 mt-3">
          <p className="measure m-0">
            A recorded run of the local engine on a fictional firm, <time dateTime={recorded.recordedOn}>{recorded.recordedOn}</time>.
            {!site.engineReleased && (
              <> The engine is not released yet{site.connectorLive && "; with the connector, every check tells your agent who verifies it"}.</>
            )}{" "}
            The findings are made-up examples.{" "}
            <TextLink href="/run#audit-finished" tone="accent">
              Every command behind it, in the recorded run
            </TextLink>
          </p>
        </Callout>

        {/* In the report (components/run) the score's figure counts up once, its boxes ink by
            outcome (the M4 "score" sequence) and its findings come into focus. The sheet for each
            person with a finding, and the calendar, each come into focus once as they enter the
            screen (data-reveal, D224); min-w-0 keeps a wrapper from widening the grid. */}
        <div className="grid gap-6">
          <FindingsReport doc={recorded.findings} file={findingsPath} checksCollapsed docLabel={false} stakes={stakes} />

          {recorded.sheets.map((s) => (
            <div key={s.owner} data-reveal="" className="min-w-0">
              <OwnerSheet doc={s} file={sheetPath(s.owner)} docLabel={false} />
            </div>
          ))}

          {calendar && (
            <div data-reveal="" className="min-w-0">
              <CalendarSheet events={calendar.events} written={calendar.written} digest docLabel={false} />
            </div>
          )}
        </div>
      </section>

      {/* ---------- How to start: the sentence, and what works without it ---------- */}
      <section id="start" aria-labelledby="start-title" className="mt-16 md:mt-24">
        <SheetHeader id="start-title" title="Start your own audit" className={KEEP} />
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2 lg:items-start">
          {/* The page's one prompt box. Whether the connector is on is said here and nowhere
              else on the page: the chip beside the prompt. */}
          <div className="min-w-0 print:hidden">
            <PromptCard text={prompt} id="audit-prompt" aside={<NotLiveChip />} />
            <p className="type-body-s m-0 mt-3">
              <TextLink href="/connect?mode=audit" tone="accent">
                The steps for each agent
              </TextLink>
            </p>
          </div>
          <div className="min-w-0">
            <p className="type-body measure m-0 text-text">
              {site.connectorLive ? "Without the connector" : "Works today"}: copy the audit playbook into any AI chat. It needs no setup, and it
              tells your agent where to stop.
            </p>
            <p className="m-0 mt-4">
              <ButtonLink href={audit.href}>Open the audit playbook</ButtonLink>
            </p>
            {audit.reads.length > 0 && (
              <p className="type-body-s measure m-0 mt-6 text-muted">
                <span className="text-text">It reads from your own files:</span>{" "}
                {audit.reads.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <TextLink href={r.href} tone="muted">
                      {inSentence(r.name)}
                    </TextLink>
                  </span>
                ))}
                .
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---------- What gets checked ---------- */}
      <section id="checks" aria-labelledby="checks-title" className="mt-16 md:mt-24">
        <SheetHeader
          id="checks-title"
          title={`${audit.checks} checks. Each one says who verifies it.`}
          note={`${audit.cited} cited · ${plural(audit.practice, "common practice", "common practice")} · ${plural(audit.sources, "source")}`}
          flush
          className={KEEP}
        />
        <p className="type-body measure m-0 mb-6 mt-3 text-muted md:mb-8">
          A check records what is true and where the proof is. What is wrong becomes a finding, with who fixes it and by when. Each
          title opens the check on its playbook page.
        </p>
        <Fold summary={`The ${audit.checks} checks, with who verifies each`} className="border-y border-line-strong md:border-y-0">
          <CheckSchedule audit={audit} className="py-4 md:py-0" />
        </Fold>
      </section>

      {/* ---------- How lookups work: the handoff ---------- */}
      <section id="lookups" aria-labelledby="lookups-title" className="mt-16 md:mt-32">
        <SheetHeader id="lookups-title" title="One approval. No logins." className={KEEP} />
        <LookupsPanel audit={audit} approval={approval} />
      </section>

      {/* ---------- What it covers ---------- */}
      <section id="coverage" aria-labelledby="coverage-title" className="mb-6 mt-16 md:mt-24">
        <SheetHeader id="coverage-title" title="What it covers today, and what it does not." className={KEEP} />
        <CoverageTiles
          tiles={coverage}
          aside={
            <Callout>
              <p className="measure m-0">A score says how much was verified, not that the firm is compliant. Every score names what it does not cover.</p>
            </Callout>
          }
        />
      </section>
    </Container>
  );
}
