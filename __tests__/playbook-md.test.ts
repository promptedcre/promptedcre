import { describe, expect, it } from "vitest";
import { isAgentStep } from "@/lib/compute/metrics";
import { applicableSteps } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
import { hasPlaybookMd, latestReview, PLAYBOOK_MD_VIEW, playbookMarkdown, playbookMdPath, playbookMdView } from "@/lib/export/playbook-md";
import { STRUCTURES, type Structure } from "@/lib/schemas/common";
import type { Playbook } from "@/lib/schemas/playbook";

// lib/export/playbook-md.ts turns a written record into the Markdown file served at
// /playbooks/<slug>/playbook.md. These tests read every written record's file and
// check it says what the page says, in the order the file promises.

const corpus = getCorpus();
const written = corpus.playbooks.filter((p) => p.depth === "full");
const ORIGIN = "https://example.test";
const DAY = "2026-11-13";

function md(pb: Playbook): string {
  return playbookMarkdown(pb, {
    rules: corpus.rules,
    artifacts: corpus.artifacts,
    review: latestReview(corpus.reviews, pb.id),
    origin: ORIGIN,
    computedOn: DAY,
  });
}

function bySlug(slug: string): Playbook {
  const pb = corpus.playbooks.find((p) => p.slug === slug);
  if (!pb) throw new Error(`no record ${slug}`);
  return pb;
}

describe("playbook.md for every written record", () => {
  it("gives every written record a file and no outline one", () => {
    expect(written.length).toBeGreaterThan(0);
    for (const pb of written) expect(hasPlaybookMd(pb)).toBe(true);
    for (const pb of corpus.playbooks.filter((p) => p.depth === "outline")) expect(hasPlaybookMd(pb)).toBe(false);
    expect(playbookMdPath("x")).toBe("/playbooks/x/playbook.md");
  });

  it.each(written.map((pb) => [pb.slug, pb] as const))("%s", (_, pb) => {
    const text = md(pb);
    // The file is read in the view it is made for: the default view, or the first
    // structure a record is written for when it is not written for the default one.
    const view = playbookMdView(pb);
    expect(view).not.toBeNull();
    expect(pb.written.structure).toContain(view!.structure);
    const steps = applicableSteps(pb, view!);
    expect(steps.length).toBeGreaterThan(0);
    const Noun = pb.kind === "audit" ? "Check" : "Step";
    const noun = Noun.toLowerCase();

    // The title first, then the two lines for the agent.
    const lines = text.split("\n");
    expect(lines[0]).toBe(`# ${pb.title}`);
    expect(lines[2]).toContain(`do each ${noun} marked "agent" yourself`);
    expect(lines[2]).toContain("stop, tell me what the person must do, and wait");
    expect(lines[3]).toContain("files on my machine");

    // The sections in the promised order.
    const at = (s: string) => text.indexOf(s);
    const order = ["## What it is", "## Status", `## ${Noun}s`, "## Rule cards", "## Sources", `From ${ORIGIN}/playbooks/${pb.slug}, computed ${DAY}.`];
    const present = order.filter((s) => at(s) >= 0);
    expect(present.map(at)).toEqual(present.map(at).slice().sort((a, b) => a - b));
    expect(text).toContain(pb.summary);
    expect(text).toContain("Not legal advice");
    expect(text).toContain("- Coverage: Federal + Texas");
    if (pb.lastVerified) expect(text).toContain(`- Sources checked: ${pb.lastVerified}`);

    // Every step of the file's view, numbered in order, with who does it.
    const heads = lines.filter((l) => l.startsWith(`### ${Noun} `));
    expect(heads).toEqual(steps.map((s, i) => `### ${Noun} ${String(i + 1).padStart(2, "0")}. ${s.title}`));
    const stops = lines.filter((l) => l.startsWith("Who: ") && l.includes("Stop here"));
    expect(stops).toHaveLength(steps.filter((s) => !isAgentStep(s)).length);

    // An agent's step that needs a person's yes says to ask first where the agent reads it,
    // never "Do this step." or "Do this check." (CH02: a pasted file has no engine to refuse).
    steps.forEach((s, i) => {
      if (!isAgentStep(s)) return;
      const head = `### ${Noun} ${String(i + 1).padStart(2, "0")}. ${s.title}`;
      const whoLine = text.slice(text.indexOf(head)).split("\n")[2] ?? "";
      if (s.approval === "none") expect(whoLine, `${pb.slug}/${s.id}`).toMatch(new RegExp(`\\. Do this ${noun}\\.$`));
      else {
        expect(whoLine, `${pb.slug}/${s.id}`).toMatch(/\. Ask first[,:]/);
        expect(whoLine).not.toContain(`Do this ${noun}.`);
      }
    });
    expect(text).toContain(`an agent can do ${steps.filter(isAgentStep).length} of them`);

    // Every source and every cited rule's law, with its address.
    for (const s of pb.sources) expect(text).toContain(`[${s.title}](${s.url})`);
    const ruleIds = new Set(steps.flatMap((s) => s.rules));
    for (const id of ruleIds) {
      const r = corpus.rules.find((x) => x.id === id);
      expect(r).toBeTruthy();
      expect(text).toContain(`### ${r!.title}`);
      expect(text).toContain(`[${r!.citation.authority}](${r!.citation.url})`);
    }
    expect(lines.filter((l) => l.startsWith("Rule `")).length).toBe(ruleIds.size);

    // A common-practice step says so; a cited one lists its sources.
    const commonPractice = lines.filter((l) => l === "- Sources: common practice, with no public source to cite").length;
    expect(commonPractice).toBe(steps.filter((s) => s.sources.length === 0).length);
  });
});

