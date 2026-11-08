import { ScanClient } from "@/components/scan/ScanClient";

export const metadata = { title: "Bank scan — Bluff" };
export const dynamic = "force-dynamic";

export default function ScanPage() {
  return <ScanClient />;
}
