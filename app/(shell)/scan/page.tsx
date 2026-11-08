import { ScanClient } from "@/components/scan/ScanClient";

export const metadata = { title: "Bank scan" };
export const dynamic = "force-dynamic";

/** /scan?push=<store> preselects a test-purchase preset (the Chrome extension links here); ?demo=1 opens that panel. */
export default async function ScanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const push = one(q.push)?.slice(0, 64) ?? null;
  return <ScanClient push={push} demo={one(q.demo) === "1"} />;
}
