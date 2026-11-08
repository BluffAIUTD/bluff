import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { listExposures } from "@/lib/exposures";
import { ExposureTimeline } from "@/components/exposure/ExposureTimeline";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata = { title: "Exposure Log — Bluff" };
export const dynamic = "force-dynamic";

export default async function ExposurePage() {
  let rows;
  try { rows = await listExposures(getPool(), MAYA_ID); }
  catch { return <ErrorState title="Couldn't load your Exposure Log" message="The database isn't reachable. Try again in a moment." />; }
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b-2 border-ink pb-5">
        <p className="eyebrow">Register</p>
        <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Exposure Log</h1>
        <p className="max-w-2xl text-dim">Every site where you told Bluff you entered personal info. Bluff only stores the domain and which kinds of fields, never what you typed.</p>
      </header>
      <ExposureTimeline initial={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
