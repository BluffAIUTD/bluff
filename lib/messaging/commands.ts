export const COMMANDS = ["WATCH", "DISPUTE", "SAFE", "HOLD", "UNHOLD", "STOP", "START", "HELP"] as const;
export type Command = (typeof COMMANDS)[number];

/** Case-insensitive; only a message that is exactly a command word counts (so "stop the scam" is forwarded text, not STOP). */
export function parseCommand(text: string): Command | null {
  const t = text.trim().replace(/[.!]+$/, "").toUpperCase();
  return (COMMANDS as readonly string[]).includes(t) ? (t as Command) : null;
}

export const HELP_TEXT = "Forward me any text or link and I'll check it. Replies: DISPUTE (draft a dispute for the charge I flagged), HOLD / UNHOLD (Safe Signal hold: pause new online charges, simulated), SAFE (you recognize that site), WATCH (watch charges from the last site I flagged), STOP / START (pause or resume alerts), HELP.";
