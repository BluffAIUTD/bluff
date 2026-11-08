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
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b-2 border-ink pb-5">
        <div className="max-w-2xl">
          <p className="eyebrow">Ledger</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Charges</h1>
          <p className="mt-2 text-dim"><span className="num text-fg">{rows.filter((r) => r.flags.length).length}</span> flagged of <span className="num text-fg">{rows.length}</span>. Capital One (Nessie sandbox) plus synthetic history. <Link href="/scan" className="font-medium text-accent underline underline-offset-4">Scan merchant websites</Link></p>
        </div>
        <div role="tablist" aria-label="Filter" className="flex border border-ink text-sm">
          <Link role="tab" aria-selected={!flaggedOnly} href={`/charges${demo === "1" ? "?demo=1" : ""}`} className={`min-h-[40px] px-4 py-2 ${!flaggedOnly ? "bg-ink font-semibold text-paper" : "text-dim hover:text-fg"}`}>All</Link>
          <Link role="tab" aria-selected={flaggedOnly} href={`/charges?f=flagged${q}`} className={`min-h-[40px] border-l border-ink px-4 py-2 ${flaggedOnly ? "bg-ink font-semibold text-paper" : "text-dim hover:text-fg"}`}>Flagged</Link>
        </div>
      </header>
      {demo === "1" && <DemoControls />}
      <TransactionTable rows={shown} />
    </div>
  );
}
