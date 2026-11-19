import { describe, expect, it } from "vitest";
import { computeMetrics, isAgentStep } from "@/lib/compute/metrics";
import {
  countHandoffs,
  firstSentence,
  groupByStructure,
  playbookFacts,
  plainText,
  recordTimes,
  variantDifferences,
} from "@/lib/compute/playbook-facts";
import { applicableSteps, DEFAULT_VARIANT, isResearched, type Variant } from "@/lib/compute/variant";
import { getCorpus } from "@/lib/content/load";
import { STRUCTURES, type Structure } from "@/lib/schemas/common";
import type { Playbook, Step } from "@/lib/schemas/playbook";

function step(id: string, over: Partial<Step> = {}): Step {
  return {
    id,
    title: `Step ${id}`,
    instruction: "An instruction long enough for the schema.",
    mode: "agent",
    modeBasis: "Synthetic test step.",
    risk: "low",
    undo: "reversible",
    approval: "none",
    effort: null,
    elapsed: null,
    after: [],
    rules: [],
    calculators: [],
    consumes: [],
    produces: [],
    basis: "practitioner",
    sources: [],
    ...over,
  };
}

function book(steps: Step[]): Playbook {
  return {
    id: "synthetic",
    slug: "synthetic",
    kind: "process",
    title: "Synthetic",
    summary: "A synthetic playbook for tests.",
    phase: "raise",
    order: 1,
    featured: false,
    depth: "full",
    review: "ai-drafted",
    lastVerified: "2026-11-11",
    requires: [],
    consumes: [],
    produces: [],
    written: { structure: ["syndication", "fund", "jv"], jurisdiction: ["us-federal", "us-tx"] },
    sources: [],
    steps,
    outlineSteps: [],
  };
}

const v = (structure: Structure): Variant => ({ ...DEFAULT_VARIANT, structure });
const person = (id: string, over: Partial<Step> = {}) => step(id, { mode: "human-online", actor: "principal", ...over });

describe("playbook facts on the real corpus", () => {
  const written = getCorpus().playbooks.filter((pb) => pb.depth === "full");

  it("has written records to check", () => {
    expect(written.length).toBeGreaterThan(0);
  });

  for (const pb of written) {
    for (const structure of STRUCTURES) {
      it(`${pb.slug} (${structure}) agrees with the step data`, () => {
        const variant = v(structure);
        const f = playbookFacts(pb, variant);
        const m = computeMetrics(pb, variant);
        const steps = isResearched(pb, variant) ? applicableSteps(pb, variant) : [];

        expect(f.researched).toBe(m.researched);
        expect(f.steps).toBe(m.total);
        expect(f.agent).toBe(m.agent);
        expect(f.agent + f.person).toBe(f.steps);

        const gated = steps.filter((s) => s.approval === "signature" || s.undo !== "reversible");
        expect(f.gates.map((g) => g.id)).toEqual(gated.map((s) => s.id));
        for (const g of f.gates) {
          expect(steps[g.n - 1]?.id).toBe(g.id);
          expect(g.signature || g.irreversible || g.hardToUndo).toBe(true);
        }
        expect(f.gates.filter((g) => g.signature).length).toBe(f.signatures);
        expect(f.gates.filter((g) => g.irreversible).length).toBe(f.irreversible);
        expect(f.gates.filter((g) => g.hardToUndo).length).toBe(f.hardToUndo);

        expect(f.costs.map((c) => c.stepId)).toEqual(steps.filter((s) => s.cost).map((s) => s.id));

        expect(f.licensed.reduce((n, l) => n + l.count, 0)).toBe(steps.filter((s) => s.licensed).length);
        expect(f.actors.reduce((n, a) => n + a.count, 0)).toBe(steps.filter((s) => s.actor).length);
        expect(f.rules).toBe(new Set(steps.flatMap((s) => s.rules)).size);
        expect(f.calculators).toEqual([...new Set(steps.flatMap((s) => s.calculators))]);

        const firstPerson = steps.findIndex((s) => !isAgentStep(s));
        expect(f.firstPersonStep?.n ?? null).toBe(firstPerson === -1 ? null : firstPerson + 1);
        expect(f.handoffs).toBeLessThanOrEqual(Math.max(0, f.steps - 1));
      });
    }
  }

  it("finds no variant differences where no step carries a structure condition", () => {
    const plain = written.filter((pb) => pb.steps.every((s) => !s.when?.structure));
    expect(plain.length).toBeGreaterThan(0);
    for (const pb of plain) expect(variantDifferences(pb)).toEqual([]);
  });

  it("lists every structure-conditioned step as an add or a drop somewhere", () => {
    for (const pb of written) {
      const diff = variantDifferences(pb);
      const named = new Set(diff.flatMap((d) => [...d.adds, ...d.drops].map((s) => s.id)));
      for (const s of pb.steps) {
        const only = s.when?.structure;
        if (!only) continue;
        const differs = pb.written.structure.some((st) => st !== "syndication" && only.includes(st) !== only.includes("syndication"));
        expect(named.has(s.id)).toBe(differs);
      }
    }
  });

  it("writes a whole first sentence for every instruction, never cut", () => {
    for (const pb of written) {
      for (const s of pb.steps) {
        const line = firstSentence(s.instruction);
        expect(line.length).toBeGreaterThan(10);
        expect(plainText(s.instruction).startsWith(line)).toBe(true);
        expect(line.endsWith("…")).toBe(false);
      }
    }
  });
});

