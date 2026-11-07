import { getConfig } from "../config";
import type { Sender } from "./send";

/**
 * Live Photon sender. [verify] The exact REST path/fields must be confirmed against Photon's docs (resources link on the
 * Devpost page); this follows the documented concept (project secret auth, `to`/`from`/`text`). Isolated here so only this
 * file changes if the shape differs.
 */
export const liveSender: Sender = {
  async send(phone, body) {
    const c = getConfig().photon;
    if (!c.apiBase || !c.projectSecret) throw new Error("Photon is not configured (PHOTON_API_BASE / PHOTON_PROJECT_SECRET)");
    const res = await fetch(`${c.apiBase.replace(/\/$/, "")}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", authorization: `Bearer ${c.projectSecret}` },
      body: JSON.stringify({ to: phone, from: c.number || undefined, text: body }),
    });
    if (!res.ok) throw new Error(`Photon send failed: ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { id?: string; message_id?: string };
    return { providerId: j.id ?? j.message_id ?? `photon_${Date.now()}` };
  },
};
