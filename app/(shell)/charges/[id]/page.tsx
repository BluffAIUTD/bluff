import { notFound } from "next/navigation";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { getTransactionDetail } from "@/lib/transactions";
import { ChargeDetailClient, type Detail } from "@/components/charges/ChargeDetailClient";

export const dynamic = "force-dynamic";

export default async function ChargePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ run?: string }> }) {
  const { id } = await params;
  const { run } = await searchParams;
  const d = await getTransactionDetail(getPool(), MAYA_ID, id);
  if (!d) notFound();
  // Dates are serialized across the server/client boundary.
  const detail = JSON.parse(JSON.stringify(d)) as Detail;
  return <ChargeDetailClient detail={detail} runId={run} />;
}
