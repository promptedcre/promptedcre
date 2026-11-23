import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { DEBT_EXAMPLE } from "@/lib/calculators/debt";
import { getCorpus, loadCorpus } from "@/lib/content/load";
import { HOSTS, statusLine } from "@/lib/hosts";
import { TOOLS } from "@/lib/mcp/server";
import * as t from "@/lib/mcp/tools";
import { findSecrets, firmArtifacts, firmDecisions, firmProfile, firmProgress } from "@/lib/schemas/firm";
import { JURISDICTIONS, STRUCTURES } from "@/lib/schemas/common";
import { z } from "zod";

// Talks to the real route handler, the way a client would over streamable HTTP.
async function rpc(method: string, params: Record<string, unknown> = {}, id = 1): Promise<Record<string, unknown>> {
  const res = await POST(
    new Request("http://127.0.0.1:3300/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  expect(res.status).toBe(200);
  const text = await res.text();
  // the reply is either plain JSON or one server-sent event carrying it
  const json = text.trim().startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "{}";
  return JSON.parse(json) as Record<string, unknown>;
}

describe("MCP endpoint", () => {
  it("initializes as promptedcre with instructions", async () => {
    const r = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    const result = r.result as { serverInfo: { name: string }; instructions?: string };
    expect(result.serverInfo.name).toBe("promptedcre");
    expect(result.instructions).toContain("firm file");
  });

  it("lists sixteen read-only tools within the description budget", async () => {
    const r = await rpc("tools/list");
    const tools = (r.result as { tools: { name: string; description: string; annotations?: { readOnlyHint?: boolean }; inputSchema: unknown }[] }).tools;
    expect(tools).toHaveLength(16);
    expect(tools.every((x) => x.annotations?.readOnlyHint === true)).toBe(true);
    const descriptions = tools.reduce((n, x) => n + x.description.length, 0);
    const schemas = tools.reduce((n, x) => n + JSON.stringify(x.inputSchema).length, 0);
    // plan section 10: measure the total description size; keep the listing small
    expect(descriptions).toBeLessThan(2500);
    expect(descriptions + schemas).toBeLessThan(12000);
  });

  it("serves the pilot playbook in step order with sources", async () => {
    const r = await rpc("tools/call", { name: "get_playbook", arguments: { slug: "file-form-d-and-state-notices" } });
    const content = (r.result as { content: { text: string }[] }).content;
    const pb = JSON.parse(content[0]?.text ?? "{}") as { title: string; steps: { n: number; sources: unknown[] }[]; agentShare: number };
    expect(pb.title).toContain("Form D");
    expect(pb.steps.map((s) => s.n)).toEqual(pb.steps.map((_, i) => i + 1));
    expect(pb.steps.some((s) => s.sources.length > 0)).toBe(true);
    expect(pb.agentShare).toBeGreaterThan(0);
  });

  it("runs a calculator and returns its trace and rules", async () => {
    const r = await rpc("tools/call", { name: "calc_debt", arguments: DEBT_EXAMPLE as unknown as Record<string, unknown> });
    const content = (r.result as { content: { text: string }[] }).content;
    const out = JSON.parse(content[0]?.text ?? "{}") as { result: { trace: unknown[] } };
    expect(out.result.trace.length).toBeGreaterThan(0);
  });

  it("reports bad input and unknown records as tool errors, not crashes", async () => {
    const r = await rpc("tools/call", { name: "get_rule", arguments: { id: "us-fed.no-such-rule" } });
    expect((r.result as { isError?: boolean }).isError).toBe(true);
  });
});

describe("tools", () => {
  it("finds the Form D playbook and the right situation", () => {
    expect(t.search({ query: "form d notice filing" }).hits[0]?.id).toBe("file-form-d-and-state-notices");
    const match = t.matchSituation({ description: "We got an email that the wire instructions for closing changed" });
    expect(match.matches[0]?.slug).toBe("wire-instructions-change");
  });

  it("publishes a firm-file spec the example firm satisfies", () => {
    const spec = t.firmFileSpec();
    expect(Object.keys(spec.files)).toEqual(["firm.json", "decisions.json", "progress.json", "artifacts.json"]);
    expect(spec.rules.join(" ")).toContain("Unknown is null");
    const { errors } = loadCorpus();
    expect(errors).toEqual([]);
    // the JSON Schemas come from the same zod schemas the validator uses
    for (const s of [firmProfile, firmDecisions, firmProgress, firmArtifacts]) expect(z.toJSONSchema(s)).toHaveProperty("type", "object");
  });

  it("keeps every tool name unique and every description short", () => {
    expect(new Set(TOOLS.map((x) => x.name)).size).toBe(TOOLS.length);
    expect(TOOLS.every((x) => x.description.length <= 200)).toBe(true);
  });

  // practitioner run, 2026-11-12: the Texas-only variant listed a Delaware step as a prerequisite
  it("lists only prerequisites inside the variant asked for", () => {
    const full = loadCorpus().corpus.playbooks.filter((p) => p.depth === "full");
    expect(full.length).toBeGreaterThan(0);
    const sets = [["us-federal", "us-tx"], ["us-federal", "us-de"], [...JURISDICTIONS]] as const;
    for (const pb of full) {
      for (const structure of STRUCTURES) {
        for (const jurisdictions of sets) {
          const out = t.getPlaybook({ slug: pb.slug, structure, jurisdictions: [...jurisdictions] }) as {
            steps: { id: string; after: string[] }[];
            applicableSteps: number;
            researchedForThisVariant: boolean;
          };
          const where = `${pb.slug} ${structure} ${jurisdictions.join("+")}`;
          const ids = new Set(out.steps.map((s) => s.id));
          for (const s of out.steps) for (const a of s.after) expect(ids.has(a), `${where}: ${s.id} after ${a}`).toBe(true);
          // the count and the list say the same thing, and a variant that is not written has neither
          expect(out.steps.length, where).toBe(out.applicableSteps);
          expect(out.steps.length > 0, where).toBe(out.researchedForThisVariant);
        }
      }
    }
    const tx = t.getPlaybook({ slug: "form-sponsor-entity" }) as { steps: { id: string; after: string[] }[] };
    expect(tx.steps.find((s) => s.id === "confirm-boi-status")?.after).toEqual(["file-texas-certificate"]);
  });

  // A record may be written for fewer than three structures. Asked for one it is not written
  // for, the tool returns no steps and says what the record is written for.
  it("returns no steps for a structure a record is not written for, and says what it is written for", () => {
    const full = loadCorpus().corpus.playbooks.filter((p) => p.depth === "full");
    const listed = t.listPlaybooks({ depth: "full" }).items;
    for (const pb of full) {
      const row = listed.find((i) => i.slug === pb.slug);
      expect(row?.writtenForStructures, pb.slug).toEqual(pb.written.structure);
      // the list's share and times are the syndication view's: null exactly when the record is not written for it
      const noSyndication = !pb.written.structure.includes("syndication");
      expect(row?.agentShareSyndication === null, pb.slug).toBe(noSyndication);
      expect(row?.handsOn === null, pb.slug).toBe(noSyndication);
      expect(row?.calendar === null, pb.slug).toBe(noSyndication);
      for (const structure of STRUCTURES) {
        const out = t.getPlaybook({ slug: pb.slug, structure }) as {
          steps: unknown[];
          researchedForThisVariant: boolean;
          writtenFor: { structure: string[]; jurisdiction: string[] };
          agentShare: number | null;
          applicableSteps: number;
          handsOn: unknown;
          calendar: unknown;
          note?: string;
        };
        const here = pb.written.structure.includes(structure);
        expect(out.researchedForThisVariant, `${pb.slug} ${structure}`).toBe(here);
        expect(out.writtenFor).toEqual(pb.written);
        if (here) {
          expect(out.steps.length).toBeGreaterThan(0);
          expect(out.note).toBeUndefined();
          // a view that is written keeps its two times: only a view that is not written gets null
          expect(out.handsOn).toMatchObject({ value: expect.any(String) });
          expect(out.calendar).toMatchObject({ value: expect.any(String) });
        } else {
          expect(out.steps).toEqual([]);
          expect(out.applicableSteps).toBe(0);
          expect(out.agentShare).toBeNull();
          expect([out.handsOn, out.calendar]).toEqual([null, null]);
          expect(out.note).toContain(`Written for structure ${pb.written.structure.join(", ")}`);
        }
      }
    }
    for (const row of t.listPlaybooks({ depth: "outline" }).items) expect(row.writtenForStructures).toBeNull();
  });

  // The same, on a record made for the test, so it holds whatever the catalog contains: a written
  // record with no conditions on its steps, added to the catalog as written for a joint venture only.
  it("returns no steps for the default structure of a record written for one structure only", () => {
    const corpus = getCorpus();
    const base = corpus.playbooks.find((p) => p.depth === "full" && p.kind === "process" && p.steps.every((s) => !s.when));
    expect(base).toBeTruthy();
    const slug = "synthetic-jv-only";
    type Reply = {
      variant: { structure: string };
      steps: unknown[];
      researchedForThisVariant: boolean;
      applicableSteps: number;
      agentSteps: number;
      agentShare: number | null;
      handsOn: unknown;
      calendar: unknown;
      writtenFor: { structure: string[]; jurisdiction: string[] };
      note?: string;
    };
    corpus.playbooks.push({ ...base!, id: slug, slug, written: { ...base!.written, structure: ["jv"] } });
    try {
      const row = t.listPlaybooks({ depth: "full" }).items.find((i) => i.slug === slug);
      expect(row).toMatchObject({ writtenForStructures: ["jv"], agentShareSyndication: null, handsOn: null, calendar: null });

      const asked = t.getPlaybook({ slug }) as Reply;
      expect(asked.variant.structure).toBe("syndication");
      expect(asked).toMatchObject({ researchedForThisVariant: false, steps: [], applicableSteps: 0, agentSteps: 0, agentShare: null, handsOn: null, calendar: null });
      expect(asked.writtenFor).toEqual({ structure: ["jv"], jurisdiction: base!.written.jurisdiction });
      expect(asked.note).toContain("Written for structure jv");
      expect(asked.note).toContain("only if it describes the deal");
      expect((t.getPlaybook({ slug, structure: "fund" }) as Reply).steps).toEqual([]);

      const jv = t.getPlaybook({ slug, structure: "jv" }) as Reply;
      expect(jv.researchedForThisVariant).toBe(true);
      expect(jv.steps).toHaveLength(base!.steps.length);
      expect(jv.applicableSteps).toBe(base!.steps.length);
      expect(jv.agentShare).not.toBeNull();
      expect(jv.handsOn).not.toBeNull();
      expect(jv.calendar).not.toBeNull();
      expect(jv.note).toBeUndefined();
    } finally {
      corpus.playbooks.pop();
    }
    expect(getCorpus().playbooks.some((p) => p.slug === slug)).toBe(false);
  });

  it("lists audits as their own kind, with planned checks while they are outlines", () => {
    const { corpus } = loadCorpus();
    const audits = corpus.playbooks.filter((p) => p.kind === "audit");
    const listed = t.listPlaybooks({ kind: "audit" });
    expect(listed.count).toBe(audits.length);
    expect(listed.items.every((i) => i.kind === "audit")).toBe(true);
    expect(t.status().counts.audits).toBe(audits.length);
    expect(t.listPlaybooks({ kind: "process" }).items.some((i) => i.kind === "audit")).toBe(false);
    for (const a of audits.filter((p) => p.depth === "outline")) {
      const out = t.getPlaybook({ slug: a.slug }) as { stepTitles: string[]; depth: string };
      expect(out.depth).toBe("outline");
      expect(out.stepTitles.length).toBeGreaterThan(0);
      // an outline claims no agent share and no review
      expect(listed.items.find((i) => i.slug === a.slug)).toMatchObject({ agentShareSyndication: null, review: null });
    }
  });

  it("says a record's review as what it is, with the date its sources were checked beside AI-drafted", () => {
    const full = loadCorpus().corpus.playbooks.filter((p) => p.depth === "full");
    const drafted = full.find((p) => p.review === "ai-drafted");
    const reviewed = full.find((p) => p.review === "practitioner-reviewed");
    expect(drafted && reviewed).toBeTruthy();
    const listed = t.listPlaybooks({ depth: "full" }).items;
    expect(listed.find((i) => i.slug === drafted?.slug)?.review).toBe("AI-drafted");
    expect(listed.find((i) => i.slug === reviewed?.slug)?.review).toBe("Practitioner-reviewed");
    const out = t.getPlaybook({ slug: drafted?.slug ?? "" }) as { review: string; lastVerified: string | null };
    expect(out).toMatchObject({ review: "AI-drafted", lastVerified: drafted?.lastVerified ?? null });
  });

  it("matches no situation for a process question and names the closest process", () => {
    const m = t.matchSituation({ description: "adopt an existing LLC as the sponsor" });
    expect(m.matches).toEqual([]);
    // Among the three closest by word overlap, not always first, since the Form phase is written in full (D254).
    expect(m.processes.map((p) => p.slug)).toContain("form-sponsor-entity");
    expect(t.matchSituation({ description: "a tenant stopped paying rent" }).matches[0]?.slug).toBe("tenant-stops-paying");
  });
});

describe("firm file", () => {
  it("records an entity that already exists, gaps included", () => {
    const profile = {
      schemaVersion: 1,
      name: "Example Holdings Series LLC",
      entity: {
        type: "series-llc",
        state: "TX",
        status: "formed",
        formedOn: null,
        fileNumber: "0000000000",
        formerNames: ["Example Holdings LLC"],
        management: "member-managed",
        taxClassification: null,
        registeredAgent: { name: "Sample Registered Agent Co.", office: null, consent: null, confirmedOn: null },
      },
      structure: "syndication",
      propertyTypes: ["industrial"],
      jurisdictions: ["us-federal", "us-tx"],
      principals: [{ name: "Alex Example", role: "Sole member" }],
      series: [{ name: "Series A", designatedOn: null, note: "planned" }],
    };
    expect(firmProfile.safeParse(profile).success).toBe(true);
    expect(firmDecisions.safeParse({ schemaVersion: 1, items: [{ date: null, decision: "Form the LLC without counsel", by: "Alex Example", playbook: null, note: "Date unknown." }] }).success).toBe(true);
    expect(
      firmProgress.safeParse({
        schemaVersion: 1,
        playbooks: { "form-sponsor-entity": { steps: { "check-name-texas": { status: "not-applicable", date: null, note: "Name already on file." } } } },
        other: [{ task: "Designate the first series", status: "todo", date: null, playbook: "set-up-series", note: null }],
      }).success,
    ).toBe(true);
    expect(firmArtifacts.safeParse({ schemaVersion: 1, items: [{ artifact: "certificate-of-amendment", path: null, date: null, note: "Filed copy not found." }] }).success).toBe(true);
    // a file written before these fields existed still validates
    const before = { ...profile, entity: { type: "llc", state: "TX", status: "formed", formedOn: "2026-01-15" } } as Record<string, unknown>;
    delete before.series;
    expect(firmProfile.safeParse(before).success).toBe(true);
  });

  it("lets labeled public file numbers through and still flags secrets", () => {
    expect(findSecrets({ note: "Filed 2026-01-15, file no. 0000000000." })).toEqual([]);
    expect(findSecrets({ entity: { fileNumber: "0000000000" } })).toEqual([]);
    expect(findSecrets({ note: "EDGAR accession number 0000000000-26-000001" })).toEqual([]);
    expect(findSecrets({ note: "operating account 000000000000" })).toHaveLength(1);
    expect(findSecrets({ entity: { fileNumber: "00-0000000" } })).toHaveLength(1);
    expect(findSecrets({ note: "file no. 00-0000000" })).toHaveLength(1);
  });
});

describe("connect pages", () => {
  it("/install names the MCP URL on the serving host and every tool", async () => {
    const { GET } = await import("@/app/install/route");
    const text = await GET(new Request("https://example.test/install")).text();
    expect(text).toContain("https://example.test/api/mcp");
    expect(text).toContain("claude mcp add --transport http promptedcre https://example.test/api/mcp");
    for (const tool of TOOLS) expect(text).toContain(tool.name);
  });

  it("/install lists every host with the status it has earned, and says how to audit", async () => {
    const { GET } = await import("@/app/install/route");
    const text = await GET(new Request("https://example.test/install")).text();
    for (const h of HOSTS) {
      expect(text).toContain(`${h.name}${h.detail ? ` (${h.detail})` : ""}\n  Status: ${statusLine(h)}.`);
      for (const line of h.steps("https://example.test/api/mcp")) expect(text).toContain(line);
    }
    expect(text).toContain("Audit a firm that already exists");
  });

  it("claims a host is tested only with a date and what was run", () => {
    expect(HOSTS.length).toBeGreaterThan(0);
    expect(new Set(HOSTS.map((h) => h.id)).size).toBe(HOSTS.length);
    for (const h of HOSTS) {
      expect(h.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.basis.length).toBeGreaterThan(10);
      expect(statusLine(h)).toContain(h.status === "tested" ? "tested" : h.status === "documented" ? "not run yet" : "not checked yet");
    }
  });

  it("/llms.txt links the written playbooks and the connector", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const text = await GET(new Request("https://example.test/llms.txt")).text();
    expect(text.startsWith("# PromptedCRE")).toBe(true);
    expect(text).toContain("https://example.test/install");
    expect(text).toContain("/playbooks/file-form-d-and-state-notices");
  });
});
