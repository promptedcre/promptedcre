import { z } from "zod";

export const STRUCTURES = ["syndication", "fund", "jv"] as const;
export const JURISDICTIONS = ["us-federal", "us-tx", "us-de"] as const;
export const PROPERTY_TYPES = ["industrial", "multifamily", "office", "retail"] as const;
export const REVIEW_LEVELS = ["ai-drafted", "practitioner-reviewed", "attorney-reviewed"] as const;

export type Structure = (typeof STRUCTURES)[number];
export type Jurisdiction = (typeof JURISDICTIONS)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type Review = (typeof REVIEW_LEVELS)[number];

export const structure = z.enum(STRUCTURES);
export const jurisdiction = z.enum(JURISDICTIONS);
export const propertyType = z.enum(PROPERTY_TYPES);
export const review = z.enum(REVIEW_LEVELS);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a date written like 2026-11-11");

export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected lowercase words joined by hyphens");

export const ruleId = z
  .string()
  .regex(
    /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/,
    "expected a dotted rule id such as us-fed.reg-d.form-d-filing",
  );

export const httpsUrl = z
  .string()
  .regex(/^https:\/\/[^\s]+$/, "expected an https:// URL");

// When a step or record applies. Absent keys mean "applies to all".
export const condition = z
  .object({
    structure: z.array(structure).min(1).optional(),
    jurisdiction: z.array(jurisdiction).min(1).optional(),
    propertyType: z.array(propertyType).min(1).optional(),
  })
  .strict();

export const source = z
  .object({
    id: slug,
    url: httpsUrl,
    title: z.string().min(3),
    publisher: z.string().min(2),
    accessed: isoDate,
    quote: z.string().min(3).optional(),
    tier: z.enum(["primary", "secondary"]),
  })
  .strict();

// Effort is hands-on time (minutes or hours). Elapsed is calendar time.
export const duration = z
  .object({
    min: z.number().positive(),
    max: z.number().positive(),
    unit: z.enum(["minutes", "hours", "business-days", "days", "weeks"]),
    basis: z.enum(["cited", "practitioner"]),
    sourceId: slug.optional(),
    note: z.string().min(3).optional(),
  })
  .strict()
  .refine((d) => d.min <= d.max, { message: "min must not be larger than max", path: ["max"] });

export const cost = z
  .object({
    text: z.string().min(3),
    usdMin: z.number().nonnegative().optional(),
    usdMax: z.number().nonnegative().optional(),
    sourceId: slug,
  })
  .strict();

export type Condition = z.infer<typeof condition>;
export type Source = z.infer<typeof source>;
export type Duration = z.infer<typeof duration>;
export type Cost = z.infer<typeof cost>;
