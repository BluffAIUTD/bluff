// Stores an embedding per taxonomy row (float8[]); taxonomy_match then uses cosine similarity instead of keywords.
// Usage: EMBED_MODEL=… NVIDIA_API_KEY=… npm run embed-taxonomy
// Re-embeds EVERY row. Run it after `npm run db:seed` whenever data/taxonomy.ts changes: the seed clears the embedding of
// any row whose text changed, and taxonomy_match only uses embeddings when every row has one.
import { getPool, closePool } from "../lib/db";
import { getConfig } from "../lib/config";
import { TAXONOMY_BY_ID } from "../data/taxonomy";

/** Text embedded for one category: name, description, examples and its red flags (or, for legit categories, its cues). */
export function embedInput(r: { id: string; name: string; description: string; examples: string[]; red_flags: string[] }): string {
  const t = TAXONOMY_BY_ID.get(r.id);
  const flags = (r.red_flags.length ? r.red_flags : t?.cues ?? []).map((k) => k.replace(/_/g, " "));
  const kind = t ? (t.kind === "scam" ? "Scam message." : "Legitimate message.") : "";
  return `${kind} ${r.name}. ${r.description}. ${r.examples.join(" ")} ${flags.join(", ")}`.trim().slice(0, 500);
}

async function main() {
  const c = getConfig().nvidia;
  if (!c.apiKey || !c.embedModel) throw new Error("NVIDIA_API_KEY and EMBED_MODEL are required");
  const db = getPool();
  const rows = (await db.query("SELECT id, name, description, examples, red_flags FROM taxonomy ORDER BY id")).rows;
  let dims = 0;
  for (const r of rows) {
    let emb: number[] | null = null;
    for (let attempt = 0; attempt < 4 && !emb; attempt++) {
      const res = await fetch(`${c.baseUrl}/embeddings`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({ model: c.embedModel, input: [embedInput(r)], input_type: "query", encoding_format: "float", truncate: "END" }),
      });
      if (res.ok) emb = ((await res.json()).data as { embedding: number[] }[])[0].embedding;
      else await new Promise((x) => setTimeout(x, 1500 * (attempt + 1)));
    }
    if (!emb) throw new Error(`embedding failed for ${r.id}`);
    dims = emb.length;
    await db.query("UPDATE taxonomy SET embedding=$2 WHERE id=$1", [r.id, emb]);
  }
  console.log(`embedded ${rows.length} taxonomy rows (${dims} dims)`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(closePool);
