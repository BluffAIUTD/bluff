import { notFound } from "next/navigation";
import { getPool } from "@/lib/db";
import { currentUserId } from "@/lib/server/currentUser";
import { getTransactionDetail } from "@/lib/transactions";
import { disputeContext } from "@/lib/disputes";
import { getExposure } from "@/lib/exposures";
import { ChargeDetailClient, type Detail } from "@/components/charges/ChargeDetailClient";

export const dynamic = "force-dynamic";

export default async function ChargePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const { id } = await params;
  const { run } = await searchParams;
  const db = getPool();
  const userId = await currentUserId();
  const d = await getTransactionDetail(db, userId, id);
  if (!d) notFound();
  // Safe Signal: the dispute basis the server would use (so "Build dispute" and createDispute agree), the bank scan's check
  // of the merchant website, and whether the linked exposure is a reported scam text.
  const [ctx, exp] = await Promise.all([
    disputeContext(db, userId, id),
    d.best ? getExposure(db, userId, d.best.exposureId) : Promise.resolve(null),
  ]);
  // Dates are serialized across the server/client boundary.
  const detail = JSON.parse(JSON.stringify({
    ...d,
    best: d.best ? { ...d.best, via: exp?.user_action === "received_link" ? "text" : "entered" } : null,
    basis: ctx?.basis ?? null,
    siteCheck: ctx?.site ?? null,
  })) as Detail;
  return <ChargeDetailClient detail={detail} runId={run} />;
}
