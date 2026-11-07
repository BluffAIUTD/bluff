// Seeds eval/stretch.jsonl with the 15 hand-written game cards (hand-labeled by the team). Extend to 40-50 cases by hand.
import fs from "node:fs";
import { CARD_SEEDS } from "../../data/cards";

const rows = CARD_SEEDS.map((c, i) => ({
  id: `h${String(i).padStart(2, "0")}`, kind: c.kind, label: c.isScam ? "scam" : "legit", category: c.category,
  text: [c.content.subject, c.content.body].filter(Boolean).join(". "),
}));
fs.writeFileSync("eval/stretch.jsonl", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`wrote eval/stretch.jsonl (${rows.length} cases; target 40-50)`);
