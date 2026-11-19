import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findSecrets, firmArtifacts, firmDecisions, firmProfile, firmProgress } from "@/lib/schemas/firm";

const dir = path.join(process.cwd(), "content", "example-firm");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));

describe("example firm file", () => {
  it("validates against the firm-file schemas", () => {
    expect(firmProfile.safeParse(read("firm.json")).success).toBe(true);
    expect(firmDecisions.safeParse(read("decisions.json")).success).toBe(true);
    expect(firmProgress.safeParse(read("progress.json")).success).toBe(true);
    expect(firmArtifacts.safeParse(read("artifacts.json")).success).toBe(true);
  });

  it("holds no tax ids or account numbers", () => {
    for (const name of ["firm.json", "decisions.json", "progress.json", "artifacts.json"]) {
      expect(findSecrets(read(name))).toEqual([]);
    }
  });

  it("flags values that look like secrets", () => {
    const bad = { principals: [{ name: "A", role: "B", note: "EIN 12-3456789" }], bank: "account 000123456789" };
    const found = findSecrets(bad);
    expect(found.some((m) => m.includes("looks like an EIN"))).toBe(true);
    expect(found.some((m) => m.includes("account or routing number"))).toBe(true);
  });
});
