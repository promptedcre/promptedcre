import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { computeDeadlines, deadlinesInput } from "../calculators/deadlines";
import { debtInput, sizeDebt } from "../calculators/debt";
import { getModule, MODULE_IDS } from "../calculators/modules";
import { returnsInput, runReturns } from "../calculators/returns";
import { runWaterfall, waterfallInput } from "../calculators/waterfall";
import { CONTENT_DIR, getCorpus } from "../content/load";
import { effortText, elapsedText } from "../compute/summary";
import { computeMetrics, nearestPredecessors } from "../compute/metrics";
import { applies, DEFAULT_JURISDICTIONS, DEFAULT_VARIANT, isResearched, type Variant } from "../compute/variant";
import { REVIEW_LABEL } from "../labels";
import { getRankings } from "../rankings/load";
import { marketView } from "../rankings/state";
import { JURISDICTIONS, PROPERTY_TYPES, STRUCTURES, jurisdiction, propertyType, structure } from "../schemas/common";
import { firmArtifacts, firmAudits, firmCalendar, firmDecisions, firmLogEvent, firmProfile, firmProgress } from "../schemas/firm";
import { PHASES, PLAYBOOK_KINDS } from "../schemas/playbook";
import { isoDate } from "../schemas/common";
import { buildSearchIndex, searchIndex, SEARCH_KINDS, tokens, type SearchDoc } from "../search/index";
import { site, terms } from "../site";
import { coverageNote } from "./coverage";

// What each MCP tool returns. Pure functions over the content and rankings
// files, so they can be tested without a server. No tool accepts a firm file,
// and nothing here writes or logs; server.ts logs each call's tool and outcome.

export const SERVER_VERSION = "0.1.0";

export class ToolError extends Error {}

