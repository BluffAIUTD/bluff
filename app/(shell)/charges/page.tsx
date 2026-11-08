import Link from "next/link";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { listTransactionsWithFlags } from "@/lib/rules/flags";
import { TransactionTable } from "@/components/charges/TransactionTable";
import { DemoControls } from "@/components/charges/DemoControls";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata = { title: "Charges | Bluff" };
export const dynamic = "force-dynamic";

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ f?: string; demo?: string }> }) {
  const { f, demo } = await searchParams;
  let rows;
  try { rows = await listTransactionsWithFlags(getPool(), MAYA_ID, 100); }
  catch { return <ErrorState title="Couldn't load charges" message="The database isn't reachable. Try again in a moment." />; }
  const flaggedOnly = f === "flagged";
  const shown = flaggedOnly ? rows.filter((r) => r.flags.length > 0) : rows;
  const q = demo === "1" ? "&demo=1" : "";
  const flagged = rows.filter((r) => r.flags.length).length;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="label">Charge watch</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Charges</h1>
          <p className="mt-2 text-dim"><span className="num text-fg">{flagged}</span> flagged of <span className="num text-fg">{rows.length}</span>. Capital One (Nessie sandbox) plus synthetic history. <Link href="/scan" className="font-medium text-accent underline underline-offset-4">Scan merchant websites</Link></p>
        </div>
        <div role="tablist" aria-label="Filter" className="mono flex rounded-control border border-line2 bg-surface p-0.5 text-[12px]">
          <Link role="tab" aria-selected={!flaggedOnly} href={`/charges${demo === "1" ? "?demo=1" : ""}`} className={`min-h-[36px] rounded-[6px] px-3 py-2 ${!flaggedOnly ? "bg-surface3 text-fg" : "text-dim hover:text-fg"}`}>All</Link>
          <Link role="tab" aria-selected={flaggedOnly} href={`/charges?f=flagged${q}`} className={`min-h-[36px] rounded-[6px] px-3 py-2 ${flaggedOnly ? "bg-surface3 text-fg" : "text-dim hover:text-fg"}`}>Flagged</Link>
        </div>
      </header>
      {demo === "1" && <DemoControls />}
      <TransactionTable rows={shown} />
    </div>
  );
}
