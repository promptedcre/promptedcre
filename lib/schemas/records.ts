import { z } from "zod";
import { httpsUrl, isoDate, jurisdiction, review, ruleId, slug, source } from "./common";

export const rule = z
  .object({
    id: ruleId,
    jurisdiction,
    title: z.string().min(3).max(110),
    rule: z.string().min(20),
    citation: z.object({ authority: z.string().min(3), url: httpsUrl }).strict(),
    asOf: isoDate,
    lastVerified: isoDate,
    review,
    changeWatch: z.string().min(3).optional(),
    sources: z.array(source).min(1),
  })
  .strict();

export const artifact = z
  .object({
    id: slug,
    name: z.string().min(2),
    what: z.string().min(10),
    fields: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, "expected a camelCase key"),
            label: z.string().min(2),
            type: z.enum(["string", "text", "date", "money", "integer", "boolean", "enum", "list"]),
            unit: z.string().optional(),
            definition: z.string().min(5),
            authority: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const documentEntry = z
  .object({
    id: slug,
    title: z.string().min(3),
    publisher: z.string().min(2),
    url: httpsUrl,
    useCase: z.string().min(3),
    access: z.enum(["public-domain", "free-to-view", "member-only", "paid"]),
    lastChecked: isoDate,
    note: z.string().optional(),
  })
  .strict();

export const documentIndex = z.object({ documents: z.array(documentEntry) }).strict();

export const calculatorEntry = z
  .object({
    id: slug,
    name: z.string().min(3),
    what: z.string().min(10),
    status: z.enum(["planned", "live"]),
    // how the math works, in plain words; shown on the calculator page
    method: z.array(z.string().min(10)).default([]),
    rules: z.array(ruleId).default([]),
  })
  .strict();

export const calculatorRegistry = z.object({ calculators: z.array(calculatorEntry) }).strict();

// The playbooks only need a market's name; the rankings live in rankings/markets/<id>/.
export const marketEntry = z
  .object({
    id: slug,
    name: z.string().min(3),
    what: z.string().min(10),
  })
  .strip();

// Every review chip above "AI-drafted" traces to a dated approval here.
export const reviewEntry = z
  .object({
    kind: z.enum(["playbook", "rule", "market"]),
    id: z.string().min(3),
    level: z.enum(["practitioner-reviewed", "attorney-reviewed"]),
    date: isoDate,
    gate: z.enum(["A", "B", "C"]).optional(),
    note: z.string().min(5),
  })
  .strict();

export const reviewLedger = z.object({ reviews: z.array(reviewEntry) }).strict();

export type Rule = z.infer<typeof rule>;
export type ReviewEntry = z.infer<typeof reviewEntry>;
export type Artifact = z.infer<typeof artifact>;
export type DocumentEntry = z.infer<typeof documentEntry>;
export type CalculatorEntry = z.infer<typeof calculatorEntry>;
export type MarketEntry = z.infer<typeof marketEntry>;