// A full https address for a page of this site (CH06), so every record a tool returns
// carries a link an agent can cite. Built from site.url, a launch value (DEPLOY.md §5); an
// address that is already absolute, such as a public form's, is kept.
export const pageUrl = (p: string): string => (/^https?:\/\//.test(p) ? p : `${site.url.replace(/\/+$/, "")}${p}`);

let index: SearchDoc[] | null = null;
function searchDocs(): SearchDoc[] {
  index ??= buildSearchIndex(getCorpus(), getRankings());
  return index;
}

function contentDate(): string {
  const dates = getCorpus()
    .playbooks.map((p) => p.lastVerified)
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates.at(-1) ?? "";
}

// Calculator id to the tool an agent calls for it. Exported so the calculator pages name the same tool.
export const CALC_TOOL: Record<string, string> = {
  "waterfall-promote": "calc_waterfall",
  "debt-sizing": "calc_debt",
  "returns-sensitivity": "calc_returns",
  "deadline-calendar": "calc_deadlines",
  ...Object.fromEntries(MODULE_IDS.map((id) => [id, "calc_run"])),
};

export function status() {
  const c = getCorpus();
  const r = getRankings();
  const full = c.playbooks.filter((p) => p.depth === "full");
  return {
    name: "PromptedCRE",
    version: SERVER_VERSION,
    // The terms, from their one source (CH04).
    terms: terms(),
    contentDate: contentDate(),
    counts: {
      playbooks: c.playbooks.filter((p) => p.kind === "process").length,
      situations: c.playbooks.filter((p) => p.kind === "situation").length,
      audits: c.playbooks.filter((p) => p.kind === "audit").length,
      writtenInFull: full.length,
      rules: c.rules.length,
      artifacts: c.artifacts.length,
      documents: c.documents.length,
      calculators: c.calculators.filter((x) => x.status === "live").length,
      markets: r.markets.length,
      vendors: r.markets.reduce((n, m) => n + m.vendors.length, 0),
    },
    calculators: c.calculators
      .filter((x) => x.status === "live")
      .map((x) => ({ tool: CALC_TOOL[x.id] ?? null, name: x.name, what: x.what })),
    markets: r.markets.map((m) => ({ id: m.market.id, name: m.market.name })),
    coverage: {
      structures: [...STRUCTURES],
      propertyTypes: [...PROPERTY_TYPES],
      jurisdictions: [...JURISDICTIONS],
      note: "Federal and Texas throughout; Delaware where entity formation is the subject.",
    },
    notAdvice: "Playbooks describe common practice and cite their sources. They are not legal, tax or investment advice.",
  };
}

export const searchArgs = z.object({
  query: z.string().min(1).max(200).describe("Words to look for, e.g. 'form d deadline'."),
  kinds: z.array(z.enum(SEARCH_KINDS)).optional().describe("Limit to these record kinds."),
  limit: z.number().int().min(1).max(25).optional().describe("Maximum hits. Default 10."),
});

export function search(args: z.infer<typeof searchArgs>) {
  const hits = searchIndex(searchDocs(), args.query, args.kinds ?? SEARCH_KINDS, args.limit ?? 10).map((h) => ({ ...h, url: pageUrl(h.url) }));
  const coverage = coverageNote(args.query);
  return { ...(coverage ? { coverage } : {}), hits };
}

export const listPlaybooksArgs = z.object({
  kind: z.enum(PLAYBOOK_KINDS).optional().describe("audit: checks for a firm that already exists."),
  phase: z.enum(PHASES).optional(),
  depth: z.enum(["full", "outline"]).optional(),
});

export function listPlaybooks(args: z.infer<typeof listPlaybooksArgs>) {
  const items = getCorpus()
    .playbooks.filter((p) => (!args.kind || p.kind === args.kind) && (!args.phase || p.phase === args.phase) && (!args.depth || p.depth === args.depth))
    .map((p) => {
      const m = computeMetrics(p, DEFAULT_VARIANT);
      return {
        slug: p.slug,
        title: p.title,
        url: pageUrl(`/playbooks/${p.slug}`),
        kind: p.kind,
        phase: p.phase,
        depth: p.depth,
        // the structures a written record covers; the share and the two times beside it are the
        // syndication view's, and null when syndication is not one of them
        writtenForStructures: p.depth === "full" ? [...p.written.structure] : null,
        review: p.depth === "full" ? REVIEW_LABEL[p.review] : null,
        agentShareSyndication: p.depth === "full" ? m.agenticPct : null,
        handsOn: p.depth === "full" && m.researched ? effortText(m).value : null,
        calendar: p.depth === "full" && m.researched ? elapsedText(m).value : null,
        urgency: p.situation?.urgency ?? null,
      };
    });
  return { count: items.length, items };
}

export const getPlaybookArgs = z.object({
  slug: z.string().min(1).describe("Playbook or situation slug, from search or list_playbooks."),
  structure: structure.optional().describe("Default syndication."),
  propertyType: propertyType.optional().describe("Default industrial."),
  jurisdictions: z.array(jurisdiction).optional().describe("Default us-federal and us-tx."),
});

export function getPlaybook(args: z.infer<typeof getPlaybookArgs>) {
  const c = getCorpus();
  const pb = c.playbooks.find((p) => p.slug === args.slug || p.id === args.slug);
  if (!pb) throw new ToolError(`No playbook "${args.slug}". Use search or list_playbooks to find one.`);
  const v: Variant = {
    structure: args.structure ?? DEFAULT_VARIANT.structure,
    propertyType: args.propertyType ?? DEFAULT_VARIANT.propertyType,
    jurisdictions: args.jurisdictions ?? DEFAULT_JURISDICTIONS,
  };
  const base = {
    slug: pb.slug,
    title: pb.title,
    url: pageUrl(`/playbooks/${pb.slug}`),
    kind: pb.kind,
    phase: pb.phase,
    summary: pb.summary,
    situation: pb.situation ?? null,
    depth: pb.depth,
    variant: v,
  };
  if (pb.depth === "outline") {
    return { ...base, note: "Outline only: step titles, not yet researched or cited.", stepTitles: pb.outlineSteps };
  }
  const sourceById = new Map(pb.sources.map((s) => [s.id, s]));
  const ruleById = new Map(c.rules.map((r) => [r.id, r]));
  const m = computeMetrics(pb, v);
  const researched = isResearched(pb, v);
  // A variant the record is not written for has no steps of its own: return none, never another variant's.
  const steps = (researched ? pb.steps.filter((s) => applies(s.when, v)) : [])
    .map((s, i) => ({
      n: i + 1,
      id: s.id,
      title: s.title,
      who: s.mode === "agent" || s.mode === "agent-browser" ? "agent" : (s.actor ?? "person"),
      mode: s.mode,
      whyThisMode: s.modeBasis,
      instruction: s.instruction,
      propertyTypeNote: s.typeNotes?.[v.propertyType] ?? null,
      licensed: s.licensed ?? null,
      approval: s.approval,
      risk: s.risk,
      undo: s.undo,
      // only steps in this variant; a filing step it leaves out passes its own prerequisites through
      after: nearestPredecessors(pb, s, v),
      basis: s.basis === "cited" ? "cited" : "common practice, no public source",
      handsOn: s.effort,
      calendar: s.elapsed,
      cost: s.cost ?? null,
      rules: s.rules.map((id) => ({ id, title: ruleById.get(id)?.title ?? id })),
      calculators: s.calculators,
      softwareMarket: s.market ?? null,
      uses: s.consumes,
      makes: s.produces,
      sources: s.sources.map((id) => sourceById.get(id)).filter((x) => x !== undefined),
    }));
  return {
    ...base,
    review: REVIEW_LABEL[pb.review],
    lastVerified: pb.lastVerified ?? null,
    researchedForThisVariant: researched,
    writtenFor: { structure: [...pb.written.structure], jurisdiction: [...pb.written.jurisdiction] },
    ...(researched
      ? {}
      : {
          note: `Not written for this variant, so no steps are returned. Written for structure ${pb.written.structure.join(", ")} and jurisdiction ${pb.written.jurisdiction.join(", ")}. Ask again with one of those only if it describes the deal: this record has no steps for any other.`,
        }),
    agentShare: m.agenticPct,
    agentSteps: m.agent,
    applicableSteps: m.total,
    handsOn: researched ? effortText(m) : null,
    calendar: researched ? elapsedText(m) : null,
    workingRules: [
      "Steps marked person, signature or licensed stay with people; prepare them, do not perform them.",
      "Ask before any step whose approval is every-run or signature, and wait for a yes each time. For steps marked standing, ask once per run (in an audit, once before the first public-record lookup) and note the yes.",
      "Unknown facts stay unknown: ask, or record null in the firm file.",
      "Cite the step's sources when you rely on it.",
      "If some of the work is already done, as with an entity that already exists, walk the steps as a checklist: record each done step with its date and where the proof is, then do only what is left.",
    ],
    steps,
  };
}

export const matchSituationArgs = z.object({
  description: z.string().min(5).max(600).describe("What happened, in plain words."),
});

const URGENCY_ORDER = { hours: 0, days: 1, weeks: 2 } as const;

// Crude stemming, for the check below only: "changed" finds "changes".
function stem(t: string): string {
  return t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t;
}

// A situation fits only when the description shares words with what the
// situation is (its title, summary and trigger), not merely with its long step
// text, where common words like "sponsor" or "LLC" match nearly anything (D70).
function sharedWords(terms: string[], text: string): number {
  return terms.filter((t) => new RegExp(`\\b${t.replace(/[.$%-]/g, "\\$&")}`).test(text)).length;
}

export function matchSituation(args: z.infer<typeof matchSituationArgs>) {
  const c = getCorpus();
  const coverage = coverageNote(args.description);
  const terms = [...new Set(tokens(args.description).map(stem))];
  const need = Math.min(2, terms.length);
  const matches = searchIndex(searchDocs(), args.description, ["situation"], 10)
    .flatMap((h) => {
      const pb = c.playbooks.find((p) => p.id === h.id);
      const what = `${pb?.title ?? ""} ${pb?.summary ?? ""} ${pb?.situation?.trigger ?? ""}`.toLowerCase();
      if (sharedWords(terms, what) < need) return [];
      return [
        {
          slug: h.id,
          title: h.title,
          url: pageUrl(h.url),
          urgency: pb?.situation?.urgency ?? null,
          trigger: pb?.situation?.trigger ?? null,
          written: pb?.depth === "full",
          score: h.score,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || URGENCY_ORDER[a.urgency ?? "weeks"] - URGENCY_ORDER[b.urgency ?? "weeks"])
    .slice(0, 5);
  if (matches.length > 0) {
    return {
      ...(coverage ? { coverage } : {}),
      matches,
      processes: [],
      note: "Ranked by word overlap with each situation's title, trigger and steps. Open the best match with get_playbook.",
    };
  }
  const processes = searchIndex(searchDocs(), args.description, ["playbook"], 3).map((h) => ({
    slug: h.id,
    title: h.title,
    url: pageUrl(h.url),
    written: c.playbooks.find((p) => p.id === h.id)?.depth === "full",
    score: h.score,
  }));
  return {
    ...(coverage ? { coverage } : {}),
    matches: [],
    processes,
    note: "No situation fits this description. These are the closest process playbooks; search also covers rules, artifacts and documents.",
  };
}

export const getRuleArgs = z.object({ id: z.string().min(3).describe("Rule id, e.g. us-fed.reg-d.form-d-filing.") });
export function getRule(args: z.infer<typeof getRuleArgs>) {
  const rule = getCorpus().rules.find((r) => r.id === args.id);
  if (!rule) throw new ToolError(`No rule "${args.id}".`);
  return { ...rule, url: pageUrl(`/rules#rule-${rule.id}`) };
}

export const getArtifactArgs = z.object({ id: z.string().min(2).describe("Artifact id, e.g. offering-memorandum.") });
export function getArtifact(args: z.infer<typeof getArtifactArgs>) {
  const a = getCorpus().artifacts.find((x) => x.id === args.id);
  if (!a) throw new ToolError(`No artifact "${args.id}".`);
  return { ...a, url: pageUrl(`/artifacts#${a.id}`) };
}

export const listDocumentsArgs = z.object({
  query: z.string().max(100).optional().describe("Optional words to filter by title, publisher or use."),
});
export function listDocuments(args: z.infer<typeof listDocumentsArgs>) {
  const q = args.query?.toLowerCase().trim();
  const docs = getCorpus().documents.filter((d) => !q || `${d.title} ${d.publisher} ${d.useCase}`.toLowerCase().includes(q));
  return { count: docs.length, documents: docs };
}

function findMarket(id: string) {
  const r = getRankings();
  const m = r.markets.find((x) => x.market.id === id);
  if (!m) throw new ToolError(`No market "${id}". Markets: ${r.markets.map((x) => x.market.id).join(", ")}.`);
  return { r, m };
}

export const getMarketArgs = z.object({ market: z.string().min(3).describe("Market id; status lists them.") });
export function getMarket(args: z.infer<typeof getMarketArgs>) {
  const { r, m } = findMarket(args.market);
  const v = marketView(r, m);
  const reviewed = getCorpus().reviews.some((e) => e.kind === "market" && e.id === m.market.id);
  let rank = 0;
  return {
    market: m.market.id,
    name: m.market.name,
    url: pageUrl(`/rankings/${m.market.id}`),
    what: m.market.what,
    published: v.published,
    reviewed,
    calibration: { matches: v.calibration.matches, cells: v.calibration.cells },
    method: "Agent-readiness only, from public evidence; every verdict cites it. No vendor pays to be listed. See /rankings/methodology.",
    stories: v.stories.map((s) => ({ id: s.id, title: s.title, group: s.group, weight: s.weight })),
    vendors: v.rows
      .filter((row) => row.status !== "dropped")
      .map((row) => ({
        rank: v.published && row.status === "judged" ? ++rank : null,
        id: row.vendor.id,
        name: row.vendor.name,
        kind: row.vendor.kind,
        status: row.status,
        why: row.reason,
        score: v.published ? row.result.score : null,
        groups: v.published ? row.result.groups : null,
        page: `/rankings/${m.market.id}/${row.vendor.id}`,
        url: pageUrl(`/rankings/${m.market.id}/${row.vendor.id}`),
      })),
  };
}

export const getVendorArgs = z.object({
  market: z.string().min(3),
  vendor: z.string().min(2).describe("Vendor id from get_market."),
});
export function getVendor(args: z.infer<typeof getVendorArgs>) {
  const { r, m } = findMarket(args.market);
  const v = marketView(r, m);
  const row = v.rows.find((x) => x.vendor.id === args.vendor);
  if (!row) throw new ToolError(`No vendor "${args.vendor}" in ${m.market.id}.`);
  return {
    vendor: row.vendor,
    url: pageUrl(`/rankings/${m.market.id}/${row.vendor.id}`),
    status: row.status,
    why: row.reason,
    score: v.published ? row.result.score : null,
    groups: v.published ? row.result.groups : null,
    verdicts:
      row.status === "judged"
        ? row.result.cells.map((c) => ({ story: c.story.id, title: c.story.title, verdict: c.verdict.verdict, quality: c.verdict.quality, rationale: c.verdict.rationale, missing: c.verdict.missing ?? null, evidence: c.verdict.evidence }))
        : [],
    evidence: row.pack?.items.map((i) => ({ id: i.id, tier: i.tier, url: i.url, excerpt: i.excerpt, fetched: i.fetched, note: i.note ?? null })) ?? [],
    coverage: row.pack?.coverage ?? {},
    provenance: row.verdicts ? { judged: row.verdicts.judged, judgeModel: row.verdicts.judgeModel, promptVersion: row.verdicts.promptVersion } : null,
  };
}

function calcRules(id: string) {
  const c = getCorpus();
  const calc = c.calculators.find((x) => x.id === id);
  return (calc?.rules ?? []).map((rid) => {
    const r = c.rules.find((x) => x.id === rid);
    return { id: rid, title: r?.title ?? rid, citation: r?.citation ?? null };
  });
}

export const calcWaterfallArgs = waterfallInput;
export function calcWaterfall(args: z.input<typeof waterfallInput>) {
  const page = "/calculators/waterfall-promote";
  return { result: runWaterfall(waterfallInput.parse(args)), rules: calcRules("waterfall-promote"), page, url: pageUrl(page) };
}

export const calcDebtArgs = debtInput;
export function calcDebt(args: z.input<typeof debtInput>) {
  const page = "/calculators/debt-sizing";
  return { result: sizeDebt(debtInput.parse(args)), rules: calcRules("debt-sizing"), page, url: pageUrl(page) };
}

export const calcReturnsArgs = returnsInput;
export function calcReturns(args: z.input<typeof returnsInput>) {
  const page = "/calculators/returns-sensitivity";
  return { result: runReturns(returnsInput.parse(args)), rules: calcRules("returns-sensitivity"), page, url: pageUrl(page) };
}

// The deadline calendar's input plus one field of the tool's own (CH06): asOf, the date to
// count from. It is taken off before the calendar's strict input is read, so the engine,
// which reads the same input (lib/engine/deadlines.ts), never sees it.
export const calcDeadlinesArgs = z
  .object({ ...deadlinesInput.shape, asOf: isoDate.optional().describe("today, YYYY-MM-DD: marks each date already passed") })
  .strict();

// What to open when a Form D date has passed.
const MISSED_FORM_D = "missed-form-d-deadline";

export function calcDeadlines(args: z.input<typeof calcDeadlinesArgs>) {
  const { asOf, ...input } = calcDeadlinesArgs.parse(args);
  const out = computeDeadlines(deadlinesInput.parse(input));
  const items = asOf ? out.items.map((x) => ({ ...x, passed: x.date < asOf })) : out.items;
  const formDPassed = asOf ? items.some((x) => x.id === "form-d" && x.date < asOf) : false;
  const page = "/calculators/deadline-calendar";
  return {
    result: { ...out, items },
    ...(asOf ? { asOf } : {}),
    ...(formDPassed
      ? {
          formDPassed: {
            note: "The Form D date has passed. Open the missed Form D scenario before filing late.",
            playbook: MISSED_FORM_D,
            url: pageUrl(`/playbooks/${MISSED_FORM_D}`),
          },
        }
      : {}),
    rules: calcRules("deadline-calendar"),
    needsReview: true,
    // The calculator page shows this note too, so it speaks to a person.
    note: "Every date follows its rule card. Have counsel confirm any date before relying on it.",
    page,
    url: pageUrl(page),
  };
}

// One tool for every module calculator (lib/calculators/modules.ts): no id lists
// them, an id alone describes one, an id and input runs it.
export const calcRunArgs = z.object({
  id: z.enum(MODULE_IDS).optional().describe("Calculator id; leave out to list them."),
  input: z.record(z.string(), z.unknown()).optional().describe("Inputs for that calculator, shaped as its schema says."),
});

export function calcRun(args: z.infer<typeof calcRunArgs>) {
  const c = getCorpus();
  const entry = (id: string) => c.calculators.find((x) => x.id === id);
  if (args.id === undefined) {
    if (args.input !== undefined) throw new ToolError("Give the calculator's id with its input. Call calc_run with no arguments to list the ids.");
    return {
      calculators: MODULE_IDS.map((id) => ({ id, name: entry(id)?.name ?? id, what: entry(id)?.what ?? null, url: pageUrl(`/calculators/${id}`) })),
      note: "Call calc_run with an id for its input schema and worked example, then with the id and your input to run it.",
    };
  }
  const id = args.id;
  const m = getModule(id);
  const page = `/calculators/${id}`;
  if (args.input === undefined) {
    const e = entry(id);
    return {
      id,
      name: e?.name ?? id,
      what: e?.what ?? null,
      method: e?.method ?? [],
      input: z.toJSONSchema(m.input, { target: "draft-2020-12", io: "input" }),
      example: m.example,
      rules: calcRules(id),
      page,
      url: pageUrl(page),
    };
  }
  const parsed = m.input.safeParse(args.input);
  if (!parsed.success) {
    throw new ToolError(`Invalid input for ${id}: ${parsed.error.issues.map((i) => `${["input", ...i.path.map(String)].join(".")}: ${i.message}`).join("; ")}`);
  }
  return { result: m.run(parsed.data), rules: calcRules(id), page, url: pageUrl(page) };
}

export function firmFileSpec() {
  const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-2020-12" });
  return {
    what: "A small folder the agent keeps on the operator's own machine, wherever the operator chooses. The engine keeps it where the agent can run programs; these four files are the fallback without it. No PromptedCRE tool takes the folder: keep what is in it out of searches and calculators.",
    files: {
      "firm.json": {
        holds: "Profile: name; entity type, state, status, file number and registered agent; chosen structure; property types; principals; and each series of a series LLC.",
        schema: schema(firmProfile),
      },
      "decisions.json": { holds: "Log of choices, who made them and when (null when the date is unknown).", schema: schema(firmDecisions) },
      "progress.json": {
        holds: "Playbook → step → todo, done, skipped, blocked or not-applicable, with a date and a note; plus other work that is not a playbook step.",
        schema: schema(firmProgress),
      },
      "artifacts.json": { holds: "Pointers to the operator's own documents on disk.", schema: schema(firmArtifacts) },
    },
    // Written only by the engine that runs on the operator's machine. Listed
    // apart from `files`, so an agent without the engine keeps to the four above.
    engineFiles: {
      "audits.json": { holds: "Audits: each check's outcome and where the proof is, the findings and who fixes each.", schema: schema(firmAudits) },
      "calendar.json": { holds: "Dated duties, each open, done or dismissed.", schema: schema(firmCalendar) },
      "log.jsonl": { holds: "One line per change, in order: when, who, what moved and why.", schema: schema(firmLogEvent) },
    },
    rules: [
      "Unknown is null, never a guess. Ask the operator instead of filling a gap.",
      "Reuse what is already recorded before asking again.",
      "Never store secrets: tax ids, account or routing numbers, passwords, keys. Record only where they live. A state file number is public; it goes in entity.fileNumber.",
      "Nothing leaves the machine. Do not send the firm file to this server or anywhere else.",
      "Step ids in progress.json come from get_playbook, so progress lines up with the playbook. Work outside every playbook goes in progress.json under other.",
      "For an entity that already exists, record what is done, with dates and where the proof is, before planning what is left.",
      "For a chat app with no file system, keep the same four objects in one document the operator stores.",
      "progress.json may hold subjects (a deal, an offering, an investor), each with its own runs in the same shape as the firm's.",
      "The engineFiles are written by the engine that runs on the operator's machine; its state machines are published at /export/processes.json. Without the engine, keep to the four files: nothing then refuses an agent that records a person's step, so stop at each one as the playbook says.",
    ],
    example: {
      note: "A fictional operator, for shape only.",
      ...Object.fromEntries(
        ["firm.json", "decisions.json", "progress.json", "artifacts.json"].map((f) => [f, JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, "example-firm", f), "utf8"))]),
      ),
    },
  };
}
