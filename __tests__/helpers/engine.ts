import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCorpus, type Corpus } from "@/lib/content/load";
import { execute, findAction, FirmStore, parseActor, type Ctx } from "@/lib/engine/index";
import type { Playbook, Step } from "@/lib/schemas/playbook";

// Shared by the engine tests: a firm folder in the temp directory, a context to
// run actions in, and synthetic playbooks so a test does not lean on catalog text.

export const TODAY = "2026-11-12";

export function tempFirmDir(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pcre-test-")), "firm");
}

let catalog: Corpus | null = null;
export function realCorpus(): Corpus {
  catalog ??= loadCorpus().corpus;
  return catalog;
}

export function makeCtx(opts: { dir?: string; by?: string; date?: string; today?: string; corpus?: Corpus } = {}): Ctx {
  const today = opts.today ?? TODAY;
  return {
    store: new FirmStore(opts.dir ?? tempFirmDir()),
    corpus: opts.corpus ?? realCorpus(),
    actor: parseActor(opts.by),
    date: opts.date ?? today,
    today,
    now: () => new Date(`${today}T12:00:00.000Z`),
    repoRoot: process.cwd(),
  };
}

// Runs one action by name, the way the command line and the MCP server do.
// `as` overrides who is acting and the recording date for this one call.
export function act<T = unknown>(ctx: Ctx, name: string, args: Record<string, unknown> = {}, as: { by?: string; date?: string } = {}): T {
  const action = findAction(name);
  if (!action) throw new Error(`no action named ${name}`);
  const actor = as.by !== undefined ? parseActor(as.by) : ctx.actor;
  return execute(action, { ...ctx, actor, date: as.date ?? ctx.date }, args) as T;
}

// A context whose folder holds the fictional example firm.
export function exampleFirm(opts: Parameters<typeof makeCtx>[0] = {}): Ctx {
  const ctx = makeCtx(opts);
  act(ctx, "firm.init", { example: true });
  return ctx;
}

// The code an EngineError carries, or null when the call did not refuse.
export function refusal(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) return String((err as { code: unknown }).code);
    throw err;
  }
}

export function step(id: string, over: Partial<Step> = {}): Step {
  return {
    id,
    title: `Step ${id}`,
    instruction: "An instruction long enough for the schema.",
    mode: "agent",
    modeBasis: "Synthetic test step.",
    risk: "low",
    undo: "reversible",
    approval: "none",
    effort: null,
    elapsed: null,
    after: [],
    rules: [],
    calculators: [],
    consumes: [],
    produces: [],
    basis: "practitioner",
    sources: [],
    ...over,
  };
}

export function book(slug: string, steps: Step[], over: Partial<Playbook> = {}): Playbook {
  return {
    id: slug,
    slug,
    kind: "process",
    title: `Synthetic ${slug}`,
    summary: "A synthetic playbook for tests.",
    phase: "raise",
    order: 9000,
    featured: false,
    depth: "full",
    review: "ai-drafted",
    lastVerified: "2026-11-11",
    requires: [],
    consumes: [],
    produces: [],
    written: { structure: ["syndication", "fund", "jv"], jurisdiction: ["us-federal", "us-tx"] },
    sources: [],
    steps,
    outlineSteps: [],
    ...over,
  };
}

// The real catalog plus synthetic playbooks.
export function corpusWith(...books: Playbook[]): Corpus {
  const base = realCorpus();
  return { ...base, playbooks: [...base.playbooks, ...books] };
}
