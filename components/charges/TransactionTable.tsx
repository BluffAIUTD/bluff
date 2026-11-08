import Link from "next/link";
import { FlagBadge } from "../ui/FlagBadge";
import { EmptyState } from "../ui/EmptyState";
import { money, shortDate } from "@/lib/format";
import type { TransactionDto } from "@/lib/types";

const RISKY = new Set(["exposure_link", "card_test"]);

export function TransactionTable({ rows }: { rows: TransactionDto[] }) {
  if (!rows.length) {
    return <EmptyState title="No charges yet" hint="Simulate one from a store you checked, and Bluff will try to link it back." action={<Link href="/check" className="text-sm font-medium text-accent underline underline-offset-4">Check a store</Link>} />;
  }
  return (
    <ul className="panel divide-y divide-line overflow-hidden">
      {rows.map((t) => {
        const risky = t.flags.some((f) => RISKY.has(f));
        const warn = !risky && t.flags.some((f) => f !== "expected_charge");
        return (
          <li key={t.id}>
            <Link href={`/charges/${t.id}`} className="group relative flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition duration-ui hover:bg-surface2">
              <span aria-hidden className={`absolute inset-y-2 left-0 w-[3px] rounded-r ${risky ? "bg-scam shadow-[0_0_10px_var(--scam)]" : warn ? "bg-unsure" : "bg-transparent"}`} />
              <span className="mono w-14 shrink-0 text-xs text-dim">{shortDate(t.ts)}</span>
              <span className="mono min-w-0 flex-1 truncate text-sm">{t.descriptor}{t.source === "nessie" && <span className="ml-2 align-middle text-[10px] text-dim" title="Imported from Capital One (Nessie API)">Capital One{t.website ? ` · ${t.website}` : ""}</span>}</span>
              <span className="num text-sm font-medium">{money(t.amountCents)}</span>
              {t.flags.length > 0 && <span className="flex w-full flex-wrap gap-1 sm:w-auto">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
