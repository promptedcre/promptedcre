import { stepSoftware } from "@/components/rankings/step-software";
import { getCorpus } from "@/lib/content/load";
import { buildLlcChat, getLlcRun, type LlcChat, type LlcMarket } from "@/lib/demo/llc";
import { setupPrompt, site } from "@/lib/site";

// The formation demonstration's data, read once on the server: the recorded run
// (content/demo/form-llc.json) as an agent session (lib/demo/llc.ts), the sentence a person
// pastes, and the engine's release state for the page to say once. Server only: it reads the
// recording, the catalog, the step-to-software map and the rankings from disk. Everything
// returned is plain data.

export type LlcDemoData = LlcChat & {
  /** The session's first message: the sentence a person pastes into their AI (lib/site.ts). */
  prompt: string;
  /**
   * site.engineReleased. The component never says it; while it is false the page says once
   * that the engine is not released yet.
   */
  engineReleased: boolean;
};

// The software that does one step (the owner's "Map each step", D218): every product
// content/step-software.json names for it, the scored ones first, best first, then the ones
// the ranking lists but has not judged yet (components/rankings/step-software.ts). The
// session shows only the one the record itself names (lib/demo/llc.ts), so none is cut off.
export function stepVendors(playbookId: string, stepId: string, marketId: string): LlcMarket | null {
  const found = stepSoftware(playbookId, stepId, marketId, Number.POSITIVE_INFINITY);
  return found ? { ...found.market, vendors: found.vendors } : null;
}

export function getLlcDemo(): LlcDemoData {
  const chat = buildLlcChat(getLlcRun(), getCorpus().playbooks, stepVendors);
  return { ...chat, prompt: setupPrompt(), engineReleased: site.engineReleased };
}
