"use client";
import { useEffect, useState } from "react";
import { formatCountdown } from "./text";

/** "Next Bluff in HH:MM:SS" to the server-provided next Chicago midnight (corrected for this device's clock skew). */
export function Countdown({ nextAt, serverNow }: { nextAt: string; serverNow: string }) {
  const target = Date.parse(nextAt);
  const [skew] = useState(() => Date.parse(serverNow) - Date.now());
  const [left, setLeft] = useState(() => target - (Date.now() + skew));
  useEffect(() => {
    setLeft(target - (Date.now() + skew));
    const id = setInterval(() => setLeft(target - (Date.now() + skew)), 1000);
    return () => clearInterval(id);
  }, [target, skew]);
  if (left <= 0) {
    return <p className="text-sm">A new puzzle is ready. <a href="/play" className="font-medium text-accent underline">Play today&apos;s Bluff</a></p>;
  }
  return (
    <p className="text-sm text-dim">
      Next Bluff in <time role="timer" dateTime={nextAt} className="num font-bold text-fg">{formatCountdown(left)}</time>
    </p>
  );
}
