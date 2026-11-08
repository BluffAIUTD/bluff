/**
 * Import the T-Mobile Safe Signal synthetic message set into the Call the Bluff card pool.
 *
 *   npm run tmobile:import -- data/tmobile/messages.csv
 *   npm run tmobile:import -- path.jsonl --limit 300 --text-col message --label-col label --category-col scam_type
 *   flags: --dry-run (print, write nothing)  --no-ai (rules-only red flags)  --replace (drop previously imported rows of this file)
 *          --origin "label" (shown on the card; default "T-Mobile Safe Signal")
 * TMOBILE_DATA in .env is used when no path is given.
 */
import fs from "node:fs";
import path from "node:path";
import { getPool, closePool } from "../../lib/db";
import { annotate, cardKind, detectColumns, parseDataset, toMessages } from "../../lib/tmobile";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const OPT_WITH_VALUE = new Set(["--limit", "--text-col", "--label-col", "--category-col", "--sender-col", "--origin"]);

async function main() {
  const file = args.find((a, i) => !a.startsWith("--") && !OPT_WITH_VALUE.has(args[i - 1] ?? "")) ?? process.env.TMOBILE_DATA;
  if (!file) throw new Error("Usage: npm run tmobile:import -- <file.csv|json|jsonl>  (or set TMOBILE_DATA)");
  const src = fs.readFileSync(file, "utf8");
  const rows = parseDataset(src, file);
  const cols = detectColumns(rows, { text: opt("text-col"), label: opt("label-col"), category: opt("category-col"), sender: opt("sender-col") });
  const { messages, skipped } = toMessages(rows, cols);
  const limit = Number(opt("limit") ?? 250);
  // Keep a balanced sample: scams and legit messages interleaved, deterministic order.
  const scam = messages.filter((m) => m.isScam), legit = messages.filter((m) => !m.isScam);
  const sample = [...scam.slice(0, Math.ceil(limit * 0.6)), ...legit.slice(0, Math.floor(limit * 0.4))];
  const origin = opt("origin") ?? "T-Mobile Safe Signal";
  const fileTag = `${origin} · ${path.basename(file)}`;
  console.log(`${rows.length} rows · columns ${JSON.stringify(cols)} · ${messages.length} usable (${scam.length} scam, ${legit.length} legit), ${skipped} skipped · importing ${sample.length}`);

  const ann = await annotate(sample, { useAi: !flag("no-ai"), onBatch: (n) => process.stdout.write(`\r  red flags: ${n}/${sample.filter((m) => m.isScam).length}`) });
  process.stdout.write("\n");
  const cards = sample.map((m) => ({ m, flags: m.isScam ? ann.get(m.id)?.flags ?? [] : [], by: ann.get(m.id)?.by }))
    .filter((c) => !c.m.isScam || c.flags.length > 0);
  const byAi = cards.filter((c) => c.by === "nemotron").length;
  console.log(`${cards.length} cards ready · red flags by Nemotron: ${byAi}, by rules: ${cards.filter((c) => c.by === "rules").length} · dropped ${sample.length - cards.length} scams with no verbatim flag`);

  if (flag("dry-run")) {
    for (const c of cards.slice(0, 6)) console.log(JSON.stringify({ scam: c.m.isScam, category: c.m.category, text: c.m.text.slice(0, 90), flags: c.flags }));
    return;
  }
  const db = getPool();
  if (flag("replace")) {
    const r = await db.query("DELETE FROM game_cards WHERE source='tmobile' AND origin=$1", [fileTag]);
    console.log(`replaced ${r.rowCount} earlier rows`);
  }
  for (const c of cards) {
    const content = { ...(c.m.sender ? { from: c.m.sender.slice(0, 60) } : {}), body: c.m.text };
    await db.query(
      "INSERT INTO game_cards (day, kind, content, is_scam, red_flags, category, source, origin) VALUES (NULL,$1,$2,$3,$4,$5,'tmobile',$6)",
      [cardKind(c.m), JSON.stringify(content), c.m.isScam, JSON.stringify(c.flags), c.m.category, fileTag],
    );
  }
  console.log(`inserted ${cards.length} T-Mobile cards (origin "${fileTag}"). Today's set is rebuilt on next open if nobody has played yet.`);
}

main().then(() => closePool()).catch(async (e) => { console.error((e as Error).message); await closePool().catch(() => {}); process.exit(1); });
