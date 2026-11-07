/** In-memory token bucket (engineering_spec §4: 30 agent runs/min/IP). */
type Bucket = { tokens: number; last: number };

export class TokenBucket {
  private buckets = new Map<string, Bucket>();
  constructor(private capacity: number, private refillPerMs: number, private now: () => number = Date.now) {}

  /** Returns { ok, retryAfterMs }. Consumes one token when ok. */
  take(key: string) {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, last: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.last) * this.refillPerMs);
    b.last = t;
    let ok = false;
    if (b.tokens >= 1) { b.tokens -= 1; ok = true; }
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.gc(t);
    return { ok, retryAfterMs: ok ? 0 : Math.ceil((1 - b.tokens) / this.refillPerMs) };
  }

  private gc(t: number) {
    for (const [k, b] of this.buckets) if (t - b.last > 10 * 60_000) this.buckets.delete(k);
  }
}

const g = globalThis as unknown as { __agentBucket?: TokenBucket };
/** Shared across hot reloads. */
export const agentBucket = (g.__agentBucket ??= new TokenBucket(30, 30 / 60_000));
