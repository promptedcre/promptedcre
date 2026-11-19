import { getCorpus, getPlaybook } from "@/lib/content/load";
import { buildDate } from "@/lib/build-date";
import { hasPlaybookMd, latestReview, playbookMarkdown } from "@/lib/export/playbook-md";
import { site } from "@/lib/site";

// Every written record as one Markdown file, written at build time: what an operator
// pastes into any AI chat when no connector is set up (lib/export/playbook-md.ts).
// Outlines have no file.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getCorpus().playbooks.filter(hasPlaybookMd).map((p) => ({ slug: p.slug }));
}

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const pb = getPlaybook(slug);
  if (!pb || !hasPlaybookMd(pb)) return new Response("Not found", { status: 404 });
  const corpus = getCorpus();
  const text = playbookMarkdown(pb, {
    rules: corpus.rules,
    artifacts: corpus.artifacts,
    review: latestReview(corpus.reviews, pb.id),
    origin: site.url,
    computedOn: buildDate(),
  });
  return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
