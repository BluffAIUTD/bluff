import { getPool } from "@/lib/db";
import { currentUserId } from "@/lib/server/currentUser";
import { loadOverview } from "@/lib/overview";
import { ErrorState } from "@/components/ui/ErrorState";
import { HomeView } from "@/components/home/HomeView";

export const metadata = { title: "Your card, watched" };
export const dynamic = "force-dynamic";

export default async function Home() {
  let o;
  try { o = await loadOverview(getPool(), await currentUserId()); }
  catch { return <ErrorState title="Couldn't load your card" message="The database isn't reachable. Try again in a moment." />; }
  return <HomeView o={o} />;
}
