"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { FIELD_LABELS, longDateTime } from "@/lib/format";
import type { ExposureDto } from "@/lib/types";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { ScoreBadge } from "./ScoreBadge";

const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/Chicago" }).format(new Date(iso));

/**
 * Where your info went, newest first, grouped by day: sites where you entered info, and links from scam texts you reported
 * on the phone (only the link's site is kept). Watch toggle and delete per row.
 */
export function ExposureTimeline({ initial }: { initial: ExposureDto[] }) {
  const [rows, setRows] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, ExposureDto[]>();
    for (const r of rows) { const k = dayLabel(r.createdAt); m.set(k, [...(m.get(k) ?? []), r]); }
    return [...m.entries()];
  }, [rows]);

  async function toggle(r: ExposureDto) {
    setBusy(r.id); setErr(null);
    const before = rows;
    setRows((x) => x.map((e) => (e.id === r.id ? { ...e, watch: !e.watch } : e)));
    try { await api(`/api/exposures/${r.id}`, { method: "PATCH", json: { watch: !r.watch } }); }
    catch (e) { setRows(before); setErr(e instanceof ApiFailure ? e.message : "Couldn't update. Try again."); }
    finally { setBusy(null); }
  }

  async function remove(r: ExposureDto) {
    if (!confirm(`Remove ${r.host} from your Exposure Log?`)) return;
    setBusy(r.id); setErr(null);
    try { await api(`/api/exposures/${r.id}`, { method: "DELETE" }); setRows((x) => x.filter((e) => e.id !== r.id)); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't delete. Try again."); }
    finally { setBusy(null); }
  }

  if (!rows.length) {
    return <EmptyState title="No exposures yet" hint="When you tell Bluff you entered info on a site, or report a scam text with a link, it shows up here so later charges can be linked back." action={<Link href="/check" className="text-sm font-medium text-accent underline">Check a store</Link>} />;
  }
  return (
    <div className="flex flex-col gap-6">
      {err && <ErrorState message={err} />}
      {groups.map(([day, list]) => (
        <section key={day} aria-label={day} className="flex flex-col gap-2">
          <h2 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">{day}</h2>
          <ul className="flex flex-col gap-2">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.host}</p>
                  {r.userAction === "received_link"
                    ? <p className="text-sm text-dim">{longDateTime(r.createdAt)} · Link in a scam text you reported <span className="text-xs">(text discarded)</span></p>
                    : <p className="text-sm text-dim">{longDateTime(r.createdAt)} · {r.fieldTypes.map((f) => FIELD_LABELS[f] ?? f).join(", ") || "info"}</p>}
                </div>
                <ScoreBadge score={r.score} />
                <span className="text-sm text-dim">{r.linkedCount ? `${r.linkedCount} linked charge${r.linkedCount > 1 ? "s" : ""}` : "No linked charges"}</span>
                <label className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={r.watch} disabled={busy === r.id} onChange={() => toggle(r)} className="h-5 w-5 accent-[var(--accent)]" />
                  Watch
                </label>
                <Button variant="ghost" onClick={() => remove(r)} disabled={busy === r.id} aria-label={`Delete ${r.host}`}>Delete</Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
