// npm run rank:calibrate: compares the judge with the hand-verified golden cells.
// A market publishes only when the judge matches at least 18 of 20.
import { loadRankings } from "../../lib/rankings/load";
import { GOLDEN_CELLS, GOLDEN_TO_PUBLISH, marketView } from "../../lib/rankings/state";

const { rankings, errors } = loadRankings();
if (errors.length > 0) {
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
for (const m of rankings.markets) {
  const { calibration: c, published } = marketView(rankings, m);
  console.log(`\n${m.market.id}: ${c.matches} of ${c.cells} golden cells match (${c.judged} judged); needs ${GOLDEN_TO_PUBLISH} of ${GOLDEN_CELLS}: ${published ? "PUBLISHES" : "does not publish"}`);
  for (const miss of c.misses) {
    console.log(`  ${miss.cell.vendor}/${miss.cell.story}: golden ${miss.cell.verdict}, judge ${miss.judge ?? "not judged"}`);
  }
}
