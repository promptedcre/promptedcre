import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getCorpus } from "@/lib/content/load";
import { site } from "@/lib/site";

const base = site.url.replace(/\/+$/, "");
const urls = sitemap().map((e) => e.url);

describe("sitemap", () => {
  it("lists the home page and the new pages", () => {
    for (const path of ["", "/audit", "/plans", "/connect", "/run"]) expect(urls).toContain(`${base}${path}`);
  });

  it("has one URL per playbook in the corpus", () => {
    const { playbooks } = getCorpus();
    expect(playbooks.length).toBeGreaterThan(0);
    for (const p of playbooks) {
      expect(urls.filter((u) => u === `${base}/playbooks/${p.slug}`)).toHaveLength(1);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("puts every URL on the site", () => {
    for (const u of urls) expect(u === base || u.startsWith(`${base}/`)).toBe(true);
  });
});

describe("robots", () => {
  it("names the sitemap", () => {
    expect(robots().sitemap).toBe(`${base}/sitemap.xml`);
  });
});
