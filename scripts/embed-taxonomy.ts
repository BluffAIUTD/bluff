// Stores an embedding per taxonomy row (float8[]); taxonomy_match then uses cosine similarity instead of keywords.
// Usage: EMBED_MODEL=… NVIDIA_API_KEY=… npm run embed-taxonomy   (re-run after the real T-Mobile taxonomy is loaded)
import { getPool, closePool } from "../lib/db";
import { getConfig } from "../lib/config";

(async () => {
  const c = getConfig().nvidia;
  if (!c.apiKey || !c.embedModel) throw new Error("NVIDIA_API_KEY and EMBED_MODEL are required");
  const db = getPool();
  const rows = (await db.query("SELECT id, name, description, examples, red_flags FROM taxonomy ORDER BY id")).rows;
  let dims = 0;
  for (const r of rows) {
    const input = `${r.name}. ${r.description}. ${(r.examples as string[]).join(" ")} ${(r.red_flags as string[]).join(" ")}`.slice(0, 500);
    let emb: number[] | null = null;
    for (let attempt = 0; attempt < 3 && !emb; attempt++) {
      const res = await fetch(`${c.baseUrl}/embeddings`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({ model: c.embedModel, input: [input], input_type: "query", encoding_format: "float", truncate: "END" }),
      });
      if (res.ok) emb = ((await res.json()).data as { embedding: number[] }[])[0].embedding;
      else await new Promise((x) => setTimeout(x, 800 * (attempt + 1)));
    }
    if (!emb) throw new Error(`embedding failed for ${r.id}`);
    dims = emb.length;
    await db.query("UPDATE taxonomy SET embedding=$2 WHERE id=$1", [r.id, emb]);
  }
  console.log(`embedded ${rows.length} taxonomy rows (${dims} dims)`);
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(closePool);
