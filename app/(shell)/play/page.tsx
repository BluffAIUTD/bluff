import { GameClient } from "@/components/game/GameClient";

export const metadata = { title: "Call the Bluff — Bluff" };

export default async function PlayPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  return <GameClient day={d} />;
}
