import type { Metadata } from "next";
import { getLlcDemo } from "@/components/demo";
import { getHomeData } from "@/components/home/data";
import { DemoSection } from "@/components/home/demo-section";
import { HomeHero } from "@/components/home/hero";
import { HomeStats } from "@/components/home/stats";
import { Questions } from "@/components/home/reference";
import { HomeStyles } from "@/components/home/styles";
import { JourneyTable, ScenarioTable } from "@/components/home/tables";
import { Container } from "@/components/ui";
import { site } from "@/lib/site";

// The browser tab says what the site is, not only its name.
export const metadata: Metadata = {
  title: { absolute: `${site.name}: AI-agent playbooks for real estate operators` },
};

// The home page, top to bottom (D218): the owner's line and the one box to start from; the
// journey, twelve playbooks in the order a firm needs them; the recorded run of an agent
// forming an LLC; the scenarios, the most urgent first; and the questions. Every number is
// computed at build time.
export default function HomePage() {
  const d = getHomeData();
  return (
    <Container>
      <HomeStyles />
      <HomeHero data={d} />
      <HomeStats data={{ facts: d.facts, software: d.software }} />
      <JourneyTable rows={d.journey} all={d.all.playbooks} />
      <DemoSection data={getLlcDemo()} />
      <ScenarioTable rows={d.scenarios} all={d.all.scenarios} />
      <Questions facts={d.facts} hosts={d.hosts} />
    </Container>
  );
}
