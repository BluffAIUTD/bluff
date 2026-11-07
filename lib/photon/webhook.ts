import { createHmac, timingSafeEqual } from "node:crypto";

export type InboundMessage = { from: string; text: string; providerId: string; hasImage: boolean };

/** HMAC-SHA256 over the raw body, hex (optionally "sha256=" prefixed). [verify] header name + scheme against Photon docs. */
export function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const given = header.replace(/^sha256=/i, "").trim().toLowerCase();
  const want = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signBody(raw: string, secret: string) { return createHmac("sha256", secret).update(raw).digest("hex"); }

const first = (...v: unknown[]) => v.find((x): x is string => typeof x === "string" && x.length > 0);

/**
 * Tolerant payload parser. [verify] Photon's real inbound shape is unconfirmed, so common variants are accepted:
 * {from|sender|phone}, {text|body|message.text|message.body}, {id|message_id|messageId}, {attachments|media}.
 */
export function parseInbound(payload: unknown): InboundMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const m = (typeof o.message === "object" && o.message ? o.message : {}) as Record<string, unknown>;
  const data = (typeof o.data === "object" && o.data ? o.data : {}) as Record<string, unknown>;
  const from = first(o.from, o.sender, o.phone, m.from, data.from, data.sender);
  const text = first(o.text, o.body, m.text, m.body, data.text, data.body) ?? "";
  const providerId = first(o.id, o.message_id, o.messageId, m.id, data.id, data.message_id);
  const att = [o.attachments, o.media, m.attachments, data.attachments].find((x) => Array.isArray(x) && x.length) as unknown[] | undefined;
  if (!from || !providerId) return null;
  return { from, text, providerId, hasImage: !!att };
}
