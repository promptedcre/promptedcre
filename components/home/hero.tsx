import Link from "next/link";
import { NotLiveChip } from "@/components/connect";
import { PromptWell } from "@/components/connect/prompt-card";
import { Logo, TextLink } from "@/components/ui";
import { site } from "@/lib/site";
import type { HomeData } from "./data";

// The top of the home page (D218), read in one look: the owner's line (decision 118), the one
// sentence under it (decision 119), the agents it works with (each with its own icon, linking
// to its setup), and one box to start from. The box has three ways in (the sentence for any
// agent, Claude Code's command, the connector's address), switched by radios so it works with
// scripts off; the "Goes live at launch" chip is the page's one statement that the connector is
// off. Under the box: what works today, and the door for a firm that already runs.

// The line's last word is inked once as the page opens (decision 128): drawn in pencil, then
// inked left to right in the drafting blue and the agent's green (.hl-power, styles.tsx). The
// h1's own text is the line as written, so reading, copying and finding it stay plain; the ink
// is a picture of the same word laid over it. A line that does not end in the word is set as is.
const POWER = "superpowers";

function Headline() {
  const lead = site.tagline.endsWith(`${POWER}.`) ? site.tagline.slice(0, -(POWER.length + 1)) : null;
  return (
    <h1 id="home-title" className="type-hero max-[367px]:type-page m-0 max-w-5xl text-balance text-text">
      {lead === null ? (
        site.tagline
      ) : (
        <>
          {lead}
          <span className="hl-power" data-ink={POWER}>
            {POWER}
          </span>
          .
        </>
      )}
    </h1>
  );
}

const WAYS = [
  { id: "prompt", label: "Prompt", copy: "Copy the sentence" },
  { id: "code", label: "Claude Code", copy: "Copy the command" },
  { id: "mcp", label: "MCP URL", copy: "Copy the address" },
] as const;

export function HomeHero({ data }: { data: HomeData }) {
  const text = { prompt: data.prompt, code: data.command, mcp: data.mcpUrl } as const;
  return (
    <section id="top" aria-labelledby="home-title" className="hm-hero">
      <Headline />
      <p className="type-lede measure m-0 mt-4 md:mt-6">{site.subline}</p>

      <div className="hm-hosts mt-8 md:mt-10">
        <p className="type-label m-0 text-faint">Works with</p>
        <ul className="hm-host-list">
          {data.hosts.map((h) => (
            <li key={h.id}>
              <Link href={`/connect#${h.id}`} className="hm-host type-body-s">
                <Logo id={h.id} name={h.name} size="md" />
                {h.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* D224: composer style. The tabs are a pill switcher whose highlight slides (radios and
          :has(), so it works with scripts off); a copy sweeps light along the box (data-sweep). */}
      <div className="hm-box mt-6 print:hidden" data-sweep="">
        <fieldset className="hm-tabs">
          <legend className="sr-only">How to connect your agent</legend>
          <span className="hm-pills">
            <span aria-hidden="true" className="hm-pill" />
            {WAYS.map((w) => (
              <label key={w.id} className="hm-tab type-label">
                <input type="radio" name="hm-way" value={w.id} defaultChecked={w.id === "prompt"} />
                {w.label}
              </label>
            ))}
          </span>
          <span className="hm-box-chip">
            <NotLiveChip>Goes live at launch</NotLiveChip>
          </span>
        </fieldset>
        {WAYS.map((w) => (
          <div key={w.id} className="hm-way" data-way={w.id}>
            <PromptWell text={text[w.id]} id={`hm-way-${w.id}`} copyLabel={w.copy} />
          </div>
        ))}
      </div>

      <p className="hm-after type-body-s m-0 mt-4 text-muted">
        {data.today && (
          <span>
            Works today:{" "}
            <TextLink href={data.today.href} tone="accent" className="py-3 md:py-0">
              {data.today.text}
            </TextLink>
          </span>
        )}
        <span>
          Already run a firm?{" "}
          <TextLink href="/audit" tone="accent" className="py-3 md:py-0">
            Audit it
          </TextLink>
        </span>
      </p>
    </section>
  );
}
