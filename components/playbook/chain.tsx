import Link from "next/link";
import type { ReactNode } from "react";
import { Tag } from "@/components/chips";
import { Icon } from "@/components/ui";

/** `only`: "JV only" for a written record that is not written for every structure (onlyLabel); null or absent otherwise. */
export type ChainRecord = { slug: string; title: string; depth: "full" | "outline"; only?: string | null };

// Before and after, as two ruled lists side by side: the records this one needs first and
// what it uses from them, then the records that come next and what it hands them. The
// record itself is the page, so it is not drawn again between them. A written record is a
// plain row; an outlined one carries the dashed "Outline" chip, the site's one mark for
// "not written yet"; one written for some structures only says which in a solid chip
// ("JV only"), so a reader with another structure knows before following it.

function Records({ records, none }: { records: ChainRecord[]; none: string }) {
  if (records.length === 0) return <p className="type-body-s m-0 border-b border-line py-3 text-muted">{none}</p>;
  return (
    <ul className="m-0 list-none p-0">
      {records.map((r) => (
        <li key={r.slug} className="border-b border-line">
          <Link href={`/playbooks/${r.slug}`} className="group flex min-h-11 items-center justify-between gap-4 py-3 text-text no-underline">
            <span className="type-body-s min-w-0 font-medium group-hover:underline">{r.title}</span>
            <span className="flex flex-none items-center gap-3 text-faint group-hover:text-text">
              {r.depth === "outline" && <Tag dashed>Outline</Tag>}
              {r.only && <Tag>{r.only}</Tag>}
              <Icon name="arrow-right" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Side({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="type-title-s m-0 border-b border-line-strong pb-3 text-text">{title}</h3>
      {children}
    </div>
  );
}

function Things({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="type-body-s m-0 mt-3 text-muted">
      <span className="type-label mr-2 text-faint">{label}</span>
      {names.join(", ")}
    </p>
  );
}

export function BeforeAfterChain({
  requires,
  consumes,
  produces,
  next,
}: {
  requires: ChainRecord[];
  consumes: string[];
  produces: string[];
  next: ChainRecord[];
}) {
  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
      <Side title="What it needs">
        <Records records={requires} none="No other record first." />
        <Things label="Uses" names={consumes} />
      </Side>
      <Side title="What comes next">
        <Records records={next} none="No record lists this one as its prerequisite yet." />
        <Things label="Produces" names={produces} />
      </Side>
    </div>
  );
}
