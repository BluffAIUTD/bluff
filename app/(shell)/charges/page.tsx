import Link from "next/link";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { listTransactionsWithFlags } from "@/lib/rules/flags";
import { TransactionTable } from "@/components/charges/TransactionTable";
import { DemoControls } from "@/components/charges/DemoControls";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata = { title: "Charges" };
export const dynamic = "force-dynamic";

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ f?: string; demo?: string }> }) {
  const { f, demo } = await searchParams;
  let rows;
  try { rows = await listTransactionsWithFlags(getPool(), MAYA_ID, 100); }
  catch { return <ErrorState title="Couldn't load charges" message="The database isn't reachable. Try again in a moment." />; }
  const flaggedOnly = f === "flagged";
  const shown = flaggedOnly ? rows.filter((r) => r.flags.length > 0) : rows;
  const q = demo === "1" ? "&demo=1" : "";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Charges</h1>
          <p className="text-dim">{rows.filter((r) => r.flags.length).length} flagged of {rows.length}. Capital One (Nessie sandbox) plus synthetic history. <Link href="/scan" className="font-medium text-accent underline">Scan merchant websites</Link></p>
        </div>
        <div role="tablist" aria-label="Filter" className="flex rounded-control border border-line p-1 text-sm">
          <Link role="tab" aria-selected={!flaggedOnly} href={`/charges${demo === "1" ? "?demo=1" : ""}`} className={`rounded-control px-3 py-2 ${!flaggedOnly ? "bg-surface2 font-medium" : "text-dim"}`}>All</Link>
          <Link role="tab" aria-selected={flaggedOnly} href={`/charges?f=flagged${q}`} className={`rounded-control px-3 py-2 ${flaggedOnly ? "bg-surface2 font-medium" : "text-dim"}`}>Flagged</Link>
        </div>
      </header>
      {demo === "1" && <DemoControls />}
      <TransactionTable rows={shown} />
    </div>
  );
}
