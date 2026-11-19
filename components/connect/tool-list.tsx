import { cx } from "@/components/ui";
import { TOOLS } from "@/lib/mcp/server";

// One plain line per tool, in the site's words. A tool added to lib/mcp/server.ts without a
// line here shows the first sentence of its own description, so the list never drops a tool.
const PLAIN: Record<string, string> = {
  status: "What the catalog covers: its counts, structures, jurisdictions and content date.",
  search: "Finds playbooks, scenarios, calculators, rule cards, artifacts, public documents, software markets and the vendors in them.",
  list_playbooks: "Lists the playbooks, scenarios and audits, with agent share, time and review status.",
  get_playbook: "A playbook's steps in order: who does each one, the approvals, the rules and the sources.",
  match_situation: "Takes what happened and returns the closest situations, ranked, with their urgency.",
  get_rule: "One rule card: the rule in plain words, its legal citation and its sources.",
  get_artifact: "One artifact: what the document or record is, and its fields.",
  list_documents: "The public forms and official pages operators use, with links.",
  get_market: "A software market, ranked on how well an agent can operate each vendor's product.",
  get_vendor: "One vendor's verdicts in a software market, each with its evidence.",
  calc_waterfall: "A distribution waterfall: preferred return, return of capital, catch-up and promote.",
  calc_debt: "Sizes a loan under coverage, loan-to-value and debt-yield limits.",
  calc_returns: "IRR, equity multiple and cash-on-cash, with an exit-cap and growth grid.",
  calc_deadlines: "Deadlines that follow from rule cards. Every date is flagged for review.",
  calc_run: "Every other calculator, by id. With no id it lists them.",
  get_firm_file_spec: "The format of the firm folder on your machine. The folder itself is never sent.",
};

const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0] ?? s;
const plainLine = (t: { name: string; description: string }) => PLAIN[t.name] ?? firstSentence(t.description);

type Group = { key: string; label: string; test: (name: string) => boolean };
const GROUPS: Group[] = [
  { key: "math", label: "Calculators", test: (n) => n.startsWith("calc_") },
  { key: "rankings", label: "Software rankings", test: (n) => n === "get_market" || n === "get_vendor" },
  { key: "firm", label: "The firm folder", test: (n) => n.includes("firm") },
  { key: "catalog", label: "The catalog", test: () => true },
];
const ORDER = ["catalog", "math", "rankings", "firm"];

function toolGroups() {
  const by = new Map<string, { label: string; tools: typeof TOOLS }>();
  for (const t of TOOLS) {
    const g = GROUPS.find((x) => x.test(t.name)) ?? GROUPS[GROUPS.length - 1]!;
    const entry = by.get(g.key) ?? { label: g.label, tools: [] };
    entry.tools.push(t);
    by.set(g.key, entry);
  }
  return ORDER.flatMap((k) => {
    const e = by.get(k);
    return e ? [{ key: k, ...e }] : [];
  });
}

// ToolList: every tool on the hosted connector by name, with one plain line each, grouped
// (the catalog, calculators, rankings, the firm folder). A ruled index on plain ground, in
// two columns from 768 px: a group's name over its rows, each row the tool's name (an id, so
// it is set in the mono face) and what it does in the site's words. Counts come from TOOLS.
export function ToolList({ className }: { className?: string }) {
  const groups = toolGroups();
  return (
    <div className={cx("grid gap-x-12 md:grid-cols-2", className)}>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className={cx("min-w-0", g.key === "catalog" && "md:row-span-3")}>
          <h3 className="type-label m-0 flex items-baseline justify-between gap-4 border-b border-line-strong pb-2 pt-6 text-text">
            <span>{g.label}</span>
            <span className="type-body-s text-faint">
              {g.tools.length} {g.tools.length === 1 ? "tool" : "tools"}
            </span>
          </h3>
          <ul className="m-0 list-none p-0">
            {g.tools.map((t) => (
              <li key={t.name} className="border-b border-line py-3">
                <code className="type-data text-text [overflow-wrap:anywhere]">{t.name}</code>
                <p className="type-body-s m-0 mt-1 text-muted">{plainLine(t)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
