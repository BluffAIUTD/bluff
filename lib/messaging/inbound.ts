import type pg from "pg";
import { getConfig } from "../config";
import { one } from "../db";
import { runToCompletion } from "../agent/runs";
import { agentBucket } from "../ratelimit";
import { createDispute } from "../disputes";
import { ApiError } from "../errors";
import { VERDICT_TEXT, type Verdict } from "../schemas";
import { HELP_TEXT, parseCommand } from "./commands";
import { notify, type NotifyResult } from "./notify";
/** A text the user sends Bluff from the phone preview. */
export type InboundMessage = { from: string; text: string; providerId: string; hasImage: boolean };

export const MAX_INBOUND_CHARS = 2000;
export const HOLDING_AFTER_MS = 10_000;
const holdingMs = () => Number(process.env.HOLDING_MS) || HOLDING_AFTER_MS;

/** P3-2 reply: "{Verdict label} ({score}/100, {confidence}% sure). Why: {top 2 evidence}. Do: {top next step}." */
export function verdictReply(v: Verdict, opts: { basic?: boolean } = {}): string {
  if (v.verdict === "unsure" && v.confidence < 0.5) {
    return "I'm not sure about this one. Don't click links in it; contact the company through its official app.";
  }
  const why = v.evidence.slice(0, 2).map((e) => e.replace(/[.!]+$/, "")).join("; ");
  const base = `${VERDICT_TEXT[v.verdict]} (${v.score}/100, ${Math.round(v.confidence * 100)}% sure). Why: ${why}. Do: ${v.next_steps[0].replace(/[.!]+$/, "")}.`;
  return opts.basic || v.mode === "basic" ? `${base} (basic check)` : base;
}

type Ctx = { db: pg.Pool; msg: InboundMessage; userId: string | null; phone: string };

async function reply(c: Ctx, body: string, verdictId?: string | null): Promise<NotifyResult> {
  if (!c.userId) {
    // Guest (no account): the reply is stored without a user.
    const r = await c.db.query("INSERT INTO messages (user_id, phone, direction, body, kind, status, verdict_id) VALUES (NULL,$1,'out',$2,'reply','delivered',$3) RETURNING id", [c.phone, body, verdictId ?? null]);
    return { status: "delivered", messageId: r.rows[0].id };
  }
  return notify(c.db, { userId: c.userId, eventKey: "", body, kind: "reply", verdictId });
}

async function lastAlert(db: pg.Pool, userId: string, key: "exposure_id" | "txn_id") {
  return one<{ meta: Record<string, string> }>(db, "SELECT meta FROM messages WHERE user_id=$1 AND kind='alert' AND direction='out' AND meta ? $2 ORDER BY created_at DESC LIMIT 1", [userId, key]);
}

async function runCommand(c: Ctx, cmd: ReturnType<typeof parseCommand> & string): Promise<string> {
  if (cmd === "HELP") return HELP_TEXT;
  if (!c.userId) return "I can check texts and links for you. Forward one over and I'll tell you what I think.";
  const { db, userId } = c as Ctx & { userId: string };
  if (cmd === "STOP") {
    await db.query("UPDATE users SET alerts_paused=true WHERE id=$1", [userId]);
    return "Alerts paused. I'll still check anything you forward. Text HELP anytime.";
  }
  if (cmd === "WATCH" || cmd === "SAFE") {
    const a = await lastAlert(db, userId, "exposure_id");
    const exp = a ? await one<{ id: string; host: string; label: string }>(db, "SELECT id, host, label FROM exposures WHERE id=$1 AND user_id=$2", [a.meta.exposure_id, userId]) : null;
    if (!exp) return "I don't have a recent alert to act on. Forward me a text or link to check.";
    if (cmd === "WATCH") {
      await db.query("UPDATE exposures SET watch=true WHERE id=$1", [exp.id]);
      return `Got it. I'll watch your charges for anything that matches ${exp.host}.`;
    }
    await db.query("INSERT INTO allowlist (host, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [exp.host, userId]);
    await db.query("INSERT INTO allowlist (host, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [exp.label, userId]);
    return `Marked ${exp.host} as safe. I won't alert you about it again.`;
  }
  // DISPUTE
  const a = await lastAlert(db, userId, "txn_id");
  if (!a) return "I don't see a linked charge to dispute yet. I'll text you when one shows up.";
  try {
    await createDispute(db, userId, a.meta.txn_id); // drafts only; nothing is filed or sent
  } catch (e) {
    if (e instanceof ApiError) return "That charge isn't linked to a risky site, so there's nothing to dispute yet.";
    throw e;
  }
  const host = getConfig().baseDomain.startsWith("localhost") ? getConfig().baseDomain : `bluff.${getConfig().baseDomain}`;
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `Your dispute packet is ready to review: ${proto}://${host}/charges/${a.meta.txn_id}`;
}

/**
 * Process one text sent to Bluff from the phone preview. Idempotent per message id.
 * The inbound body is never stored: it is discarded as soon as the verdict is produced.
 */
export async function handleInbound(db: pg.Pool, msg: InboundMessage, opts: { userId?: string } = {}): Promise<{ status: "duplicate" | "handled"; reply?: string }> {
  const user = opts.userId ? { id: opts.userId } : await one<{ id: string }>(db, "SELECT id FROM users WHERE phone=$1", [msg.from]);
  const ins = await db.query(
    "INSERT INTO messages (user_id, phone, direction, body, kind, provider_id, status) VALUES ($1,$2,'in','[discarded]','inbound',$3,'received') ON CONFLICT DO NOTHING RETURNING id",
    [user?.id ?? null, msg.from, msg.providerId],
  );
  if (!ins.rows[0]) return { status: "duplicate" };
  const c: Ctx = { db, msg, userId: user?.id ?? null, phone: msg.from };
  const text = msg.text.trim();

  const cmd = parseCommand(text);
  if (cmd) { const r = await runCommand(c, cmd); await reply(c, r); return { status: "handled", reply: r }; }

  let out: string;
  let verdictId: string | null = null;
  if (!text && msg.hasImage) out = "I can only read text for now. Paste the message or link and I'll check it.";
  else if (!text) out = "Send me a text or link to check, or HELP";
  else if (text.length > MAX_INBOUND_CHARS) out = `That's too long for me to check (${MAX_INBOUND_CHARS.toLocaleString("en-US")} character max). Paste the key part and try again.`;
  else if (!agentBucket.take(`sms:${msg.from}`).ok) out = "I'm overloaded, try again in a minute.";
  else {
    let holding: NodeJS.Timeout | undefined;
    holding = setTimeout(() => { void reply(c, "Checking… this one's taking a moment"); holding = undefined; }, holdingMs());
    try {
      const r = await runToCompletion({ kind: "message", userId: user?.id ?? (await guestUserId()), text, source: "sms" });
      verdictId = r.verdictId ?? null;
      out = verdictReply(r.verdict, { basic: r.mode === "basic" });
    } catch (e) {
      console.error("[inbound] check failed", (e as Error).message);
      out = "I couldn't check that one right now. Don't click links in it; try again in a minute.";
    } finally { if (holding) clearTimeout(holding); }
  }
  if (verdictId) await db.query("UPDATE messages SET verdict_id=$2 WHERE id=$1", [ins.rows[0].id, verdictId]);
  await reply(c, out, verdictId);
  return { status: "handled", reply: out };
}

/** Guests have no account; their checks run under the demo user's id for storage only (no account data is read). */
async function guestUserId(): Promise<string> {
  const { MAYA_ID } = await import("../config");
  return MAYA_ID;
}