describe("playbook.md asks first where a person's yes is needed", () => {
  it("asks before the wire-fraud warning goes out (wire-instructions-change, step 06)", () => {
    const pb = bySlug("wire-instructions-change");
    const steps = applicableSteps(pb, playbookMdView(pb)!);
    const sixth = steps[5];
    expect(sixth && isAgentStep(sixth) && sixth.approval).toBe("every-run");
    const text = md(pb);
    const block = text.slice(text.indexOf(`### Step 06. ${sixth!.title}`));
    expect(block.split("\n")[2]).toBe("Who: agent. Ask first: say what you are about to do, and wait for my yes. Ask again each time.");
  });

  it("names the one lookup approval of an audit at its public-record check", () => {
    const pb = bySlug("audit-entity-standing");
    const text = md(pb);
    const block = text.slice(text.indexOf("### Check 01. "));
    const check = applicableSteps(pb, playbookMdView(pb)!)[0];
    expect(check?.approval).toBe("standing");
    expect(block.split("\n")[2]).toMatch(/^Who: agent in a browser\. Ask first, once per audit: before you look anything up in a public record/);
  });
});

describe("playbook.md for Form D", () => {
  const pb = bySlug("file-form-d-and-state-notices");
  const text = md(pb);

  it("says the review and stops at the person's steps", () => {
    const review = latestReview(corpus.reviews, pb.id);
    expect(text).toContain(review ? `- Review: Practitioner-reviewed on ${review.date}` : "- Review: AI-drafted");
    const login = pb.steps.find((s) => s.id === "set-up-login-gov");
    expect(login?.mode).toBe("human-online");
    const block = text.slice(text.indexOf(`. ${login!.title}`));
    expect(block.split("\n")[2]).toBe("Who: person online, principal. Stop here: tell me what the person must do, and wait.");
  });

  it("names the gates of the filing step and what it waits on", () => {
    const head = text.indexOf("Approve, sign and file the Form D on EDGAR");
    const block = text.slice(head, text.indexOf("### ", head + 1));
    expect(block).toContain("Gates: signature, irreversible.");
    expect(block).toMatch(/- Waits on: steps? \d\d/);
  });

  it("says where the structures differ, at the step", () => {
    // The fund-only and JV-only steps are outside the syndication view, each told where it sits.
    for (const id of ["fund-items", "jv-decide-filing"]) {
      const s = pb.steps.find((x) => x.id === id);
      expect(s).toBeTruthy();
      expect(text).not.toContain(`. ${s!.title}\n`);
      expect(text).toContain(`the step "${s!.title}"`);
    }
    expect(text).toMatch(/Not in this view: for the JV structure, the step "[^"]+" \(person online, counsel\) comes before step 01\./);
    expect(text).toMatch(/Not in this view: for the fund structure, the step "[^"]+" \(agent\) comes after this step\./);
  });
});

