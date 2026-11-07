export type Segment = { text: string; why?: string };

/** Split text into plain and flagged segments. Spans match verbatim (first occurrence); overlapping spans are skipped. */
export function highlightSpans(text: string, flags: { span: string; why: string }[]): Segment[] {
  const hits: { start: number; end: number; why: string }[] = [];
  for (const f of flags) {
    if (!f.span) continue;
    const i = text.indexOf(f.span);
    if (i < 0) continue;
    const end = i + f.span.length;
    if (hits.some((h) => i < h.end && end > h.start)) continue;
    hits.push({ start: i, end, why: f.why });
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push({ text: text.slice(pos, h.start) });
    out.push({ text: text.slice(h.start, h.end), why: h.why });
    pos = h.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out.length ? out : [{ text }];
}
