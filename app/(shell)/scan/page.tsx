import { ScanClient } from "@/components/scan/ScanClient";

export const metadata = { title: "Bank scan | Bluff" };
export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { start } = await searchParams;
  return <ScanClient autoStart={start === "1"} />;
}
