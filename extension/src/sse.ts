export type SseEvent = { event: string; data: unknown };

/**
 * Incremental SSE parser for fetch() streams (service workers have no EventSource). Feed chunks; returns complete events.
 * Comment lines (the server's ": ping" heartbeats) are not events; `onComment` is told about each one.
 */
export class SseParser {
  private buf = "";
  constructor(private opts: { onComment?: (text: string) => void } = {}) {}
  push(chunk: string): SseEvent[] {
    this.buf += chunk.replace(/\r\n/g, "\n");
    const out: SseEvent[] = [];
    let i: number;
    while ((i = this.buf.indexOf("\n\n")) >= 0) {
      const block = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2);
      let event = "message"; const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) { this.opts.onComment?.(line.slice(1).trim()); continue; }
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      try { out.push({ event, data: JSON.parse(data.join("\n")) }); } catch { /* ignore malformed block */ }
    }
    return out;
  }
}
