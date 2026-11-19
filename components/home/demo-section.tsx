import { LlcDemo, type LlcDemoData } from "@/components/demo";
import { TextLink } from "@/components/ui";
import { site } from "@/lib/site";
import { availability } from "./data";

// The home page's one demonstration (D218, decisions 66 and 67): an AI agent forming an LLC,
// shown as a chat, from a recorded run of the engine on a fictional firm. The component never
// says that the engine is not released; this section says it once for the page, from the flag.
export function DemoSection({ data }: { data: LlcDemoData }) {
  const engine = availability(site)?.engine ?? null;
  return (
    <section id="demo" aria-labelledby="demo-title" className="mt-16 md:mt-24">
      <div className="max-w-(--measure)">
        <h2 id="demo-title" className="type-title-l m-0 text-text">
          Watch an agent form an LLC
        </h2>
        <p className="type-body m-0 mt-2 text-muted">
          The agent does its own steps and records where each proof is. At a person&rsquo;s step the engine refuses the agent, so the agent
          hands the step over and records it in the person&rsquo;s name once they say it&rsquo;s done. {engine && <span>{engine} </span>}
          <TextLink href="/run" tone="accent">
            See a longer recorded run
          </TextLink>
        </p>
      </div>
      <LlcDemo data={data} className="mt-6" />
    </section>
  );
}
