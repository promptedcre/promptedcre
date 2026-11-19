import Link from "next/link";
import { site } from "@/lib/site";
import { Container } from "./ui/container";
import { Wordmark } from "./ui/wordmark";

type FooterGroup = { label: string; links: ReadonlyArray<{ href: string; label: string }> };

// Every page of the site, in plain groups. The footer lists them all; the header's menu
// lists the ones its four sections leave out. "Scenarios" and "Software" are the owner's
// names for the situations and the rankings (D218); the routes stay.
export const FOOTER_GROUPS: readonly FooterGroup[] = [
  {
    label: "The catalog",
    links: [
      { href: "/playbooks", label: "Playbooks" },
      { href: "/situations", label: "Scenarios" },
      { href: "/audit", label: "Audit a firm" },
      { href: "/rules", label: "Rules" },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/calculators", label: "Calculators" },
      { href: "/rankings", label: "Software" },
      { href: "/rankings/methodology", label: "How software is scored" },
    ],
  },
  {
    label: "Reference",
    links: [
      { href: "/documents", label: "Public forms" },
      { href: "/artifacts", label: "Firm documents" },
      { href: "/run", label: "A recorded run" },
      { href: "/search", label: "Search" },
    ],
  },
  {
    label: "Start",
    links: [
      { href: "/", label: "Home" },
      { href: "/connect", label: "Connect your agent" },
    ],
  },
];

// The footer: the site's index, on plain ground, in the reading face throughout. The
// wordmark, the one line the site says about itself ("Not legal advice. Every step says
// where it comes from."), the two licenses as a sentence, and every page in four groups.
// The groups are one landmark ("Site"), each a list named by its own label, so a page has
// one more navigation region, not four. It sits under the status line
// (components/ui/status-line.tsx), which carries the rule above both, so the two read as one
// foot of the page.
export function SiteFooter() {
  return (
    <footer className="bg-bg">
      <Container>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pb-12 pt-10 md:gap-x-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] lg:pb-16">
          <div className="col-span-2 lg:col-span-1">
            <Wordmark className="min-h-11 text-lg" />
            <p className="type-body-s m-0 mt-2 max-w-xs text-muted">Not legal advice. Every step says where it comes from.</p>
            <p className="type-body-s m-0 mt-2 max-w-xs text-faint">
              <span className="whitespace-nowrap">Code {site.codeLicense}.</span> <span className="whitespace-nowrap">Content {site.contentLicense}.</span>
            </p>
            {/* D218: company icons are each company's own, shown beside its name. */}
            <p className="type-body-s m-0 mt-2 max-w-xs text-faint">Names and marks belong to their owners. No vendor pays to be listed.</p>
          </div>
          {/* The nav spans the four group tracks and repeats their gaps, so each group sits on the grid above. */}
          <nav aria-label="Site" className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-10 md:gap-x-10 lg:col-span-4 lg:grid-cols-4">
            {FOOTER_GROUPS.map((g, i) => (
              <div key={g.label} className="min-w-0">
                <p id={`site-foot-${i}`} className="type-label m-0 mb-1 text-text md:mb-2">
                  {g.label}
                </p>
                <ul aria-labelledby={`site-foot-${i}`} className="type-body-s m-0 list-none p-0">
                  {g.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="inline-flex min-h-11 items-center text-muted no-underline hover:text-text hover:underline md:min-h-8">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </Container>
    </footer>
  );
}
