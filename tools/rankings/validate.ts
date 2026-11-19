// npm run rank:validate: schema and evidence checks for rankings/ (build plan section 9, step 4).
import { loadCorpus } from "../../lib/content/load";
import { rankingsIssues } from "../../lib/rankings/check";
import { loadRankings } from "../../lib/rankings/load";
import { marketView } from "../../lib/rankings/state";

const { rankings, errors } = loadRankings();
const { corpus } = loadCorpus();
const issues = rankingsIssues(rankings, corpus.reviews);
// a market can be marked reviewed only once it is published
for (const e of corpus.reviews.filter((x) => x.kind === "market")) {
  const m = rankings.markets.find((x) => x.market.id === e.id);
  if (m && !marketView(rankings, m).published) issues.errors.push(`reviews.json › market:${e.id}: reviewed, but the market is not published (calibration below 18 of 20)`);
}
const all = [...errors, ...issues.errors];
for (const w of issues.warnings) console.warn(`warn  ${w}`);
if (all.length > 0) {
  for (const e of all) console.error(`  ${e}`);
  console.error(`\n${all.length} problem(s) in rankings/`);
  process.exit(1);
}
for (const m of rankings.markets) {
  const view = marketView(rankings, m);
  const count = (s: string) => view.rows.filter((r) => r.status === s).length;
  const cal = view.calibration;
  console.log(
    `OK  ${m.market.id}: ${m.vendors.length} vendors (${count("judged")} judged, ${count("untested")} untested, ${count("dropped")} dropped); ` +
      `golden ${cal.matches}/${cal.cells}${view.published ? ", published" : ", not published"}`,
  );
}
