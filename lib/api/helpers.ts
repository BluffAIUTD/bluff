import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { ApiError } from "../errors";
import { getConfig } from "../config";
import { agentBucket } from "../ratelimit";
import { getContext, withSession, type RequestContext } from "../session";
import type { FailureMode } from "../agent/types";

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError("bad_input", "Request body must be JSON"); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiError("bad_input", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

/** 30 agent runs / minute / IP (engineering_spec §4). */
export function enforceAgentRateLimit(ctx: RequestContext) {
  const r = agentBucket.take(ctx.ip);
  if (!r.ok) throw new ApiError("rate_limited", `Too many checks. Try again in ${Math.ceil(r.retryAfterMs / 1000)}s.`);
}

/** `?fail=` forces a failure shape (spec §4); honored outside production or when the demo key is unlocked. */
export function failureFrom(req: Request, ctx: RequestContext): FailureMode | undefined {
  const f = new URL(req.url).searchParams.get("fail");
  if (f !== "timeout" && f !== "malformed" && f !== "ratelimit") return undefined;
  return !getConfig().isProd || ctx.demoUnlocked ? f : undefined;
}

/**
 * Demo controls. `strict` (reset, generation) always needs the presenter key in production. Non-strict controls
 * (simulating a charge from a store the judge just checked) are open while DEMO_MODE=1, because the core loop must work
 * on a judge's phone with no login (product_spec §1.1).
 */
export function requireDemo(ctx: RequestContext, opts: { strict?: boolean } = {}) {
  const c = getConfig();
  if (!c.isProd || ctx.demoUnlocked) return;
  if (!opts.strict && c.demoMode) return;
  throw new ApiError("forbidden", "Demo controls are locked");
}

export function requireEvalKey(req: Request) {
  const c = getConfig();
  const k = req.headers.get("x-eval-key");
  if (!c.evalKey || k !== c.evalKey) throw new ApiError("forbidden", "Eval key required");
}

export function json<T>(ctx: RequestContext, body: T, init?: ResponseInit) {
  return withSession(NextResponse.json(body, init), ctx);
}

export { getContext };
