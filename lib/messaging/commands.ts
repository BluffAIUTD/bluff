export type Command = "WATCH" | "DISPUTE" | "SAFE" | "STOP" | "HELP";

/** Case-insensitive; only a message that is exactly a command word counts (so "stop the scam" is forwarded text, not STOP). */
export function parseCommand(text: string): Command | null {
  const t = text.trim().replace(/[.!]+$/, "").toUpperCase();
  return t === "WATCH" || t === "DISPUTE" || t === "SAFE" || t === "STOP" || t === "HELP" ? t : null;
}

export const HELP_TEXT = "Forward me any text or link and I'll check it. Replies: WATCH (watch charges from the last site I flagged), DISPUTE (get the dispute packet), SAFE (mark that site safe), STOP (pause alerts), HELP.";
