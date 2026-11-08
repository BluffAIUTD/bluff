import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { listExposures } from "@/lib/exposures";
import { ExposureTimeline } from "@/components/exposure/ExposureTimeline";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata = { title: "Exposure Log | Bluff" };
export const dynamic = "force-dynamic";

export default async function ExposurePage() {
  let rows;
  try { rows = await listExposures(getPool(), MAYA_ID); }
  catch { return <ErrorState title="Couldn't load your Exposure Log" message="The database isn't reachable. Try again in a moment." />; }
  return (
    <div className="flex flex-col gap-6">
      <header className="max-w-2xl">
        <p className="label">Memory</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Exposure Log</h1>
        <p className="mt-2 text-dim">Every site where you told Bluff you entered personal info. Bluff only stores the domain and which kinds of fields, never what you typed.</p>
      </header>
      <ExposureTimeline initial={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
