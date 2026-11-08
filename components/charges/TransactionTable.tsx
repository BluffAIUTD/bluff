import Link from "next/link";
import { FlagBadge } from "../ui/FlagBadge";
import { EmptyState } from "../ui/EmptyState";
import { money, shortDate } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";

export function TransactionTable({ rows }: { rows: TransactionDto[] }) {
  if (!rows.length) {
    return <EmptyState title="No charges yet" hint="Simulate one from a store you checked, and Bluff will try to link it back." action={<Link href="/check" className="text-sm font-medium text-accent underline underline-offset-4">Check a store</Link>} />;
  }
  return (
    <ul className="dossier divide-y divide-line">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={`/charges/${t.id}`} className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition duration-ui hover:bg-surface2/60 sm:px-5">
            <span className="num w-14 shrink-0 text-sm text-dim">{shortDate(t.ts)}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-bold">{t.descriptor}{t.source === "nessie" && <span className="ml-2 align-middle font-sans text-[11px] font-normal text-dim" title="Imported from Capital One (Nessie API)">Capital One{t.website ? ` · ${t.website}` : ""}</span>}</span>
            <span className="num text-[15px]">{money(t.amountCents)}</span>
            {t.flags.length > 0 && <span className="flex w-full flex-wrap gap-1 sm:w-auto">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
