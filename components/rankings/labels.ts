import type { AnyStory, StoryGroup, Tier, VerdictLevel } from "@/lib/schemas/rankings";

// Words for the rankings' data values. Pure, so any component may import them.

export const VERDICT_LABEL: Record<VerdictLevel, string> = {
  full: "full",
  partial: "partial",
  disputed: "disputed",
  none: "none",
  na: "not applicable",
};

export const TIER_LABEL: Record<Tier, string> = {
  probe: "probe",
  code: "code",
  independent: "independent",
  "vendor-claim": "vendor claim",
};

export const GROUP_ORDER = ["access", "openness", "task"] as const satisfies readonly StoryGroup[];

export const GROUP_LABEL: Record<StoryGroup, string> = {
  access: "Agent access",
  openness: "Openness",
  task: "Market tasks",
};

export const COVERAGE_LABEL = {
  docs: "Documentation",
  api: "API or developer page",
  pricing: "Pricing",
  changelog: "Changelog",
} as const;

export type KeyedStory = { story: AnyStory; code: string };
export type StoryGroupKey = { group: StoryGroup; label: string; stories: KeyedStory[] };

// The stories of a market in key order: grouped access, openness, tasks, in file order within
// a group, numbered 1, 2 ... straight through (plain numerals, no zero padding). The code is
// how the schedule's columns, the key above it and a vendor's verdicts are matched.
export function storyKey(stories: AnyStory[]): StoryGroupKey[] {
  let n = 0;
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    stories: stories.filter((s) => s.group === group).map((story) => ({ story, code: String((n += 1)) })),
  })).filter((g) => g.stories.length > 0);
}