// A record may be written for fewer than three structures. Its file is then made for
// the first structure it is written for, and says so under Status. The cases below build
// such a record from a written one, so they hold whatever the catalog contains.
describe("playbook.md for a record not written for every structure", () => {
  const structureWord = (s: Structure) => (s === "jv" ? "JV" : s);

  // A written record none of whose steps is limited to a structure, declared as written for fewer.
  function redeclared(structure: Structure[]): Playbook {
    const base = written.find((p) => p.kind === "process" && p.steps.every((s) => !s.when));
    if (!base) throw new Error("no written record without a step condition");
    return { ...base, written: { ...base.written, structure } };
  }

  // The line the file prints for the structures a record covers, built here from the record alone.
  function expectedLine(pb: Playbook): string {
    const names = STRUCTURES.filter((s) => pb.written.structure.includes(s)).map((s) => (s === "jv" ? "joint venture (JV)" : s));
    const missing = STRUCTURES.filter((s) => !pb.written.structure.includes(s)).map((s) => `a ${structureWord(s)}`);
    return `- Written for the ${names.join(" and ")} structure${names.length > 1 ? "s" : ""} only. It has no steps for ${missing.join(" or ")}.`;
  }

  it("keeps the default view, and its status line, for every record written for it", () => {
    const byDefault = written.filter((pb) => pb.written.structure.includes(PLAYBOOK_MD_VIEW.structure));
    expect(byDefault.length).toBeGreaterThan(0);
    for (const pb of byDefault) {
      expect(playbookMdView(pb)).toEqual(PLAYBOOK_MD_VIEW);
      expect(md(pb)).toContain("- This file: the syndication structure, industrial property. ");
    }
  });

  it("adds the written-for line only when a structure is missing", () => {
    for (const pb of written) {
      const every = STRUCTURES.every((s) => pb.written.structure.includes(s));
      const lines = md(pb)
        .split("\n")
        .filter((l) => l.startsWith("- Written for the "));
      expect(lines, pb.slug).toHaveLength(every ? 0 : 1);
      if (!every) expect(lines[0]).toBe(expectedLine(pb));
    }
    // A step limited to some structures of a record written for all three still says so, as before.
    expect(md(bySlug("onboard-an-investor"))).toContain("Only in the syndication and JV structures.");
  });

  it("makes the file for the one structure a record is written for", () => {
    const jvOnly = redeclared(["jv"]);
    expect(playbookMdView(jvOnly)).toEqual({ ...PLAYBOOK_MD_VIEW, structure: "jv" });
    expect(hasPlaybookMd(jvOnly)).toBe(true);
    const text = md(jvOnly);
    const lines = text.split("\n");
    const at = lines.findIndex((l) => l.startsWith("- This file: "));
    expect(lines[at]).toMatch(new RegExp(`^- This file: the JV structure, industrial property\\. ${jvOnly.steps.length} steps; an agent can do \\d+ of them\\.$`));
    expect(lines[at + 1]).toBe("- Written for the joint venture (JV) structure only. It has no steps for a syndication or a fund.");
    expect(text).not.toContain("the jv structure");
    expect(lines.filter((l) => l.startsWith("Not in this view:"))).toEqual([]);
    expect(lines.filter((l) => l.startsWith("### Step "))).toHaveLength(jvOnly.steps.length);
  });

  it("takes the structures in the catalog's order, whatever order the record lists them in", () => {
    const fundAndJv = redeclared(["jv", "fund"]);
    expect(playbookMdView(fundAndJv)?.structure).toBe("fund");
    const text = md(fundAndJv);
    expect(text).toContain("- This file: the fund structure, industrial property. ");
    expect(text).toContain("- Written for the fund and joint venture (JV) structures only. It has no steps for a syndication.");
    expect(playbookMdView(redeclared(["fund", "jv"]))?.structure).toBe("fund");
    // Alphabetical order, or the record's own, would put JV first here.
    const synAndJv = redeclared(["jv", "syndication"]);
    expect(playbookMdView(synAndJv)).toEqual(PLAYBOOK_MD_VIEW);
    expect(md(synAndJv)).toContain("- Written for the syndication and joint venture (JV) structures only. It has no steps for a fund.");
    expect(md(redeclared(["syndication", "fund"]))).toContain("- Written for the syndication and fund structures only. It has no steps for a JV.");
  });

  it("keeps the notes about steps limited to one structure, in a file made for another view", () => {
    // Form D has one fund-only step and one JV-only step. Declared as written for fund and JV, its
    // file is the fund view: the fund step is in it and says so, the JV step is told where it sits.
    const formD = bySlug("file-form-d-and-state-notices");
    const partial: Playbook = { ...formD, written: { ...formD.written, structure: ["fund", "jv"] } };
    expect(playbookMdView(partial)?.structure).toBe("fund");
    const text = md(partial);
    expect(text).toContain("- This file: the fund structure, industrial property. ");
    expect(text).toContain("- Written for the fund and joint venture (JV) structures only. It has no steps for a syndication.");
    const fundStep = formD.steps.find((s) => s.id === "fund-items");
    const jvStep = formD.steps.find((s) => s.id === "jv-decide-filing");
    expect(fundStep && jvStep).toBeTruthy();
    const block = text.slice(text.indexOf(`. ${fundStep!.title}\n`));
    expect(block.slice(0, block.indexOf("### ", 1))).toContain("Only in the fund structure.");
    expect(text).not.toContain(`. ${jvStep!.title}\n`);
    expect(text).toMatch(/Not in this view: for the JV structure, the step "[^"]+" \([^)]+\) comes before step 01\./);
    // The notes and the waits are worked out for the file's own view, not the default one: the fund
    // step is in this view, so nothing says it is outside it, and the filing step waits on it.
    expect(text).not.toContain("Not in this view: for the fund structure");
    const number = new Map(applicableSteps(partial, { ...PLAYBOOK_MD_VIEW, structure: "fund" }).map((s, i) => [s.id, i + 1] as const));
    const fundN = number.get("fund-items");
    expect(fundN).toBeTruthy();
    const waitsOnFund = text.split("\n").filter((l) => l.startsWith("- Waits on: ") && (l.match(/\d\d/g) ?? ([] as string[])).includes(String(fundN).padStart(2, "0")));
    expect(waitsOnFund.length).toBeGreaterThan(0);
  });

  it("has no file for a record written for no structure", () => {
    const none = redeclared([]);
    expect(playbookMdView(none)).toBeNull();
    expect(hasPlaybookMd(none)).toBe(false);
    expect(() => md(none)).toThrow(/not written/);
  });

  it("gives each catalog record that is not written for the default structure a file in one it is written for", () => {
    for (const pb of written.filter((p) => !p.written.structure.includes(PLAYBOOK_MD_VIEW.structure))) {
      const view = playbookMdView(pb);
      expect(view, pb.slug).not.toBeNull();
      expect(pb.written.structure).toContain(view!.structure);
      expect(md(pb)).toContain(`- This file: the ${structureWord(view!.structure)} structure, `);
    }
  });
});

describe("playbook.md refuses what it cannot write", () => {
  it("throws for an outline", () => {
    const outline = corpus.playbooks.find((p) => p.depth === "outline");
    expect(outline).toBeTruthy();
    expect(() => md(outline!)).toThrow(/not written/);
  });
});
