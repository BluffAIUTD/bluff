import Link from "next/link";
import { FlagBadge } from "../ui/FlagBadge";
import { EmptyState } from "../ui/EmptyState";
import { money, shortDate } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";

export function TransactionTable({ rows }: { rows: TransactionDto[] }) {
  if (!rows.length) {
    return <EmptyState title="No charges yet" hint="Simulate one from a store you checked, and Bluff will try to link it back." action={<Link href="/check" className="text-sm font-medium text-accent underline">Check a store</Link>} />;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={`/charges/${t.id}`} className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition duration-ui hover:bg-surface2">
            <span className="num w-14 shrink-0 text-sm text-dim">{shortDate(t.ts)}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{t.descriptor}</span>
            <span className="num font-medium">{money(t.amountCents)}</span>
            {t.flags.length > 0 && <span className="flex w-full flex-wrap gap-1 sm:w-auto">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
