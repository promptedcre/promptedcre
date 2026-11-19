import { createHash } from "node:crypto";
import type { EvidencePack } from "../schemas/rankings";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

// One evidence item: the page and the words taken from it.
export function itemHash(url: string, excerpt: string): string {
  return sha256(`${url}\n${excerpt}`);
}

// Everything the judge sees for one vendor. A verdict records this hash; when the
// evidence changes, the hash changes and the vendor must be judged again.
export function packHash(pack: EvidencePack): string {
  const items = [...pack.items]
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
    .map((i) => ({ id: i.id, tier: i.tier, url: i.url, excerpt: i.excerpt, fetched: i.fetched, note: i.note ?? null }));
  const coverage = Object.fromEntries(
    Object.entries(pack.coverage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, v ? { url: v.url, found: v.found, note: v.note ?? null } : null]),
  );
  return sha256(JSON.stringify({ vendor: pack.vendor, coverage, items }));
}