describe("playbook facts on synthetic steps", () => {
  it("counts handoffs where the work passes between agent and person", () => {
    expect(countHandoffs([])).toBe(0);
    expect(countHandoffs([step("a"), step("b")])).toBe(0);
    expect(countHandoffs([step("a"), step("b", { mode: "agent-browser" })])).toBe(0);
    expect(countHandoffs([step("a"), person("b")])).toBe(1);
    expect(countHandoffs([person("a"), step("b"), step("c"), person("d", { mode: "human-offline" }), step("e")])).toBe(3);
    expect(countHandoffs([person("a"), person("b", { actor: "counsel" })])).toBe(0);
  });

  it("counts handoffs over the steps of the variant in view", () => {
    const pb = book([step("a"), person("b", { when: { structure: ["fund"] } }), step("c")]);
    expect(playbookFacts(pb, v("syndication")).handoffs).toBe(0);
    expect(playbookFacts(pb, v("fund")).handoffs).toBe(2);
  });

  it("collects gates, costs, people, rules and sources", () => {
    const pb = book([
      step("a", { rules: ["us-fed.x.one"], sources: ["s1"], calculators: ["calc-a"] }),
      person("b", { approval: "signature", undo: "irreversible", cost: { text: "A made-up fee", sourceId: "s2" } }),
      person("c", { actor: "counsel", licensed: "attorney", undo: "hard-to-undo", rules: ["us-fed.x.one", "us-tx.y.two"] }),
      step("d", { approval: "every-run", calculators: ["calc-b", "calc-a"], effort: { min: 1, max: 2, unit: "hours", basis: "cited", sourceId: "s3" } }),
      person("e", { approval: "standing", sources: ["s1"] }),
    ]);
    const f = playbookFacts(pb, v("syndication"));
    expect(f).toMatchObject({
      researched: true,
      steps: 5,
      agent: 2,
      person: 3,
      signatures: 1,
      everyRunApprovals: 1,
      standingApprovals: 1,
      irreversible: 1,
      hardToUndo: 1,
      licensed: [{ kind: "attorney", count: 1 }],
      actors: [
        { actor: "principal", count: 2 },
        { actor: "counsel", count: 1 },
      ],
      costs: [{ stepId: "b", stepTitle: "Step b", text: "A made-up fee", n: 2 }],
      rules: 2,
      sources: 3,
      calculators: ["calc-a", "calc-b"],
      handoffs: 3,
      firstPersonStep: { id: "b", title: "Step b", n: 2 },
      gates: [
        { id: "b", title: "Step b", n: 2, signature: true, irreversible: true, hardToUndo: false },
        { id: "c", title: "Step c", n: 3, signature: false, irreversible: false, hardToUndo: true },
      ],
    });
  });

  it("numbers steps within the variant and reports nothing for an unresearched one", () => {
    const pb = book([step("a", { when: { structure: ["jv"] } }), person("b")]);
    expect(playbookFacts(pb, v("syndication")).firstPersonStep).toEqual({ id: "b", title: "Step b", n: 1 });
    expect(playbookFacts(pb, v("jv")).firstPersonStep).toEqual({ id: "b", title: "Step b", n: 2 });
    pb.written.structure = ["syndication"];
    const none = playbookFacts(pb, v("jv"));
    expect(none).toMatchObject({ researched: false, steps: 0, agent: 0, person: 0, gates: [], firstPersonStep: null });
    expect(playbookFacts({ ...pb, depth: "outline" }, v("syndication")).steps).toBe(0);
  });

  it("names the steps each structure adds and drops against syndication", () => {
    const pb = book([
      step("a"),
      step("fund-only", { when: { structure: ["fund"] } }),
      person("not-fund", { when: { structure: ["syndication", "jv"] } }),
      person("jv-only", { mode: "human-offline", when: { structure: ["jv"] } }),
    ]);
    expect(variantDifferences(pb)).toEqual([
      {
        structure: "fund",
        adds: [{ id: "fund-only", title: "Step fund-only", mode: "agent" }],
        drops: [{ id: "not-fund", title: "Step not-fund", mode: "human-online" }],
      },
      { structure: "jv", adds: [{ id: "jv-only", title: "Step jv-only", mode: "human-offline" }], drops: [] },
    ]);
    pb.written.structure = ["syndication", "fund"];
    expect(variantDifferences(pb).map((d) => d.structure)).toEqual(["fund"]);
    expect(variantDifferences(book([step("a"), step("b", { when: { jurisdiction: ["us-tx"] } })]))).toEqual([]);
  });
});

