import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { doors, site } from "@/lib/site";
import { CopyButton } from "./copy-button";
import type { DoorId } from "./door-notes";
import { PromptWell } from "./prompt-card";
import { RadioSync } from "./radio-sync";

const DOOR_IDS = doors.map((d) => d.id);

// A CSS selector piece must not carry quotes or brackets from a prop.
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");

// The rules that make a door choice show and hide content with scripts off: inside #ROOT,
// anything marked data-m="start" or data-m="audit" follows the checked door. They go into
// the components layer; a hidden piece must stay hidden whatever display utility it carries,
// so the declaration is important.
export function doorRules(rootId: string, name: string): string {
  const root = safe(rootId);
  const n = safe(name);
  return DOOR_IDS.map(
    (id) => `#${root}:has(input[name="${n}"][value="${id}"]:checked) [data-m]:not([data-m~="${id}"]){display:none !important}`,
  ).join("\n");
}

// The classes one option of the setup form shares (a door, a host): a cell of the form, not
// a card. Checked, it takes the selected paper; the 2 px rule that marks it is drawn once per
// row and slides (.cn-opts, in connect-setup.tsx), and under the pointer an option shows where
// that rule would land (.cn-opt). Focus shows on the cell, since the radio itself is not drawn.
export const OPTION =
  "cn-opt relative min-w-0 cursor-pointer border-line p-4 transition-colors has-checked:bg-panel has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent-strong md:px-6";

// DoorOptions: the two front doors from lib/site.ts as the options of one radio group. The
// choice is carried by CSS alone (doorRules): inside the element whose id is the setup's
// root, everything marked data-m with the other door's id is hidden. With scripts on, the
// choice follows ?mode= in the URL. ConnectSetup is the one user.
export function DoorOptions({
  name = "door",
  notes,
  sync = "door",
  className,
}: {
  name?: string;
  notes?: Partial<Record<DoorId, ReactNode>>; // the line under each door's name (see doorNotes)
  sync?: string;
  className?: string;
}) {
  return (
    <>
      <RadioSync name={name} via="param" param="mode" defaultValue={DOOR_IDS[0]} sync={sync} />
      <div className={cx("cn-opts", className)}>
        {doors.map((d, i) => (
          <label key={d.id} className={cx(OPTION, "flex flex-col gap-1", i > 0 && "border-l")}>
            <input type="radio" name={name} value={d.id} defaultChecked={i === 0} data-sync={sync} className="sr-only" />
            <span className="type-title-s text-text">{d.label}</span>
            {notes?.[d.id] && <span className="type-body-s text-muted">{notes[d.id]}</span>}
          </label>
        ))}
      </div>
    </>
  );
}

// DoorPrompts: the sentence to paste, one per door, each marked data-m so it follows the
// chosen door. The well is the sentence alone; its Copy button sits under it, in a slot
// that holds its height once scripts are known to be on (.cn-copy), so nothing moves when
// the button arrives. `primary` fills the button: the page's one filled control when the
// connector is live.
export function DoorPrompts({ idPrefix = "door-prompt", primary = false }: { idPrefix?: string; primary?: boolean }) {
  return (
    <>
      {doors.map((d) => {
        const id = `${safe(idPrefix)}-${d.id}`;
        const text = d.prompt(site.url);
        return (
          <div key={d.id} data-m={d.id} className="flex flex-col gap-3">
            <PromptWell text={text} id={id} copy={false} />
            <div className="cn-copy">
              <CopyButton text={text} label={`Copy the sentence: ${d.label}`} selectId={id} variant={primary ? "primary" : "secondary"} size="md">
                Copy the sentence
              </CopyButton>
            </div>
          </div>
        );
      })}
    </>
  );
}
