import type { Metadata } from "next";
import { ButtonLink, Container, PageHead } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

// The three best ways on from an address that is not here. Each says what it is for, so the
// reader picks by what they wanted, not by a label. The first is the one filled control on
// the page; it opens the search palette with the words of the address already typed
// (data-search-open="path", read by components/search-palette.tsx), and without scripts it is
// a plain link to the search page.
const WAYS = [
  {
    title: "Looking for a record by name?",
    line: "Playbooks, scenarios, calculators, rule cards, documents and the software rankings are in one index.",
    href: "/search",
    action: "Search the catalog",
    search: true,
  },
  {
    title: "Want the steps?",
    line: "The playbooks go step by step, from forming the firm to buying a property, and say who does each step.",
    href: "/playbooks",
    action: "See the playbooks",
    search: false,
  },
  {
    title: "Not sure where to start?",
    line: "The home page has the two doors: start a firm, or audit the firm you already run.",
    href: "/",
    action: "Go to the home page",
    search: false,
  },
] as const;

// Not found: says what happened, then the ways on as three ruled rows. A server component
// with plain links, because Next sends this file with every route.
export default function NotFound() {
  return (
    <Container>
      <PageHead title="Page not found." lede="That address is not on this site. Here are the three best ways on." />
      <ul className="m-0 mt-10 max-w-4xl list-none border-t border-line-strong p-0">
        {WAYS.map((w, i) => (
          <li key={w.href} className="grid gap-x-10 gap-y-4 border-b border-line py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <h2 className="type-title-s m-0 text-text">{w.title}</h2>
              <p className="type-body-s measure m-0 mt-1 text-muted">{w.line}</p>
            </div>
            <ButtonLink
              href={w.href}
              variant={i === 0 ? "primary" : "secondary"}
              data-search-open={w.search ? "path" : undefined}
              className="justify-between justify-self-start md:w-56"
            >
              {w.action}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </Container>
  );
}
