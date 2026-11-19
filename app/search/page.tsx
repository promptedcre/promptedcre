import type { Metadata } from "next";
import { Container, PageHead, TextLink } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { SearchBrowse } from "@/components/library/search-browse";
import { indexLine } from "@/components/library/search-shared";
import { getCorpus } from "@/lib/content/load";
import { getRankings } from "@/lib/rankings/load";
import { buildSearchIndex } from "@/lib/search/index";

export const metadata: Metadata = {
  title: "Search",
  description: "Search the playbooks, scenarios, calculators, rule cards, artifacts, public documents and software rankings in one index.",
};

// The head names what the index holds (every kind, the rankings as one) and who else reads
// it. That second sentence holds whether or not the connector is switched on: it speaks of a
// connected agent, never of the visitor's own, and links to the page that says the state.
export default function SearchPage() {
  const docs = buildSearchIndex(getCorpus(), getRankings());

  return (
    <Container>
      <PageHead
        title="Search"
        lede={
          <>
            Playbooks, scenarios, calculators, rule cards, artifacts, public documents and the software rankings, in one index. A{" "}
            <TextLink href="/connect" tone="muted">
              connected agent
            </TextLink>{" "}
            searches the same index.
          </>
        }
      />
      <div className="mt-8">
        <SearchBox indexed={indexLine(docs)}>
          <SearchBrowse docs={docs} className="mt-16" />
        </SearchBox>
      </div>
    </Container>
  );
}
