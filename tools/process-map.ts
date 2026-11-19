// Rewrites the generated part of docs/PROCESS_MAP.md from lib/engine/processes.ts.
//   npx tsx tools/process-map.ts          prints whether the map is current
//   npx tsx tools/process-map.ts --write  updates it
import fs from "node:fs";
import path from "node:path";
import { withMachines } from "../lib/engine/map";

const file = path.resolve(path.dirname(process.argv[1] ?? "."), "..", "docs", "PROCESS_MAP.md");
const current = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const next = withMachines(current);

if (process.argv.includes("--write")) {
  fs.writeFileSync(file, next, "utf8");
  console.log(current === next ? "OK  the process map was already current" : "OK  the process map is updated");
} else if (current === next) {
  console.log("OK  the process map matches lib/engine/processes.ts");
} else {
  console.error("FAIL  docs/PROCESS_MAP.md is out of date; run: npx tsx tools/process-map.ts --write");
  process.exit(1);
}
