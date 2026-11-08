import { getPool } from "@/lib/db";
import { currentUserId } from "@/lib/server/currentUser";
import { listExposures } from "@/lib/exposures";
import { ExposureTimeline } from "@/components/exposure/ExposureTimeline";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata = { title: "Exposure Log" };
export const dynamic = "force-dynamic";

export default async function ExposurePage() {
  let rows;
  try { rows = await listExposures(getPool(), await currentUserId()); }
  catch { return <ErrorState title="Couldn't load your Exposure Log" message="The database isn't reachable. Try again in a moment." />; }
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight">Exposure Log</h1>
        <p className="text-dim">Every site where you told Bluff you entered personal info. Bluff only stores the domain and which kinds of fields, never what you typed.</p>
      </header>
      <ExposureTimeline initial={JSON.parse(JSON.stringify(rows))} />
    </div>
  );
}
