// Fills in the hash of every evidence item that lacks one.
//   npm run rank:seal -- <market-id>      (or no argument for every market)
import fs from "node:fs";
import path from "node:path";
import { itemHash } from "../../lib/rankings/hash";
import { MARKETS_DIR } from "../../lib/rankings/load";

const only = process.argv[2];
const markets = fs.readdirSync(MARKETS_DIR).filter((m) => !only || m === only);
if (only && markets.length === 0) {
  console.error(`no market "${only}"`);
  process.exit(2);
}
let sealed = 0;
let files = 0;
for (const m of markets) {
  const dir = path.join(MARKETS_DIR, m, "evidence");
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const file = path.join(dir, name);
    const pack = JSON.parse(fs.readFileSync(file, "utf8")) as { items?: { url: string; excerpt: string; hash?: string }[] };
    let changed = false;
    for (const item of pack.items ?? []) {
      if (item.hash) continue;
      item.hash = itemHash(item.url, item.excerpt);
      sealed += 1;
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`);
      files += 1;
    }
  }
}
console.log(`sealed ${sealed} items in ${files} files`);
