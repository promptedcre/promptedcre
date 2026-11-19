import type { AnyStory, StoryGroup, Verdict, VerdictLevel } from "../schemas/rankings";

// Build plan section 9:
//   cell  = weight × (quality ÷ 10) × factor
//   score = round(100 × Σ cell ÷ Σ weight), over applicable cells; "na" is left out of both sums
export const FACTOR: Record<Exclude<VerdictLevel, "na">, number> = {
  full: 1,
  partial: 0.5,
  disputed: 0.25,
  none: 0,
};

export type Cell = { story: AnyStory; verdict: Verdict; points: number | null };

export type Score = {
  score: number | null;
  groups: Record<StoryGroup, number | null>;
  cells: Cell[];
};

export function cellPoints(story: AnyStory, v: Verdict): number | null {
  if (v.verdict === "na") return null;
  return story.weight * (v.quality / 10) * FACTOR[v.verdict];
}

function ratio(cells: Cell[]): number | null {
  const applicable = cells.filter((c) => c.points !== null);
  const weight = applicable.reduce((sum, c) => sum + c.story.weight, 0);
  if (weight === 0) return null;
  const points = applicable.reduce((sum, c) => sum + (c.points ?? 0), 0);
  return Math.round((100 * points) / weight);
}

// A vendor with no verdicts is untested and scores null.
export function scoreVendor(stories: AnyStory[], verdicts: Verdict[] | null): Score {
  const empty: Score = { score: null, groups: { access: null, openness: null, task: null }, cells: [] };
  if (!verdicts) return empty;
  const byStory = new Map(verdicts.map((v) => [v.story, v]));
  const cells: Cell[] = [];
  for (const story of stories) {
    const verdict = byStory.get(story.id);
    if (!verdict) continue;
    cells.push({ story, verdict, points: cellPoints(story, verdict) });
  }
  return {
    score: ratio(cells),
    groups: {
      access: ratio(cells.filter((c) => c.story.group === "access")),
      openness: ratio(cells.filter((c) => c.story.group === "openness")),
      task: ratio(cells.filter((c) => c.story.group === "task")),
    },
    cells,
  };
}

// Highest score first; untested vendors last, then by name.
export function compareScores(a: { score: number | null; name: string }, b: { score: number | null; name: string }): number {
  if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
  if (a.score === null) return 1;
  if (b.score === null) return -1;
  return b.score - a.score || a.name.localeCompare(b.name);
}
