import { cookies } from "next/headers";
import { ensureAccount } from "../accounts";
import { getPool } from "../db";
import { COOKIE_UID, sessionFromCookie, userIdForSession } from "../session";

/**
 * The visitor's account id for server components, creating the account on first use. The middleware gives every
 * browser a signed session cookie before the page renders, so a missing cookie here means the request bypassed it.
 */
export async function currentUserId(): Promise<string> {
  const sessionId = sessionFromCookie((await cookies()).get(COOKIE_UID)?.value);
  if (!sessionId) throw new Error("No session cookie");
  const userId = userIdForSession(sessionId);
  await ensureAccount(getPool(), userId);
  return userId;
}
