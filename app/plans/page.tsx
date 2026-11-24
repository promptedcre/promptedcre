import type { Metadata, ResolvingMetadata } from "next";
import { PlanCards } from "@/components/plans/plan-cards";
import { PlansStyles } from "@/components/plans/styles";
import { Container } from "@/components/ui";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { TOOLS } from "@/lib/mcp/server";
import { PLANS_LABEL, plansDescription } from "@/lib/plans";
import { site } from "@/lib/site";

const SHARE_TITLE = `${PLANS_LABEL} · ${site.name}`;

// The page's own title and description, in a tab, a search result and a shared link, on the
// site's own share image (app/opengraph-image.tsx). A page's openGraph replaces the layout's
// whole, image and all, so the image the layout resolved is carried over from `parent`. The
// twitter block leaves `images` out: Next copies the Open Graph image into it at the end, and
// an empty list would stop that.
export async function generateMetadata(_: PageProps<"/plans">, parent: ResolvingMetadata): Promise<Metadata> {
  const { openGraph } = await parent;
  const description = plansDescription();
  return {
    title: PLANS_LABEL,
    description,
    openGraph: {
      type: "website",
      siteName: site.name,
      title: SHARE_TITLE,
      description,
      url: `${site.url}/plans`,
      images: openGraph?.images ?? [],
    },
    twitter: { card: "summary_large_image", title: SHARE_TITLE, description },
  };
}

// The plans page (decisions 120 to 127 and 134 to 138), where the header's "Connect your
// agent" leads: the three cards and nothing else. It draws no title, no line under one and no
// line under the cards (decision 135); its one h1 is for screen readers, and the cards start
// where a page head would, at PageHead's own top space. Static: built once from the catalog.
// It takes nothing from a visitor: Pro and Enterprise are coming soon, with no form for now.
export default function PlansPage() {
  const facts = siteFacts(getCorpus());
  const counts = {
    written: facts.counts.written,
    rules: facts.counts.rules,
    calculators: facts.counts.calculatorsLive,
    tools: TOOLS.length,
  };
  return (
    <Container>
      <PlansStyles />
      <h1 id="plans-title" className="sr-only">
        {PLANS_LABEL}
      </h1>
      <PlanCards counts={counts} className="mb-8 pt-8 md:pt-12" />
    </Container>
  );
}
