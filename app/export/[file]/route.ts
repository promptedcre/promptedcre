import { getCorpus } from "@/lib/content/load";
import { buildDate } from "@/lib/build-date";
import { describeProcesses } from "@/lib/engine/map";

// Static JSON exports of the open content (CC BY 4.0), written at build time.
// The rankings are not exported in bulk: their data license allows viewing and
// quoting, not bulk copying. "processes" is the engine's state machines
// (lib/engine/processes.ts): code, so it carries the code license.
export const dynamic = "force-static";
export const dynamicParams = false;

const EXPORTS = ["playbooks", "rules", "artifacts", "documents", "calculators", "processes"] as const;

export function generateStaticParams() {
  return EXPORTS.map((name) => ({ file: `${name}.json` }));
}

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params;
  const name = file.replace(/\.json$/, "") as (typeof EXPORTS)[number];
  const generated = buildDate();
  if (name === "processes") {
    const processes = describeProcesses();
    return Response.json({ license: "Apache-2.0, PromptedCRE", generated, count: processes.machines.length, processes });
  }
  const c = getCorpus();
  const data = {
    playbooks: c.playbooks,
    rules: c.rules,
    artifacts: c.artifacts,
    documents: c.documents,
    calculators: c.calculators,
  }[name];
  if (!data) return new Response("Not found", { status: 404 });
  const body = { license: "CC BY 4.0, PromptedCRE", generated, count: data.length, [name]: data };
  return Response.json(body);
}
