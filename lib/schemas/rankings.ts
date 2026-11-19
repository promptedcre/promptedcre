import { z } from "zod";
import { httpsUrl, isoDate, slug } from "./common";

// Rankings records (build plan section 9). Scores are computed from these
// files at build time and never stored.

export const STORY_GROUPS = ["access", "openness", "task"] as const;
export const VERDICTS = ["full", "partial", "disputed", "none", "na"] as const;
export const TIERS = ["probe", "code", "independent", "vendor-claim"] as const;
export const COVERAGE_KEYS = ["docs", "api", "pricing", "changelog"] as const;

export type StoryGroup = (typeof STORY_GROUPS)[number];
export type VerdictLevel = (typeof VERDICTS)[number];
export type Tier = (typeof TIERS)[number];

const storyFields = {
  id: slug,
  title: z.string().min(3).max(80),
  // the question the judge answers, in one sentence
  question: z.string().min(10),
  weight: z.number().int().min(1).max(5),
  // what the evidence must show for "full" and for "partial"
  full: z.string().min(10),
  partial: z.string().min(10),
  // when "na" is allowed; absent means the story always applies
  na: z.string().min(5).optional(),
};

export const story = z.object({ ...storyFields, group: z.enum(["access", "openness"]) }).strict();
export const taskStory = z.object({ ...storyFields, group: z.literal("task") }).strict();

export const storyFile = z
  .object({
    version: z.string().min(3),
    stories: z.array(story).min(1),
  })
  .strict();

export const marketFile = z
  .object({
    id: slug,
    name: z.string().min(3),
    what: z.string().min(10),
    order: z.number().int().positive(),
    tasks: z.array(taskStory).min(3).max(5),
  })
  .strict();

export const vendor = z
  .object({
    id: slug,
    name: z.string().min(2),
    kind: z.enum(["product", "government"]),
    what: z.string().min(10).max(200),
    homepage: httpsUrl,
    status: z.enum(["active", "dropped"]).default("active"),
    // why a candidate was dropped, on the evidence (acquired, shut down, wrong market)
    dropReason: z.string().min(5).optional(),
  })
  .strict();

export const vendorFile = z
  .object({
    market: slug,
    vendors: z.array(vendor).min(1),
  })
  .strict();

export const coverageEntry = z
  .object({
    // the page that was opened
    url: httpsUrl,
    // the page exists and is what the key says (false: checked, none found)
    found: z.boolean(),
    note: z.string().min(3).optional(),
  })
  .strict();

export const evidenceItem = z
  .object({
    // p = from the probe harness, c = collected by reading the page
    id: z.string().regex(/^[pc]\d+$/, "expected an id like c1 or p2"),
    tier: z.enum(TIERS),
    url: httpsUrl,
    // verbatim text from the page, 25 words at most
    excerpt: z.string().min(1),
    fetched: isoDate,
    // sha256 of url + newline + excerpt; filled in by npm run rank:seal
    hash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    note: z.string().min(2).optional(),
  })
  .strict();

export const evidencePack = z
  .object({
    vendor: slug,
    collected: isoDate.optional(),
    coverage: z
      .object({
        docs: coverageEntry.optional(),
        api: coverageEntry.optional(),
        pricing: coverageEntry.optional(),
        changelog: coverageEntry.optional(),
      })
      .strict()
      .default({}),
    // where the probe should look; found while collecting
    links: z
      .object({
        docs: httpsUrl.optional(),
        api: httpsUrl.optional(),
        openapi: httpsUrl.optional(),
        mcp: httpsUrl.optional(),
        cli: httpsUrl.optional(),
      })
      .strict()
      .default({}),
    packages: z
      .array(
        z
          .object({
            registry: z.enum(["npm", "pypi"]),
            name: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
    // public GitHub repositories, https://github.com/<owner>/<repo>
    repos: z.array(z.string().regex(/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/)).default([]),
    items: z.array(evidenceItem).default([]),
  })
  .strict();

export const verdict = z
  .object({
    story: slug,
    verdict: z.enum(VERDICTS),
    quality: z.number().int().min(0).max(10),
    evidence: z.array(z.string()).default([]),
    rationale: z.string().min(10),
    // required when quality is below 10: what the evidence does not show
    missing: z.string().min(3).optional(),
  })
  .strict();

export const verdictFile = z
  .object({
    vendor: slug,
    judged: isoDate,
    judgeModel: z.string().min(3),
    promptVersion: z.string().min(3),
    evidenceHash: z.string().regex(/^[0-9a-f]{64}$/),
    verdicts: z.array(verdict).min(1),
  })
  .strict();

export const goldenCell = z
  .object({
    vendor: slug,
    story: slug,
    verdict: z.enum(VERDICTS),
    // what the checker saw, in a sentence
    why: z.string().min(10),
    checked: isoDate,
    evidence: z.array(z.string()).default([]),
  })
  .strict();

export const goldenFile = z
  .object({
    market: slug,
    cells: z.array(goldenCell),
  })
  .strict();

export type Story = z.infer<typeof story>;
export type TaskStory = z.infer<typeof taskStory>;
export type AnyStory = Story | TaskStory;
export type MarketFile = z.infer<typeof marketFile>;
export type Vendor = z.infer<typeof vendor>;
export type EvidencePack = z.infer<typeof evidencePack>;
export type EvidenceItem = z.infer<typeof evidenceItem>;
export type Verdict = z.infer<typeof verdict>;
export type VerdictFile = z.infer<typeof verdictFile>;
export type GoldenCell = z.infer<typeof goldenCell>;
