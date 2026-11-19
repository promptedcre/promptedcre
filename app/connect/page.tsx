import type { Metadata } from "next";
import { ConnectSetup, SitePlan, SiteStatus, TermsList, ToolList, doorNotes } from "@/components/connect";
import { ButtonLink, Container, Disclosure, PageHead, SheetHeader, TextLink } from "@/components/ui";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { TOOLS } from "@/lib/mcp/server";
import { status } from "@/lib/mcp/tools";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Connect your agent",
  description:
    "Give your AI agent the PromptedCRE playbooks: pick what you want, pick your agent, and follow its numbered steps. Read-only tools, no account, and your firm's files stay on your machine.",
};

// The page's job: add the connector once, paste one sentence. It reads in four parts, and
// they do not get equal air. The head says what this is and, once, what is not switched on
// yet. The setup follows at once: one form (what you want, your agent) and the chosen
// agent's numbered steps. Then, a chapter apart, what the agent gets (said in plain words in
// the heading; the tools by name are developer facts, folded and labelled "For your agent"),
// and the page's one drawing: the site plan of what it never gets.
export default function ConnectPage() {
  const corpus = getCorpus();
  const notes = doorNotes(corpus.playbooks);
  // What a connected agent should answer, from the status tool's own payload.
  const s = status();
  const records = s.counts.playbooks + s.counts.situations + s.counts.audits;
  const answer = `${records} records listed, ${s.counts.writtenInFull} written in full, ${siteFacts(corpus).coverage.label}, content dated ${s.contentDate}`;

  return (
    <Container>
      <PageHead
        id="connect-title"
        title="Connect your agent."
        lede="Your agent reads the playbooks through one connector. Add it once, then paste one sentence. No account, no sign-in, and your firm's files never leave your machine."
        // While the connector is off, the actions that work today; once it is on, the steps below
        // are the action. Under them, in both states, the path that needs no connector at all.
        actions={
          <>
            {!site.connectorLive && (
              <>
                <ButtonLink href="/run">Watch a recorded run</ButtonLink>
                <ButtonLink href="/playbooks" variant="secondary">
                  Read the playbooks
                </ButtonLink>
              </>
            )}
            <p className="type-body-s measure m-0 basis-full text-muted">
              No connector? Open any{" "}
              <TextLink href="/playbooks" tone="accent">
                written playbook
              </TextLink>{" "}
              and copy its file into any AI chat. It works with no setup, and it tells your agent where to stop.
            </p>
          </>
        }
        aside={<SiteStatus />}
      />

      <section id="setup" aria-labelledby="setup-title" className="mt-12 scroll-mt-24">
        <h2 id="setup-title" className="sr-only">
          Set up your agent
        </h2>
        <ConnectSetup rootId="connect-setup" notes={notes} toolCount={TOOLS.length} answer={answer} />
      </section>

      <section id="tools" aria-labelledby="tools-title" className="mt-20 scroll-mt-24 md:mt-32">
        <SheetHeader id="tools-title" title={`${TOOLS.length} read-only tools. Nothing it can change.`} note="Each tool reads the public catalog" flush />
        <Disclosure
          summary={`For your agent: the ${TOOLS.length} tools by name, and what each one does`}
          className="mt-6 border-y border-line"
          bodyClassName="pb-8"
        >
          <ToolList />
        </Disclosure>
      </section>

      <SitePlan id="never" titleId="never-title" className="mt-16 scroll-mt-24 md:mt-24" />

      <section id="terms" aria-labelledby="terms-title" className="mb-8 mt-16 scroll-mt-24 md:mt-24">
        <SheetHeader id="terms-title" title="The terms your agent reads." note="The same words /install and the connector give it" flush />
        <TermsList className="mt-6" />
      </section>
    </Container>
  );
}
