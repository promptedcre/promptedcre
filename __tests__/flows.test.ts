import { describe, expect, it } from "vitest";
import { STAKES, findingStakes, getAuditPage } from "@/components/audit/data";
import { setupSteps } from "@/components/connect/host-steps";
import { getRecordedAudit } from "@/components/run/data";
import { scoreArithmetic } from "@/components/run/findings-report";
import { getRankingsSummary, scoreRange } from "@/components/rankings/summary";
import { getCorpus } from "@/lib/content/load";
import { HOSTS, addsLine } from "@/lib/hosts";

// The round-3 promises of /audit, /connect and /rankings, pinned to the data they read.

describe("the audit page", () => {
  const { audit } = getAuditPage();
  const corpus = getCorpus();

  it("quotes each stake word for word from the rule card the check cites, and links that card", () => {
    const withStake = audit.rows.filter((r) => r.stake);
    expect(withStake.map((r) => r.id).sort()).toEqual(STAKES.map((s) => s.check).sort());
    for (const r of withStake) {
      const pair = STAKES.find((s) => s.check === r.id);
      const card = corpus.rules.find((c) => c.id === pair?.rule);
      expect(card).toBeDefined();
      expect(card?.rule).toContain(r.stake?.text);
      expect(r.stake?.text.startsWith(pair?.opens ?? "?")).toBe(true);
      expect(r.stake?.text.endsWith(".")).toBe(true);
      expect(r.stake?.href).toBe(`/rules#rule-${card?.id}`);
      expect(r.stake?.rule).toBe(card?.title);
    }
  });

  it("puts a stake under each open finding whose check has one, by the sheet that carries it", () => {
    const recorded = getRecordedAudit();
    const stakes = findingStakes(audit, recorded.sheets);
    for (const f of recorded.sheets.flatMap((s) => s.findings)) {
      const row = audit.rows.find((r) => r.id === f.check.id);
      expect(stakes[f.id] ?? null).toEqual(row?.stake ?? null);
    }
    expect(Object.keys(stakes).length).toBeGreaterThan(0);
  });

  it("leads with the count of checks, split into who verifies them, from the audit record", () => {
    const pb = corpus.playbooks.find((p) => p.slug === audit.slug);
    expect(audit.checks).toBe(pb?.steps.length);
    expect(audit.agentChecks + audit.personChecks).toBe(audit.checks);
    expect(audit.agentChecks).toBe(audit.rows.filter((r) => r.agent).length);
  });

  it("names what it reads from the firm's files as the catalog names them", () => {
    const pb = corpus.playbooks.find((p) => p.slug === audit.slug);
    expect(audit.reads.map((r) => r.id)).toEqual(pb?.consumes);
    for (const r of audit.reads) expect(r.name).toBe(corpus.artifacts.find((a) => a.id === r.id)?.name);
  });

  it("spells the score's arithmetic so it adds up to the checks, with open and fixed findings", () => {
    const { findings } = getRecordedAudit();
    const { sum, findings: line } = scoreArithmetic(findings);
    const n = findings.checks.length;
    expect(sum.endsWith(`= ${n} checks`)).toBe(true);
    const added = [...sum.matchAll(/(\d+) [a-z ]+?(?= \+| =)/g)].reduce((t, m) => t + Number(m[1]), 0);
    expect(added).toBe(n);
    const open = findings.findings.filter((f) => f.status === "open").length;
    const fixed = findings.findings.filter((f) => f.status === "fixed").length;
    expect(line).toContain(`${open} open`);
    if (fixed > 0) expect(line).toContain(`${fixed} fixed`);
  });
});

describe("the hosts' order of work", () => {
  it("gives every host who adds the connector, steps that parse, and notes for whoever sets it up", () => {
    for (const h of HOSTS) {
      const steps = setupSteps(h.steps("https://example.test/api/mcp"));
      expect(steps.length).toBeGreaterThan(0);
      expect(addsLine(h)).toMatch(h.adds === "agent" ? /the agent/ : h.adds === "chat" ? /a person, by asking the agent in a chat/ : /a person, in the app's settings/);
      for (const line of h.setup("https://example.test/api/mcp")) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it("lets only a tested host lead with the paste-in sentence, and gives it a command to run", () => {
    for (const h of HOSTS.filter((x) => x.adds === "agent")) {
      expect(h.status).toBe("tested");
      expect(setupSteps(h.steps("https://example.test/api/mcp")).some((s) => s.codeKind === "command")).toBe(true);
    }
  });
});

describe("the rankings' score range", () => {
  it("reports the highest published score and the share of no-evidence verdicts, from the rows themselves", () => {
    const { markets, range } = getRankingsSummary();
    const scores = markets.flatMap((m) => m.ranked.map((r) => r.result.score)).filter((s): s is number => s !== null);
    if (scores.length === 0) {
      expect(range.top).toBeNull();
      return;
    }
    expect(range.top?.score).toBe(Math.max(...scores));
    expect(range.none).toBeLessThanOrEqual(range.verdicts);
    expect(scoreRange([])).toEqual({ top: null, verdicts: 0, none: 0 });
  });
});
