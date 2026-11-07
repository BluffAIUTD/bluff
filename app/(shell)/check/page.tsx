import { CheckClient } from "@/components/check/CheckClient";

export const metadata = { title: "Check — Bluff" };

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store } = await searchParams;
  return <CheckClient initialStore={store} />;
}
