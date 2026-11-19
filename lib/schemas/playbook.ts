import { z } from "zod";
import {
  condition,
  cost,
  duration,
  isoDate,
  jurisdiction,
  review,
  ruleId,
  slug,
  source,
  structure,
} from "./common";

export const STEP_MODES = ["agent", "agent-browser", "human-online", "human-offline"] as const;
export type StepMode = (typeof STEP_MODES)[number];

export const ACTORS = [
  "principal",
  "counsel",
  "cpa",
  "lender",
  "title",
  "consultant",
  "investor",
  "broker",
  "agency",
] as const;

export const LICENSED = [
  "attorney",
  "cpa",
  "surveyor",
  "environmental-professional",
  "appraiser",
  "engineer",
] as const;

export const PHASES = ["stand-up", "raise", "acquire", "operate", "report", "exit"] as const;
export type Phase = (typeof PHASES)[number];

// The parts of a firm's life no audit covers yet (docs/DECISIONS.md, decision 33).
// The home page and every audit score say so from this one list.
export const PHASES_NOT_AUDITED = ["operate", "report"] as const satisfies readonly Phase[];

// A process is work done in order; a situation is an unplanned event; an audit is
// a set of checks on a firm that already exists (its phase names what it covers).
export const PLAYBOOK_KINDS = ["process", "situation", "audit"] as const;
export type PlaybookKind = (typeof PLAYBOOK_KINDS)[number];

const typeNotes = z
  .object({
    industrial: z.string().min(3).optional(),
    multifamily: z.string().min(3).optional(),
    office: z.string().min(3).optional(),
    retail: z.string().min(3).optional(),
  })
  .strict();

export const step = z
  .object({
    id: slug,
    title: z.string().min(3).max(90),
    instruction: z.string().min(20),
    mode: z.enum(STEP_MODES),
    modeBasis: z.string().min(10),
    actor: z.enum(ACTORS).optional(),
    licensed: z.enum(LICENSED).optional(),
    risk: z.enum(["low", "medium", "high"]),
    undo: z.enum(["reversible", "hard-to-undo", "irreversible"]),
    approval: z.enum(["none", "standing", "every-run", "signature"]),
    effort: duration.nullable(),
    elapsed: duration.nullable(),
    cost: cost.optional(),
    after: z.array(slug).default([]),
    when: condition.optional(),
    rules: z.array(ruleId).default([]),
    calculators: z.array(slug).default([]),
    market: slug.optional(),
    consumes: z.array(slug).default([]),
    produces: z.array(slug).default([]),
    basis: z.enum(["cited", "practitioner"]),
    // ids of entries in the playbook's sources list
    sources: z.array(slug).default([]),
    typeNotes: typeNotes.optional(),
  })
  .strict();

export const playbook = z
  .object({
    id: slug,
    slug: slug,
    kind: z.enum(PLAYBOOK_KINDS),
    title: z.string().min(3).max(90),
    summary: z.string().min(10).max(320),
    phase: z.enum(PHASES),
    order: z.number().int().positive(),
    // flagship playbooks and situations appear on the home page
    featured: z.boolean().default(false),
    depth: z.enum(["full", "outline"]),
    review,
    lastVerified: isoDate.nullable(),
    situation: z
      .object({
        trigger: z.string().min(10),
        urgency: z.enum(["hours", "days", "weeks"]),
      })
      .strict()
      .optional(),
    requires: z.array(slug).default([]),
    consumes: z.array(slug).default([]),
    produces: z.array(slug).default([]),
    // the variants actually researched; anything else renders as "not researched"
    written: z
      .object({
        structure: z.array(structure),
        jurisdiction: z.array(jurisdiction),
      })
      .strict(),
    sources: z.array(source).default([]),
    steps: z.array(step).default([]),
    // outline depth only: the step titles, before the steps are written
    outlineSteps: z.array(z.string().min(3)).default([]),
  })
  .strict();

export type Step = z.infer<typeof step>;
export type Playbook = z.infer<typeof playbook>;

// A check that reads a public record: its step carries a standing approval, so one
// approval per audit covers the lookups (docs/DECISIONS.md, decision 37). The engine
// and the audit page both use this one test.
export function readsPublicRecord(s: Pick<Step, "approval">): boolean {
  return s.approval === "standing";
}
