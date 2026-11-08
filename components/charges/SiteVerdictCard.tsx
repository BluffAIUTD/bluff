import Link from "next/link";
import type { SiteCheck } from "@/lib/disputes";
import { longDateTime } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { ModeBadge, type RunMode } from "../ui/ModeBadge";

const STYLE = {
  likely_scam: { ring: "border-scam/50", title: "Merchant website looks like a scam", badge: <Badge tone="scam">Likely scam</Badge> },
  unsure: { ring: "border-unsure/50", title: "Merchant website looks risky", badge: <Badge tone="unsure">Unsure</Badge> },
  looks_ok: { ring: "brass-hairline", title: "Merchant website looks OK", badge: <Badge tone="safe">Looks OK</Badge> },
} as const;

const MODES: RunMode[] = ["live", "cached", "replayed", "basic"];
const pathOf = (url: string) => { try { const u = new URL(url); return u.pathname === "/" ? u.host : u.pathname; } catch { return url; } };

/** The bank scan's check of the website behind this charge: score, confidence and mode as given, findings with their pages. */
export function SiteVerdictCard({ site }: { site: SiteCheck }) {
  const s = STYLE[site.label] ?? STYLE.unsure;
  const basic = site.mode === "basic";
  return (
    <section aria-label="Merchant website check" className={`stitch flex flex-col gap-3 rounded-card border bg-surface p-4 sm:p-6 [&>*]:relative [&>*]:z-10 ${s.ring}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-sans text-lg font-bold tracking-tight">{s.title}</h2>
        {s.badge}
        <ModeBadge mode={MODES.includes(site.mode as RunMode) ? (site.mode as RunMode) : "basic"} />
      </div>
      <p className="text-sm text-dim">
        Bluff&apos;s bank scan checked <span className="break-all font-medium text-fg">{site.host}</span> on {longDateTime(site.checkedAt)}:
        score <span className="num font-bold text-fg">{site.score}</span>/100, {Math.round(site.confidence * 100)}% sure{basic ? ", rules only (no AI review)" : ""}.
      </p>
      {site.allowlisted && <p className="text-sm">You marked this site safe, so Bluff doesn&apos;t flag it.</p>}
      {site.findings.length > 0 && site.label !== "looks_ok" && (
        <ul aria-label="Warning signs" className="flex flex-col gap-2 text-sm">
          {site.findings.slice(0, 4).map((f, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rotate-45 rounded-[1px] bg-scam" />
              <div className="min-w-0">
                <p className="font-semibold">{f.title}</p>
                {f.detail && <p className="break-words text-dim">{f.detail}</p>}
                {f.page && <a href={f.page} target="_blank" rel="noopener noreferrer nofollow" className="inline-block max-w-full truncate font-mono text-xs text-brass underline">{pathOf(f.page)}</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/scan" className="self-start text-sm font-medium text-brass underline">See the full bank scan</Link>
    </section>
  );
}
