import type { Metadata, ResolvingMetadata } from "next";
import { PlanCards } from "@/components/plans/plan-cards";
import { PlansStyles } from "@/components/plans/styles";
import { Container, PageHead } from "@/components/ui";
import { siteFacts } from "@/lib/compute/site-facts";
import { getCorpus } from "@/lib/content/load";
import { TOOLS } from "@/lib/mcp/server";
import { MONEY_LINE, PLANS_PAGE, plansDescription } from "@/lib/plans";
import { site } from "@/lib/site";

const SHARE_TITLE = `${PLANS_PAGE.tabTitle} · ${site.name}`;

// The page's own title and description, in a tab, a search result and a shared link, on the
// site's own share image (app/opengraph-image.tsx). A page's openGraph replaces the layout's
// whole, image and all, so the image the layout resolved is carried over from `parent`. The
// twitter block leaves `images` out: Next copies the Open Graph image into it at the end, and
// an empty list would stop that.
export async function generateMetadata(_: PageProps<"/plans">, parent: ResolvingMetadata): Promise<Metadata> {
  const { openGraph } = await parent;
  const description = plansDescription();
  return {
    title: PLANS_PAGE.tabTitle,
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

// The plans page (decisions 120 to 127), where the header's "Connect your agent" leads: the
// three cards, then what pays for the plans. Static: built once from the catalog. It takes
// nothing from a visitor: Pro and Enterprise are coming soon, with no form for now.
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
      <PageHead id="plans-title" title={PLANS_PAGE.title} lede={PLANS_PAGE.lede} />
      <PlanCards counts={counts} className="mt-10 md:mt-12" />
      <p className="type-body measure m-0 mb-8 mt-10 text-text md:mt-12">{MONEY_LINE}</p>
    </Container>
  );
}