describe("record times", () => {
  const hours = (min: number, max: number) => ({ min, max, unit: "hours" as const, basis: "practitioner" as const });
  const days = (min: number, max: number) => ({ min, max, unit: "days" as const, basis: "practitioner" as const });

  it("sums hands-on time and follows the longest chain for calendar time when every step is estimated", () => {
    const pb = book([
      step("a", { effort: hours(1, 2), elapsed: days(1, 2) }),
      step("b", { after: ["a"], effort: hours(2, 3), elapsed: days(3, 4) }),
      step("c", { after: ["a"], effort: hours(1, 1), elapsed: days(1, 1) }),
    ]);
    expect(recordTimes(pb, v("syndication"))).toEqual({ handsOn: "4–6 h", calendar: "4–6 d" });
  });

  it("gives no total when any step in view has no estimate", () => {
    const pb = book([step("a", { effort: hours(1, 2), elapsed: days(1, 1) }), step("b")]);
    expect(recordTimes(pb, v("syndication"))).toEqual({ handsOn: null, calendar: null });
    const onlyFund = book([step("a", { effort: hours(1, 2) }), step("b", { when: { structure: ["fund"] } })]);
    expect(recordTimes(onlyFund, v("syndication")).handsOn).toBe("1–2 h");
    expect(recordTimes(onlyFund, v("fund")).handsOn).toBeNull();
  });
});

describe("groupByStructure", () => {
  it("draws one group when every structure agrees", () => {
    expect(groupByStructure(() => 3)).toEqual([{ structures: [...STRUCTURES], value: 3 }]);
  });

  it("groups the structures that share a value, in structure order", () => {
    const pb = book([step("a"), step("b", { when: { structure: ["fund"] } }), step("c")]);
    const groups = groupByStructure((s) => playbookFacts(pb, v(s)).steps);
    expect(groups).toEqual([
      { structures: ["syndication", "jv"], value: 2 },
      { structures: ["fund"], value: 3 },
    ]);
  });

  it("uses the key to decide when two values are the same", () => {
    const groups = groupByStructure((s) => ({ s, n: 1 }), (x) => String(x.n));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.structures).toEqual([...STRUCTURES]);
  });
});

