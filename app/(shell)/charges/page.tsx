import Link from "next/link";
import { getPool } from "@/lib/db";
import { currentUserId } from "@/lib/server/currentUser";
import { listTransactionsWithFlags } from "@/lib/rules/flags";
import { TransactionTable } from "@/components/charges/TransactionTable";
import { DemoControls } from "@/components/charges/DemoControls";
import { ErrorState } from "@/components/ui/ErrorState";

export const metadata = { title: "Charges" };
export const dynamic = "force-dynamic";

export default async function ChargesPage({ searchParams }: { searchParams: Promise<{ f?: string; demo?: string }> }) {
  const { f, demo } = await searchParams;
  let rows;
  try { rows = await listTransactionsWithFlags(getPool(), await currentUserId(), 100); }
  catch { return <ErrorState title="Couldn't load charges" message="The database isn't reachable. Try again in a moment." />; }
  const flaggedOnly = f === "flagged";
  const shown = flaggedOnly ? rows.filter((r) => r.flags.length > 0) : rows;
  const q = demo === "1" ? "&demo=1" : "";
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-tight sm:text-5xl">Charges</h1>
          <p className="text-dim">{rows.filter((r) => r.flags.length).length} flagged of {rows.length}. Capital One (Nessie sandbox) plus synthetic history. <Link href="/scan" className="font-medium text-brass underline">Scan merchant websites</Link></p>
        </div>
        <div role="tablist" aria-label="Filter" className="flex rounded-full border brass-hairline bg-black/25 p-1 text-sm">
          <Link role="tab" aria-selected={!flaggedOnly} href={`/charges${demo === "1" ? "?demo=1" : ""}`} className={`rounded-full px-4 py-2 font-semibold ${!flaggedOnly ? "seg-on" : "text-dim"}`}>All</Link>
          <Link role="tab" aria-selected={flaggedOnly} href={`/charges?f=flagged${q}`} className={`rounded-full px-4 py-2 font-semibold ${flaggedOnly ? "seg-on" : "text-dim"}`}>Flagged</Link>
        </div>
      </header>
      {demo === "1" && <DemoControls />}
      <TransactionTable rows={shown} />
    </div>
  );
}
