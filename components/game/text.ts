import { highlightSpans } from "@/lib/client/highlight";

export type Tap = { start: number; end: number };
export type Token = { text: string; start: number; end: number; word: boolean };

const LEAD = /^[("“‘'[]+/;
const TRAIL = /[)"”’'\],:;!?]+$|\.+$/;

/**
 * Split a message body into tappable words and the whitespace between them, with character offsets into the body.
 * A word's tap range drops surrounding quotes/punctuation ("fee:" taps "fee"), falling back to the whole word.
 */
export function wordTokens(body: string): Token[] {
  const out: Token[] = [];
  let pos = 0;
  for (const part of body.split(/(\s+)/)) {
    if (!part) continue;
    out.push({ text: part, start: pos, end: pos + part.length, word: !/^\s+$/.test(part) });
    pos += part.length;
  }
  return out;
}

export function tapRange(t: Token): Tap {
  const lead = LEAD.exec(t.text)?.[0].length ?? 0;
  const trail = TRAIL.exec(t.text.slice(lead))?.[0].length ?? 0;
  const start = t.start + lead, end = t.end - trail;
  return end > start ? { start, end } : { start: t.start, end: t.end };
}

export type RevealSegment = { text: string; why?: string; tapped?: boolean };

/** Red-flag highlights (verbatim spans) plus the word the player tapped, as non-overlapping segments in order. */
export function revealSegments(body: string, flags: { span: string; why: string }[], tap: Tap | null): RevealSegment[] {
  const flagged: { start: number; end: number; why: string }[] = [];
  let pos = 0;
  for (const s of highlightSpans(body, flags)) {
    if (s.why) flagged.push({ start: pos, end: pos + s.text.length, why: s.why });
    pos += s.text.length;
  }
  const cuts = new Set([0, body.length, ...flagged.flatMap((f) => [f.start, f.end]), ...(tap ? [tap.start, tap.end] : [])]);
  const points = [...cuts].filter((n) => n >= 0 && n <= body.length).sort((a, b) => a - b);
  const out: RevealSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (a === b) continue;
    const why = flagged.find((f) => a >= f.start && b <= f.end)?.why;
    const tapped = !!tap && a >= tap.start && b <= tap.end;
    const last = out[out.length - 1];
    if (last && last.why === why && !!last.tapped === tapped) last.text += body.slice(a, b);
    else out.push({ text: body.slice(a, b), ...(why ? { why } : {}), ...(tapped ? { tapped } : {}) });
  }
  return out.length ? out : [{ text: body }];
}

/** "HH:MM:SS" for a duration in ms (never negative). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