describe("first sentence", () => {
  it("stops at the first sentence end", () => {
    expect(firstSentence("Open the form. Then sign it.")).toBe("Open the form.");
    expect(firstSentence("Is the filing due? Check the date.")).toBe("Is the filing due?");
    expect(firstSentence("No terminator at all")).toBe("No terminator at all");
  });

  it("does not stop at abbreviations", () => {
    expect(firstSentence("Check U.S. Treasury records for the entity. Then file.")).toBe("Check U.S. Treasury records for the entity.");
    expect(firstSentence("Pull a public filing, e.g. Form D, for the issuer. Next step.")).toBe("Pull a public filing, e.g. Form D, for the issuer.");
    expect(firstSentence("Use a template, i.e. the standard one. Next.")).toBe("Use a template, i.e. the standard one.");
    expect(firstSentence("Name Example Holdings Inc. Partner as the payee. Next.")).toBe("Name Example Holdings Inc. Partner as the payee.");
    expect(firstSentence("Read Sec. 12 of the made-up act. Next.")).toBe("Read Sec. 12 of the made-up act.");
    expect(firstSentence("Cite Form No. 7 in the cover letter. Next.")).toBe("Cite Form No. 7 in the cover letter.");
    expect(firstSentence("See 17 C.F.R. 230.506 for the rule. Next.")).toBe("See 17 C.F.R. 230.506 for the rule.");
  });

  it("still stops after a word that only looks like an abbreviation", () => {
    expect(firstSentence("This playbook covers an LLC. A partnership differs.")).toBe("This playbook covers an LLC.");
    expect(firstSentence("File Form D. The state notice follows.")).toBe("File Form D.");
    expect(firstSentence("Answer no. Then move on.")).toBe("Answer no.");
  });

  it("keeps decimals and section references whole", () => {
    expect(firstSentence("Interest runs at 1.5% a month on a $2.65 million base. Next.")).toBe("Interest runs at 1.5% a month on a $2.65 million base.");
    expect(firstSentence("Check the district under Code 49.452. If it applies, give notice.")).toBe("Check the district under Code 49.452.");
    expect(firstSentence("Read section 4.2.1 and Rule 506(c). Then decide.")).toBe("Read section 4.2.1 and Rule 506(c).");
    expect(firstSentence("Open example.test/forms first. Next.")).toBe("Open example.test/forms first.");
  });

  it("never cuts inside parentheses or quotation marks", () => {
    expect(firstSentence("Name the file to the rules (lowercase. No spaces.) and upload it. Next.")).toBe(
      "Name the file to the rules (lowercase. No spaces.) and upload it.",
    );
    expect(firstSentence("Mark the box “Yes. Filed.” and save. Next.")).toBe("Mark the box “Yes. Filed.” and save.");
    expect(firstSentence('Type "Done. Filed." in the log. Next.')).toBe('Type "Done. Filed." in the log.');
    expect(firstSentence("Save it (see the manual.) Then upload.")).toBe("Save it (see the manual.)");
    expect(firstSentence('The clerk writes "received." Then it is filed.')).toBe('The clerk writes "received."');
  });

  it("does not stop when a lowercase word follows", () => {
    expect(firstSentence("Allow approx. two weeks. Then follow up.")).toBe("Allow approx. two weeks.");
    expect(firstSentence("Bring forms, etc. and a pen. Next.")).toBe("Bring forms, etc. and a pen.");
  });

  it("strips markup and reads only the first paragraph", () => {
    expect(plainText("File **Form D** via `EDGAR`, see [the rule](https://example.test/r).")).toBe("File Form D via EDGAR, see the rule.");
    expect(firstSentence("Use `notes.txt` and **sign**. Then [file it](https://example.test/f).")).toBe("Use notes.txt and sign.");
    expect(firstSentence("First paragraph without an end\n\nSecond paragraph. More.")).toBe("First paragraph without an end");
    expect(firstSentence("  Spaced   out\n words. Next.")).toBe("Spaced out words.");
  });

  it("keeps a long sentence whole", () => {
    const long = `${"word ".repeat(60).trim()} (with an aside that runs on). Next.`;
    expect(firstSentence(long)).toBe(`${"word ".repeat(60).trim()} (with an aside that runs on).`);
  });
});
